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
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionSynced(event);
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

  // An upsell to someone who already bought. Different money, different
  // bookkeeping, and no new job — the work attaches to the one already open.
  if (m.kind === "upsell") {
    await handleUpsellPaid(event);
    return;
  }

  // A signed proposal being paid. It has its own bookkeeping — the proposal
  // row, its own invoice and a revenue line that says what it was for — and
  // deliberately does NOT open a job. Converting a paid proposal into a
  // project is an explicit admin action, because somebody still has to decide
  // the work is ready to start.
  if (m.kind === "proposal") {
    await handleProposalPaid(event);
    return;
  }

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


// ── Upsells ─────────────────────────────────────────────────────────────────

/**
 * A quoted extra — a CRM build, a retainer — paid by an existing customer or
 * by a lead buying it alongside the launch.
 *
 * Books an 'upsell' revenue event under the catalog item's own category, so
 * the campaign dashboard can show what an ad-sourced customer is worth over
 * time rather than only what they paid on day one. Monthly items also raise
 * the customer's MRR.
 */
async function handleUpsellPaid(event: StripeEvent) {
  const db = supabaseAdmin();
  const session = event.data.object;

  const sessionId = str(session, "id");
  const m = meta(session);
  const invoiceId = m.invoice_id || null;
  if (!invoiceId || !sessionId) return;

  const { data: invoice } = await db
    .from("invoices")
    .select("id, status, amount_cents, billing, lead_id, customer_id, catalog_item_id, description")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return;
  if (invoice.status === "paid") return; // Stripe redelivers

  const now = new Date().toISOString();
  const amount = num(session, "amount_total") || invoice.amount_cents;

  await db
    .from("invoices")
    .update({
      status: "paid",
      paid_at: now,
      stripe_session_id: sessionId,
      stripe_invoice_id: str(session, "invoice"),
      stripe_payment_intent: str(session, "payment_intent"),
    })
    .eq("id", invoice.id);

  // Category comes from the catalog item so the money lands in the right
  // bucket without the webhook needing to know what any of them mean.
  let category = "other";
  if (invoice.catalog_item_id) {
    const { data: item } = await db
      .from("catalog_items")
      .select("category")
      .eq("id", invoice.catalog_item_id)
      .maybeSingle();
    if (item?.category) category = item.category as string;
  }

  const { data: lead } = invoice.lead_id
    ? await db
        .from("leads")
        .select("campaign, utm_campaign")
        .eq("id", invoice.lead_id)
        .maybeSingle()
    : { data: null };

  await db.from("revenue_events").upsert(
    {
      customer_id: invoice.customer_id,
      lead_id: invoice.lead_id,
      kind: "upsell",
      category,
      description: invoice.description ?? "Upsell",
      amount_cents: amount,
      campaign: lead?.utm_campaign || lead?.campaign || null,
      occurred_at: now,
      external_id: `${sessionId}:upsell`,
    },
    { onConflict: "external_id", ignoreDuplicates: true }
  );

  // A retainer raises what this customer is worth every month from now on.
  if (invoice.billing === "monthly" && invoice.customer_id) {
    const { data: customer } = await db
      .from("customers")
      .select("mrr_cents")
      .eq("id", invoice.customer_id)
      .maybeSingle();
    if (customer) {
      await db
        .from("customers")
        .update({ mrr_cents: (customer.mrr_cents ?? 0) + amount })
        .eq("id", invoice.customer_id);
    }
  }

  if (invoice.lead_id) {
    await db.from("lead_events").insert({
      lead_id: invoice.lead_id,
      type: "revenue",
      body: `Upsell paid — ${invoice.description ?? "extra work"}.`,
      actor: "stripe",
    });
  }
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

  // A customer can have more than one subscription — hosting, plus any
  // monthly retainer they bought later. Both raise invoice.paid, so the
  // subscription's own metadata decides which bucket this month belongs in.
  // Without this, a $750 ad-management retainer would be filed as hosting.
  const subDetails = invoice.subscription_details as
    | { metadata?: Record<string, string> }
    | undefined;
  const subMeta = subDetails?.metadata ?? {};

  let category = "hosting";
  let description = "Hosting";

  if (subMeta.kind === "upsell" && subMeta.catalog_item_id) {
    const { data: item } = await db
      .from("catalog_items")
      .select("name, category")
      .eq("id", subMeta.catalog_item_id)
      .maybeSingle();
    if (item) {
      category = item.category as string;
      description = item.name as string;
    }
  }

  await db.from("revenue_events").upsert(
    {
      customer_id: customer.id,
      lead_id: customer.lead_id,
      kind: "recurring",
      category,
      description,
      amount_cents: amountPaid,
      occurred_at: new Date().toISOString(),
      external_id: stripeInvoiceId,
    },
    { onConflict: "external_id", ignoreDuplicates: true }
  );
}

/**
 * Keeps the client record's subscription facts true.
 *
 * This is where the renewal date on the Clients screen comes from. It is read
 * off the subscription itself rather than guessed by adding a month to the
 * last payment, because a trial, a paused month or a proration all move the
 * real date and a guessed one would quietly drift.
 *
 * Only the subscription a customer row already points at is synced. A client
 * can hold two — hosting plus a monthly retainer — and letting the second one
 * overwrite `renews_at` would show the wrong date and the wrong amount. It is
 * also what keeps another storefront on this shared Stripe account from
 * touching this CRM: no matching row, no write.
 */
async function handleSubscriptionSynced(event: StripeEvent) {
  const db = supabaseAdmin();
  const subscription = event.data.object;

  const subscriptionId = str(subscription, "id");
  if (!subscriptionId) return;

  const { data: customer } = await db
    .from("customers")
    .select("id, status")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (!customer) return;

  // Stripe moved current_period_end onto the subscription ITEM in the 2025
  // API versions and kept it on the subscription in older ones. Read both so
  // this does not silently stop working on an API version bump.
  const items = (subscription.items as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];

  let periodEnd = num(subscription, "current_period_end");
  if (!periodEnd) {
    for (const item of items) {
      const itemEnd = num(item, "current_period_end");
      if (itemEnd > periodEnd) periodEnd = itemEnd;
    }
  }

  // What it will actually bill: recurring line items only. A one-off line
  // sitting on the first invoice is not part of the monthly figure.
  let recurringCents = 0;
  for (const item of items) {
    const price = item.price as Record<string, unknown> | undefined;
    if (!price || !price.recurring) continue;
    const unit = num(price, "unit_amount");
    const quantity = Math.max(num(item, "quantity"), 1);
    recurringCents += unit * quantity;
  }

  const stripeStatus = str(subscription, "status") ?? "";

  // customers.status has three values. Anything Stripe is still expecting
  // money from is "paused", not "churned" — churn is final and feeds the
  // MRR figure, so a card that failed once must not look like a lost client.
  const status =
    stripeStatus === "trialing" || stripeStatus === "active"
      ? "active"
      : stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
        ? "churned"
        : "paused";

  const patch: Record<string, unknown> = {
    status,
    renews_at: periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : null,
    renewal_amount_cents: recurringCents,
    // The contracted monthly rate, taken from what Stripe will really charge
    // rather than from the price the landing page happened to print.
    mrr_cents: status === "churned" ? 0 : recurringCents,
  };

  if (status === "churned" && customer.status !== "churned") {
    patch.churned_at = new Date().toISOString();
  }

  await db.from("customers").update(patch).eq("id", customer.id);
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

// ── Proposal payment ────────────────────────────────────────────────────────

/**
 * Money against a signed proposal.
 *
 * Idempotent on two keys, because Stripe redelivers: the invoice row refuses
 * to be marked paid twice, and revenue_events dedupes on external_id. What is
 * booked is what Stripe says was collected, never the proposal's asking price.
 */
async function handleProposalPaid(event: StripeEvent) {
  const db = supabaseAdmin();
  const session = event.data.object;

  const sessionId = str(session, "id");
  const m = meta(session);
  const proposalId = m.proposal_id || null;
  const invoiceId = m.invoice_id || null;
  if (!proposalId || !invoiceId) return;

  const amountTotal = num(session, "amount_total");
  const now = new Date().toISOString();

  const { data: proposalRow } = await db
    .from("proposals")
    .select("id, proposal_number, title, status, total_cents, amount_paid_cents, lead_id, customer_id, client_business_name")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposalRow) return;

  const { data: invoiceRow } = await db
    .from("invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .maybeSingle();

  // A replay of an event already booked.
  if (invoiceRow && invoiceRow.status === "paid") return;

  if (invoiceRow) {
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

  const paidSoFar = Number(proposalRow.amount_paid_cents ?? 0) + amountTotal;
  const settled = paidSoFar >= Number(proposalRow.total_cents ?? 0);

  await db
    .from("proposals")
    .update({
      status: "paid",
      paid_at: now,
      amount_paid_cents: paidSoFar,
      stripe_session_id: sessionId,
    })
    .eq("id", proposalId);

  await db.from("proposal_events").insert({
    proposal_id: proposalId,
    event_type: "paid",
    body: `Stripe collected ${(amountTotal / 100).toFixed(2)} USD.${settled ? " The one-time amount is now settled in full." : " A balance remains."}`,
    actor: "stripe",
    metadata: { session_id: sessionId, amount_cents: amountTotal, settled },
  });

  await db.from("revenue_events").upsert(
    {
      customer_id: proposalRow.customer_id ?? null,
      lead_id: proposalRow.lead_id ?? null,
      kind: "initial",
      category: "launch_package",
      description: `Proposal ${proposalRow.proposal_number} — ${proposalRow.title}`,
      amount_cents: amountTotal,
      occurred_at: now,
      external_id: `${sessionId}:proposal`,
    },
    { onConflict: "external_id", ignoreDuplicates: true }
  );

  if (proposalRow.lead_id) {
    await db.from("lead_events").insert({
      lead_id: proposalRow.lead_id,
      type: "revenue",
      body: `Proposal ${proposalRow.proposal_number} paid — ${(amountTotal / 100).toFixed(2)} USD.`,
      actor: "stripe",
      meta: { proposal_id: proposalId, session_id: sessionId },
    });
  }
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
