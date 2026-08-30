import { NextResponse } from "next/server";
import { getAdminUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe/client";
import { OFFER_PRICE_CENTS, HOSTING_FROM_CENTS } from "@/lib/campaign/config";

export const runtime = "nodejs";

/**
 * Creates the payment link for a lead and records that we sent it.
 *
 * Admin only. This is what "closing" a lead means mechanically: an invoices
 * row is written first so the Stripe session has something to point back at,
 * then the lead moves to Proposal/Checkout Sent. If Stripe fails the invoice
 * row is marked void rather than left looking sent — the pipeline must never
 * claim a link went out that didn't.
 *
 * Writes go through the request-scoped client so RLS applies. The service
 * role belongs to the webhook, not here.
 */
export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Stripe isn't configured yet. Add STRIPE_SECRET_KEY." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const leadId = body && typeof body.leadId === "string" ? body.leadId : "";
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "Missing lead." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, first_name, last_name, email, business_name, lead_status")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }
  if (!lead.email) {
    return NextResponse.json(
      { ok: false, error: "This lead has no email address to send a link to." },
      { status: 400 }
    );
  }

  // Reuse a link we already sent rather than stacking up half-paid sessions.
  const { data: open } = await supabase
    .from("invoices")
    .select("id, checkout_url, status")
    .eq("lead_id", leadId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open?.checkout_url) {
    return NextResponse.json({ ok: true, url: open.checkout_url, reused: true });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      lead_id: leadId,
      launch_cents: OFFER_PRICE_CENTS,
      hosting_cents: HOSTING_FROM_CENTS,
      status: "draft",
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json(
      { ok: false, error: "Couldn't record the invoice." },
      { status: 500 }
    );
  }

  try {
    const checkout = await createCheckoutSession({
      leadId,
      invoiceId: invoice.id,
      email: lead.email,
      businessName: lead.business_name,
    });

    if (!checkout.url) throw new Error("Stripe returned no checkout URL.");

    await supabase
      .from("invoices")
      .update({
        stripe_session_id: checkout.id,
        checkout_url: checkout.url,
        status: "sent",
        sent_at: new Date().toISOString(),
        expires_at: checkout.expires_at
          ? new Date(checkout.expires_at * 1000).toISOString()
          : null,
      })
      .eq("id", invoice.id);

    // Only advance the pipeline; never walk a Won lead backwards.
    if (lead.lead_status !== "Won") {
      await supabase
        .from("leads")
        .update({ lead_status: "Proposal/Checkout Sent" })
        .eq("id", leadId);

      await supabase.from("lead_events").insert({
        lead_id: leadId,
        type: "status_change",
        body: "Payment link created. Status set to Proposal/Checkout Sent.",
        actor: session.admin.email,
      });
    }

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (err) {
    await supabase.from("invoices").update({ status: "void" }).eq("id", invoice.id);

    const message = err instanceof Error ? err.message : "Stripe request failed.";
    console.error("Checkout create failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
