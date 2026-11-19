import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { verifyStripeSignature, stripeWebhookConfigured } from "@/lib/stripe/client";
import { cancelPendingFollowups } from "@/lib/campaign/intake";
import { sendCapiEvent } from "@/lib/meta/capi";
import { OFFER_PRICE_CENTS, HOSTING_FROM_CENTS, CAMPAIGN_NAME } from "@/lib/campaign/config";
import { DEFAULT_JOB_TASKS, dueDateFrom, PROMISED_DAYS } from "@/lib/jobs/config";
import { sendBillingChangeAlert } from "@/lib/portal/emails";
import { notifyAdminInvoice } from "@/lib/invoices/emails";
import type { Invoice } from "@/lib/invoices/types";

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
  data: { object: Record<string, unknown>; previous_attributes?: Record<string, unknown> };
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

  if (m.kind === "sticker_order") {
    await handleStickerOrderPaid(event);
    return;
  }

  // An upsell to someone who already bought. Different money, different
  // bookkeeping, and no new job — the work attaches to the one already open.
  if (m.kind === "upsell") {
    await handleUpsellPaid(event);
    return;
  }

  // An invoice being paid from its own client page. Like the proposal branch
  // it has its own bookkeeping and deliberately does NOT open a job — by the
  // time an invoice is raised the work has usually already been done.
  if (m.kind === "invoice") {
    await handleInvoiceDocumentPaid(event);
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

async function handleStickerOrderPaid(event: StripeEvent) {
  const db = supabaseAdmin();
  const session = event.data.object;
  const sessionId = str(session, "id");
  const orderId = meta(session).order_id;
  if (!sessionId || !orderId) return;

  const { data: order } = await db
    .from("sticker_orders")
    .select("id, status, total")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status === "paid") return;

  const amountTotal = num(session, "amount_total");
  const expectedCents = Math.round(Number(order.total) * 100);
  if (amountTotal < expectedCents) {
    throw new Error(`Sticker order ${orderId} payment did not cover the trusted order total.`);
  }

  const details = session.customer_details as Record<string, unknown> | undefined;
  const shipping = session.shipping_details as Record<string, unknown> | undefined;
  const customerEmail = (details ? str(details, "email") : null) || str(session, "customer_email");
  const { error } = await db
    .from("sticker_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: sessionId,
      stripe_payment_intent: str(session, "payment_intent"),
      stripe_customer_id: str(session, "customer"),
      customer_email: customerEmail,
      shipping_details: shipping ?? null,
    })
    .eq("id", orderId);
  if (error) throw error;
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

  // A subscription started from an invoice page carries the invoice id in its
  // metadata. If it arrives before checkout.session.completed has linked it,
  // link it here so the client record and the service don't miss this event.
  const subMeta = meta(subscription);
  if (subMeta.kind === "invoice" && subMeta.invoice_id) {
    await linkInvoiceSubscription(subMeta.invoice_id, str(subscription, "customer"), subscriptionId);
  }

  await syncLinkedServices(event);

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
  const subscriptionId = str(subscription, "id");
  const stripeCustomerId = str(subscription, "customer");
  if (!stripeCustomerId) return;

  // The services this subscription paid for are over.
  let endedFor: { customerId: string; names: string[] } | null = null;
  if (subscriptionId) {
    const { data: ended } = await db
      .from("client_services")
      .update({ status: "ended", billing_status: "cancelled", end_date: chicagoDay(new Date()), next_billing_date: null })
      .eq("subscription_id", subscriptionId)
      .neq("status", "ended")
      .select("customer_id, catalog_items(name)");
    if (ended?.length) endedFor = { customerId: ended[0].customer_id as string, names: serviceNames(ended) };
  }

  // Churn the client only when nothing else is still running for them. A
  // client can cancel one add-on and keep their hosting, and a client whose
  // record points at a different subscription is not affected by this one.
  const { data: customers } = await db
    .from("customers")
    .select("id, business_name, name, stripe_subscription_id")
    .eq("stripe_customer_id", stripeCustomerId);
  for (const c of customers ?? []) {
    if (c.stripe_subscription_id && subscriptionId && c.stripe_subscription_id !== subscriptionId) continue;
    const { count } = await db
      .from("client_services")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", c.id)
      .eq("status", "active")
      .eq("billing_type", "recurring");
    if ((count ?? 0) > 0) continue;
    await db
      .from("customers")
      .update({ status: "churned", churned_at: new Date().toISOString(), mrr_cents: 0 })
      .eq("id", c.id);
  }

  if (endedFor) {
    const owner = endedFor.customerId;
    const { data: c } = await db.from("customers").select("business_name, name").eq("id", owner).maybeSingle();
    await sendBillingChangeAlert({
      kind: "ended",
      businessName: c?.business_name || c?.name || "A client",
      services: endedFor.names,
      endsOn: null,
      reason: cancellationReason(subscription),
      customerId: owner,
    });
  }
}

// ── Member portal billing ───────────────────────────────────────────────────

function chicagoDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function serviceNames(rows: { catalog_items?: unknown }[]): string[] {
  return rows
    .map((r) => {
      const c = Array.isArray(r.catalog_items) ? r.catalog_items[0] : r.catalog_items;
      return (c as { name?: string } | null)?.name ?? null;
    })
    .filter((n): n is string => Boolean(n));
}

function cancellationReason(subscription: Record<string, unknown>): string | null {
  const d = subscription.cancellation_details as { feedback?: string | null; comment?: string | null } | undefined;
  const parts = [d?.feedback?.replace(/_/g, " "), d?.comment].filter(Boolean);
  return parts.length ? parts.join(": ").slice(0, 500) : null;
}

/**
 * Ties a Stripe subscription, started by paying an invoice, back to the
 * client record and the service it pays for. Without this the client could
 * never manage billing from the member portal, and a cancellation in Stripe
 * would never reach the service. Safe to run more than once.
 *
 * Only fills empty fields: an existing Stripe id on the client is never
 * overwritten, and a service already tied to a subscription is left alone.
 * The service is linked only when it can be identified without guessing:
 * the client's one active, unlinked recurring service, or the one whose price
 * matches the invoice's recurring amount.
 */
async function linkInvoiceSubscription(invoiceId: string, stripeCustomerId: string | null, subscriptionId: string | null) {
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("customer_id, recurring_cents, recurring_interval, total_cents, amount_paid_cents, currency, invoice_number, client_business_name, client_contact_name, client_email").eq("id", invoiceId).maybeSingle();
  const customerId = (inv?.customer_id as string | null) ?? null;
  if (!customerId) return;

  const { data: c } = await db.from("customers").select("stripe_customer_id, stripe_subscription_id").eq("id", customerId).maybeSingle();
  if (!c) return;
  const sameStripeCustomer = !c.stripe_customer_id || c.stripe_customer_id === stripeCustomerId;
  const patch: Record<string, unknown> = {};
  if (!c.stripe_customer_id && stripeCustomerId) patch.stripe_customer_id = stripeCustomerId;
  if (!c.stripe_subscription_id && subscriptionId && sameStripeCustomer) patch.stripe_subscription_id = subscriptionId;
  if (Object.keys(patch).length) await db.from("customers").update(patch).eq("id", customerId);

  if (!subscriptionId) return;
  await stampMonthlyOnlyInvoicePaid(invoiceId);
  const { data: already } = await db.from("client_services").select("id").eq("subscription_id", subscriptionId).limit(1);
  if (already?.length) return;

  const { data: candidates } = await db
    .from("client_services")
    .select("id, sale_price_cents")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .eq("billing_type", "recurring")
    .is("subscription_id", null);
  const list = candidates ?? [];
  const priceMatches = list.filter((s) => Number(s.sale_price_cents ?? -1) === Number(inv?.recurring_cents ?? -2));
  const pick = list.length === 1 ? list[0] : priceMatches.length === 1 ? priceMatches[0] : null;
  if (pick) {
    await db.from("client_services").update({ subscription_id: subscriptionId, billing_status: "active" }).eq("id", pick.id);
    // A monthly-only invoice has no one-off payment to report, so this is the
    // moment John hears it was paid: the subscription is now charging.
    if (Number(inv?.total_cents ?? 0) <= 0 && Number(inv?.recurring_cents ?? 0) > 0) {
      try {
        const per = inv?.recurring_interval ?? "month";
        await notifyAdminInvoice("paid", inv as unknown as Invoice, `Subscription started: $${(Number(inv?.recurring_cents) / 100).toFixed(2)}/${per}, now charging automatically.`);
      } catch (err) {
        console.error("Subscription started notification failed:", err);
      }
    }
  }
}

/**
 * A monthly-only invoice is finished once its subscription exists.
 *
 * Its one-time total is zero, so the payments trigger can never move it to
 * `paid` (it needs a total above zero to compare against, and would leave it
 * `sent`, or `partial` once the first month is collected). Left like that, the
 * client's page would keep offering to start the subscription again. Only
 * touches an open invoice with nothing on the one-time side. Safe to repeat.
 */
async function stampMonthlyOnlyInvoicePaid(invoiceId: string) {
  const db = supabaseAdmin();
  await db
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .lte("total_cents", 0)
    .gt("recurring_cents", 0)
    .in("status", ["sent", "partial"]);
}

/**
 * Mirrors a subscription's state onto the services it pays for: billing
 * status, the next billing date, and a scheduled cancellation as an end
 * date (the service stays active until then). Emails John when a client
 * schedules or undoes a cancellation from the billing page.
 */
async function syncLinkedServices(event: StripeEvent) {
  const db = supabaseAdmin();
  const subscription = event.data.object;
  const subscriptionId = str(subscription, "id");
  if (!subscriptionId) return;

  const { data: linked } = await db
    .from("client_services")
    .select("id, customer_id, status, catalog_items(name)")
    .eq("subscription_id", subscriptionId);
  if (!linked?.length) return;

  const items = (subscription.items as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  let periodEnd = num(subscription, "current_period_end");
  for (const item of items) periodEnd = Math.max(periodEnd, num(item, "current_period_end"));

  const stripeStatus = str(subscription, "status") ?? "";
  const billingStatus =
    stripeStatus === "past_due" || stripeStatus === "unpaid" || stripeStatus === "incomplete"
      ? "past_due"
      : stripeStatus === "paused"
        ? "paused"
        : stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
          ? "cancelled"
          : "active";

  const cancelAt = num(subscription, "cancel_at");
  const cancelling = subscription.cancel_at_period_end === true || cancelAt > 0;
  const endsAt = cancelling ? cancelAt || periodEnd : 0;

  const patch: Record<string, unknown> = { billing_status: billingStatus };
  if (billingStatus !== "cancelled") {
    patch.end_date = endsAt > 0 ? chicagoDay(new Date(endsAt * 1000)) : null;
    patch.next_billing_date = !cancelling && periodEnd > 0 ? chicagoDay(new Date(periodEnd * 1000)) : null;
  }
  await db.from("client_services").update(patch).eq("subscription_id", subscriptionId).neq("status", "ended");

  // Did this event schedule or undo a cancellation? Stripe lists the fields
  // that changed, with their old values, in previous_attributes.
  const prev = event.data.previous_attributes ?? {};
  const touched = "cancel_at_period_end" in prev || "cancel_at" in prev;
  if (event.type !== "customer.subscription.updated" || !touched) return;
  const prevAtEnd = "cancel_at_period_end" in prev ? prev.cancel_at_period_end === true : subscription.cancel_at_period_end === true;
  const prevCancelAt = "cancel_at" in prev ? (typeof prev.cancel_at === "number" ? prev.cancel_at : 0) : cancelAt;
  const wasCancelling = prevAtEnd || prevCancelAt > 0;
  if (wasCancelling === cancelling) return;

  const customerId = linked[0].customer_id as string;
  const { data: c } = await db.from("customers").select("business_name, name").eq("id", customerId).maybeSingle();
  await sendBillingChangeAlert({
    kind: cancelling ? "scheduled" : "resumed",
    businessName: c?.business_name || c?.name || "A client",
    services: serviceNames(linked),
    endsOn:
      endsAt > 0
        ? new Date(endsAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
        : null,
    reason: cancelling ? cancellationReason(subscription) : null,
    customerId,
  });
}

// ── Invoice payment ─────────────────────────────────────────────────────────

/**
 * Money against an invoice document.
 *
 * The payment is written as a row in invoice_payments rather than by stamping
 * the invoice `paid`, because a database trigger owns that decision: it sums
 * the payments and moves the invoice to partial or paid from the total. That
 * is the same path a cheque recorded by hand takes, so an invoice half paid
 * by cheque and half by card lands correctly without a second code path.
 *
 * Idempotent on two keys, because Stripe redelivers: invoice_payments has a
 * unique index on the payment intent, and revenue_events dedupes on
 * external_id. What is booked is what Stripe says was collected, never the
 * invoice's asking price.
 */
async function handleInvoiceDocumentPaid(event: StripeEvent) {
  const db = supabaseAdmin();
  const session = event.data.object;

  const sessionId = str(session, "id");
  const m = meta(session);
  const invoiceId = m.invoice_id || null;
  if (!invoiceId || !sessionId) return;

  const amountTotal = num(session, "amount_total");
  if (amountTotal <= 0) return;

  const now = new Date().toISOString();
  const paymentIntent = str(session, "payment_intent");

  const { data: invoiceRow } = await db
    .from("invoices")
    .select("id, invoice_number, title, status, total_cents, amount_paid_cents, currency, lead_id, customer_id, client_business_name, client_contact_name, client_email, recurring_cents, recurring_interval")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoiceRow) return;

  // Paying a recurring invoice starts a Stripe subscription. Tie it to the
  // client and their service (idempotent, so it also runs on a replay).
  await linkInvoiceSubscription(invoiceId, str(session, "customer"), str(session, "subscription"));

  // A replay Stripe has already delivered.
  const { data: already } = await db
    .from("invoice_payments")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("stripe_payment_intent", paymentIntent ?? sessionId)
    .maybeSingle();
  if (already) return;

  await db.from("invoice_payments").insert({
    invoice_id: invoiceId,
    amount_cents: amountTotal,
    currency: (invoiceRow.currency as string) ?? "USD",
    method: "stripe",
    reference: sessionId,
    paid_on: now.slice(0, 10),
    note: "Paid by card on the invoice page.",
    recorded_by: "stripe",
    stripe_payment_intent: paymentIntent ?? sessionId,
  });

  // The insert above re-runs the payments trigger, which puts a monthly-only
  // invoice back to `partial`. Its subscription is running: stamp it again.
  if (str(session, "subscription")) await stampMonthlyOnlyInvoicePaid(invoiceId);

  await db
    .from("invoices")
    .update({
      stripe_session_id: sessionId,
      stripe_invoice_id: str(session, "invoice"),
      stripe_payment_intent: paymentIntent,
    })
    .eq("id", invoiceId);

  const settled =
    Number(invoiceRow.amount_paid_cents ?? 0) + amountTotal >= Number(invoiceRow.total_cents ?? 0);

  await db.from("invoice_events").insert({
    invoice_id: invoiceId,
    event_type: "paid",
    body: `Stripe collected ${(amountTotal / 100).toFixed(2)} USD.${settled ? " The invoice is now settled in full." : " A balance remains."}`,
    actor: "stripe",
    metadata: { session_id: sessionId, amount_cents: amountTotal, settled },
  });

  await db.from("revenue_events").upsert(
    {
      customer_id: invoiceRow.customer_id ?? null,
      lead_id: invoiceRow.lead_id ?? null,
      kind: "initial",
      category: "launch_package",
      description: `Invoice ${invoiceRow.invoice_number} — ${invoiceRow.title}`,
      amount_cents: amountTotal,
      occurred_at: now,
      external_id: `${sessionId}:invoice`,
    },
    { onConflict: "external_id", ignoreDuplicates: true }
  );

  if (invoiceRow.lead_id) {
    await db.from("lead_events").insert({
      lead_id: invoiceRow.lead_id,
      type: "revenue",
      body: `Invoice ${invoiceRow.invoice_number} paid — ${(amountTotal / 100).toFixed(2)} USD.`,
      actor: "stripe",
      meta: { invoice_id: invoiceId, session_id: sessionId },
    });
  }

  // Tell John the money landed (switchable on the Notifications page). Never
  // let an email problem fail the webhook, or Stripe would retry the event.
  try {
    const paidSoFar = Number(invoiceRow.amount_paid_cents ?? 0) + amountTotal;
    await notifyAdminInvoice(
      settled ? "paid" : "partial",
      { ...invoiceRow, amount_paid_cents: paidSoFar } as unknown as Invoice,
      `Stripe collected ${(amountTotal / 100).toFixed(2)} USD.`
    );
  } catch (err) {
    console.error("Invoice paid notification failed:", err);
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
