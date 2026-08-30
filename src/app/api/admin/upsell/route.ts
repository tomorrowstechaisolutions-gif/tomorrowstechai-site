import { NextResponse } from "next/server";
import { getAdminUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { createUpsellCheckoutSession, stripeConfigured } from "@/lib/stripe/client";

export const runtime = "nodejs";

/**
 * Creates a payment link for a quoted upsell.
 *
 * The amount comes from the form, not the catalog — catalog prices are "from"
 * figures for reference. It is validated server-side anyway: an admin screen
 * is still a public endpoint once you know the URL.
 */
const MAX_CENTS = 5_000_000; // $50,000. A typo, not a sale.

export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Stripe isn't configured yet." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const catalogItemId = typeof body.catalogItemId === "string" ? body.catalogItemId : "";
  const leadId = typeof body.leadId === "string" && body.leadId ? body.leadId : null;
  const customerId =
    typeof body.customerId === "string" && body.customerId ? body.customerId : null;
  const amountCents = Number.isFinite(body.amountCents) ? Math.round(body.amountCents) : 0;

  if (!catalogItemId) {
    return NextResponse.json({ ok: false, error: "Pick something to sell." }, { status: 400 });
  }
  if (!leadId && !customerId) {
    return NextResponse.json({ ok: false, error: "No lead or customer." }, { status: 400 });
  }
  if (amountCents < 100 || amountCents > MAX_CENTS) {
    return NextResponse.json(
      { ok: false, error: "Enter an amount between $1 and $50,000." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: item } = await supabase
    .from("catalog_items")
    .select("id, name, description, billing, category, active")
    .eq("id", catalogItemId)
    .maybeSingle();

  if (!item || !item.active) {
    return NextResponse.json({ ok: false, error: "That item isn't available." }, { status: 404 });
  }

  // Who are we billing, and do they already exist in Stripe?
  let email = "";
  let stripeCustomerId: string | null = null;
  let resolvedLeadId = leadId;

  if (customerId) {
    const { data: customer } = await supabase
      .from("customers")
      .select("email, stripe_customer_id, lead_id")
      .eq("id", customerId)
      .maybeSingle();
    if (!customer) {
      return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 });
    }
    email = customer.email;
    stripeCustomerId = customer.stripe_customer_id;
    resolvedLeadId = resolvedLeadId ?? customer.lead_id;
  } else if (leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("email")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead?.email) {
      return NextResponse.json(
        { ok: false, error: "That lead has no email address." },
        { status: 400 }
      );
    }
    email = lead.email;
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      kind: "upsell",
      lead_id: resolvedLeadId,
      customer_id: customerId,
      catalog_item_id: item.id,
      amount_cents: amountCents,
      billing: item.billing,
      description: item.name,
      status: "draft",
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ ok: false, error: "Couldn't record the invoice." }, { status: 500 });
  }

  try {
    const checkout = await createUpsellCheckoutSession({
      invoiceId: invoice.id,
      leadId: resolvedLeadId,
      customerId,
      catalogItemId: item.id,
      name: item.name,
      description: item.description,
      amountCents,
      billing: item.billing as "one_time" | "monthly",
      email,
      stripeCustomerId,
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

    if (resolvedLeadId) {
      await supabase.from("lead_events").insert({
        lead_id: resolvedLeadId,
        type: "note",
        body: `Upsell link created — ${item.name}, $${(amountCents / 100).toFixed(2)}${
          item.billing === "monthly" ? "/month" : ""
        }.`,
        actor: session.admin.email,
      });
    }

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (err) {
    await supabase.from("invoices").update({ status: "void" }).eq("id", invoice.id);
    const message = err instanceof Error ? err.message : "Stripe request failed.";
    console.error("Upsell checkout failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
