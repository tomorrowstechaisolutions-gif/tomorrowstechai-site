import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { verifyStripeSignature, stripeWebhookConfigured } from "@/lib/stripe/client";
import { cancelPendingFollowups } from "@/lib/campaign/intake";
import { sendCapiEvent } from "@/lib/meta/capi";
import { OFFER_PRICE_CENTS, HOSTING_FROM_CENTS, CAMPAIGN_NAME } from "@/lib/campaign/config";
import { DEFAULT_JOB_TASKS, dueDateFrom, PROMISED_DAYS } from "@/lib/jobs/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only place a lead becomes a customer.
 *
 * Every write here is idempotent, because Stripe retries until it gets a 2xx
 * and will redeliver the same event. Money is deduplicated on
 * revenue_events.external_id; the job is deduplicated on invoice_id.
 *
 * Runs on the service role, which bypasses RLS. That is safe only because
 * nothing past the signature check is trusted — an unverified request is
 * dropped before it can touch a row.
 */

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function str(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v ? v : null;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function meta(o: Record<string, unknown>): Record<string, string> {
  const m = o.metadata;
  return m && typeof m === "object" ? (m as Record<string, string>) : {};
}

export async function POST(req: Request) {
  // Raw body, before any parsing — the signature is over the exact bytes.
  const raw = await req.text();

  if (!stripeWebhookConfigured() || !supabaseConfigured()) {
    // Dormant until configured. 200 so Stripe doesn't retry forever.
    return NextResponse.json({ ok: true, skipped: "not configured" });
  }

  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionCancelled(event);
        break;
      default:
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient fault.
    console.error(`Stripe webhook ${event.type} failed:`, err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── The sale ────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(event: StripeEvent) {
  const db = supabaseAdmin();
  const session = event.data.object;

  const sessionId = str(session, "id");
  const m = meta(session);
  const leadId = m.lead_id || null;
  const invoiceId = m.invoice_id || null;

  // This Stripe account is shared with the other storefronts, and Stripe
  // delivers every checkout.session.completed to every endpoint subscribed to
  // it. Without this guard a t-shirt order from another site would create a
  // customer in this CRM, book its total as launch_package revenue against
  // the ad campaign, and open a website build job for someone who bought a
  // hat. Our own sessions always carry both ids — anything else is not ours.
  if (!leadId || !invoiceId) return;
  const stripeCustomerId = str(session, "customer");
  const stripeSubscriptionId = str(session, "subscription");
  const amountTotal = num(session, "amount_total");

  const details = session.customer_details as Record<string, unknown> | undefined;
  const email =
    (details ? str(details, "email") : null) || str(session, "customer_email");

  const now = new Date().toISOString();

  // 1. Mark the invoice paid. Bail out early on a replay.
  //    Named type, not `typeof invoiceRow` — control-flow narrowing collapses
  //    that to `null` at the assignment and the property reads stop compiling.
  type InvoiceRef = { id: string; status: string };
  let invoiceRow: InvoiceRef | null = null;

  {
    const { data } = await db
      .from("invoices")
      .select("id, status")
      .eq("id", invoiceId)
      .maybeSingle();
    invoiceRow = (data as InvoiceRef | null) ?? null;
  }

  // A lead_id we never issued, or an invoice row that has since been deleted.
  // Either way this is not a sale of ours to record.
  if (!invoiceRow) return;

  // Stripe redelivers. Booking this twice would double the revenue.
  if (invoiceRow.status === "paid") return;

  {
    await db
      .from("invoices")
      .update({
        status: "paid",
        paid_at: now,
        stripe_session_id: sessionId,
        stripe_invoice_id: str(session, "invoice"),
        stripe_payment_intent: str(session, "payment_intent"),
      })
      .eq("id", invoiceRow.id);
  }

  // 2. The lead becomes a customer.
  const lead = leadId
    ? (
        await db
          .from("leads")
          .select("id, first_name, last_name, email, phone, business_name, campaign, utm_campaign, lead_status")
          .eq("id", leadId)
          .maybeSingle()
      ).data
    : null;

  let customerId: string | null = null;

  const { data: existingCustomer } = await db
    .from("customers")
    .select("id")
    .or(
      [
        `lead_id.eq.${leadId}`,
        stripeCustomerId ? `stripe_customer_id.eq.${stripeCustomerId}` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
    .limit(1)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id as string;
    await db
      .from("customers")
      .update({
        status: "active",
        // The contracted rate. Collected money lives in revenue_events; this
        // is what they will pay once the trial ends.
        mrr_cents: HOSTING_FROM_CENTS,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      })
      .eq("id", customerId);
  } else {
    const { data: created } = await db
      .from("customers")
      .insert({
        lead_id: leadId,
        name: lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() : null,
        business_name: lead?.business_name ?? m.business_name ?? null,
        email: email || lead?.email || "unknown@unknown.invalid",
        phone: lead?.phone ?? null,
        status: "active",
        won_at: now,
        mrr_cents: HOSTING_FROM_CENTS,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      })
      .select("id")
      .single();
    customerId = created?.id ?? null;
  }

  // 3. Revenue — only what was actually collected today.
  //
  //    Hosting is on a 30-day trial, so nothing recurring is charged now.
  //    Booking a hypothetical $29 here would overstate LTV against ad spend
  //    for every customer who cancels during the trial. The first hosting
  //    payment is written by handleInvoicePaid when Stripe really charges it.
  const campaign = lead?.utm_campaign || lead?.campaign || null;
  const launchCents = amountTotal > 0 ? amountTotal : OFFER_PRICE_CENTS;

  await db.from("revenue_events").upsert(
    {
      customer_id: customerId,
      lead_id: leadId,
      kind: "initial",
      category: "launch_package",
      description: `${CAMPAIGN_NAME} — one-time launch`,
      amount_cents: launchCents,
      campaign,
      occurred_at: now,
      external_id: `${sessionId}:launch`,
    },
    { onConflict: "external_id", ignoreDuplicates: true }
  );

  // 4. Close the lead out.
  if (leadId && lead && lead.lead_status !== "Won") {
    await db
      .from("leads")
      .update({ lead_status: "Won", closed_at: now })
      .eq("id", leadId);

    await db.from("lead_events").insert({
      lead_id: leadId,
      type: "revenue",
      body: `Paid. Status set to Won.`,
      actor: "stripe",
    });

    await cancelPendingFollowups(leadId, "status:Won");
  }

  // 5. Open the job. Unique on invoice_id, so a replay can't open a second.
  if (customerId) {
    await openJob({
      customerId,
      leadId,
      invoiceId: invoiceRow.id,
      businessName: lead?.business_name ?? m.business_name ?? null,
      name: lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() : null,
    });
  }

  // 6. Tell Meta the click turned into money, so the campaign can optimise
  //    on the thing that actually matters rather than on form fills.
  await sendCapiEvent({
    eventName: "Purchase",
    eventId: `purchase:${sessionId}`,
    eventSourceUrl: null,
    actionSource: "website",
    user: {
      email: email || lead?.email || null,
      phone: lead?.phone ?? null,
      firstName: lead?.first_name ?? null,
      lastName: lead?.last_name ?? null,
      country: "us",
      externalId: customerId,
    },
    customData: {
      content_name: CAMPAIGN_NAME,
      value: launchCents / 100,
      currency: "USD",
    },
  }).catch(() => {
    // Meta being down must never fail the sale.
  });
}

// ── Later months ────────────────────────────────────────────────────────────

async function handleInvoicePaid(event: StripeEvent) {
  const db = supabaseAdmin();
  const invoice = event.data.object;

  // The first invoice is booked by checkout.session.completed above.
  if (str(invoice, "billing_reason") !== "subscription_cycle") return;

  const stripeInvoiceId = str(invoice, "id");
  const stripeCustomerId = str(invoice, "customer");
  const amountPaid = num(invoice, "amount_paid");
  if (!stripeInvoiceId || !stripeCustomerId || amountPaid <= 0) return;

  const { data: customer } = await db
    .from("customers")
    .select("id, lead_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (!customer) return;

  await db.from("revenue_events").upsert(
    {
      customer_id: customer.id,
      lead_id: customer.lead_id,
      kind: "recurring",
      category: "hosting",
      description: "Hosting & management",
      amount_cents: amountPaid,
      occurred_at: new Date().toISOString(),
      external_id: stripeInvoiceId,
    },
    { onConflict: "external_id", ignoreDuplicates: true }
  );
}

async function handleSubscriptionCancelled(event: StripeEvent) {
  const db = supabaseAdmin();
  const subscription = event.data.object;
  const stripeCustomerId = str(subscription, "customer");
  if (!stripeCustomerId) return;

  await db
    .from("customers")
    .update({
      status: "churned",
      churned_at: new Date().toISOString(),
      mrr_cents: 0,
    })
    .eq("stripe_customer_id", stripeCustomerId);
}

// ── Delivery ────────────────────────────────────────────────────────────────

async function openJob(opts: {
  customerId: string;
  leadId: string | null;
  invoiceId: string | null;
  businessName: string | null;
  name: string | null;
}) {
  const db = supabaseAdmin();

  if (opts.invoiceId) {
    const { data: already } = await db
      .from("jobs")
      .select("id")
      .eq("invoice_id", opts.invoiceId)
      .maybeSingle();
    if (already) return;
  }

  const started = new Date();
  const title = opts.businessName || opts.name || "New launch";

  const { data: job } = await db
    .from("jobs")
    .insert({
      customer_id: opts.customerId,
      lead_id: opts.leadId,
      invoice_id: opts.invoiceId,
      title,
      business_name: opts.businessName,
      stage: "Intake",
      package: "launch_package",
      promised_days: PROMISED_DAYS,
      started_at: started.toISOString(),
      due_at: dueDateFrom(started),
    })
    .select("id")
    .single();

  if (!job) return;

  await db.from("job_tasks").insert(
    DEFAULT_JOB_TASKS.map((task, index) => ({
      job_id: job.id,
      stage: task.stage,
      label: task.label,
      position: index,
    }))
  );

  await db.from("job_events").insert({
    job_id: job.id,
    kind: "payment",
    body: "Payment received. Job opened at Intake.",
    to_stage: "Intake",
    actor: "stripe",
  });
}
