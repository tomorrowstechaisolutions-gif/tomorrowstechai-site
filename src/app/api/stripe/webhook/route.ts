import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { verifyStripeSignature, stripeWebhookConfigured } from "@/lib/stripe/client";
import { sendCapiEvent } from "@/lib/meta/capi";
import { OFFER_PRICE_CENTS, HOSTING_FROM_CENTS, CAMPAIGN_NAME } from "@/lib/campaign/config";
import { DEFAULT_JOB_TASKS, dueDateFrom, PROMISED_DAYS } from "@/lib/jobs/config";
import { sendBillingChangeAlert } from "@/lib/portal/emails";
import { notifyAdminInvoice } from "@/lib/invoices/emails";
import type { Invoice } from "@/lib/invoices/types";
import { becomeClient } from "@/lib/clients/become-client";
import { recordEnrollment } from "@/lib/academy/enrollments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only place a lead becomes a customer.
 *
 * Every write here is idempotent, because Stripe retries until it gets a 2xx
 * and will redeliver the same event. Money is deduplicated on
 * revenue_events.external_id; the job is deduplicated on invoice_id.
 *
 * Two rules keep a half-finished run repairable:
 *   - every read and write that matters goes through must(), which throws on
 *     a database error. Supabase returns errors instead of throwing them, so
 *     without it a failed write looked like success and answered Stripe 200;
 *   - the marker a replay checks ("this invoice is paid", "this payment is
 *     recorded") is written LAST. If anything before it fails, Stripe's retry
 *     finds the marker missing and runs the whole thing again, and because
 *     each step is idempotent the second run only fills in what was missed.
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

/**
 * Awaits a Supabase query and throws if it came back with an error, so the
 * handler stops, the route answers 500 and Stripe redelivers.
 */
async function must<T extends { error: { message?: string } | null }>(query: PromiseLike<T>, what: string): Promise<T> {
  const result = await query;
  if (result.error) throw new Error(`${what}: ${result.error.message ?? "database error"}`);
  return result;
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
      // A bank debit or other delayed method completes checkout unpaid and
      // confirms later with this event. Same session, same bookkeeping.
      case "checkout.session.async_payment_succeeded":
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

  // Checkout can complete before the money exists (delayed payment methods).
  // Nothing is booked until Stripe says it was paid; the async_payment_
  // succeeded event brings the same session back when it is. A subscription
  // on a trial reports "no_payment_required", which is a real sale.
  if (str(session, "payment_status") === "unpaid") return;

  if (m.kind === "sticker_order") {
    await handleStickerOrderPaid(event);
    return;
  }

  // An Academy course. The success redirect usually records it first; this is
  // the backup for a buyer who closed the tab. Either way it is recorded once.
  if (m.kind === "academy_course") {
    const details = session.customer_details as Record<string, unknown> | undefined;
    const email = (details ? str(details, "email") : null) || str(session, "customer_email");
    if (sessionId && email && m.course) {
      await recordEnrollment({
        email,
        courseSlug: m.course,
        stripeSessionId: sessionId,
        stripePaymentIntent: str(session, "payment_intent"),
        amountCents: num(session, "amount_total"),
      });
    }
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

  // 1. Find the invoice. Bail out early on a replay.
  type InvoiceRef = { id: string; status: string };
  const { data: invoiceData } = await must(
    db.from("invoices").select("id, status").eq("id", invoiceId).maybeSingle(),
    "Read the invoice"
  );
  const invoiceRow = (invoiceData as InvoiceRef | null) ?? null;

  // A lead_id we never issued, or an invoice row that has since been deleted.
  // Either way this is not a sale of ours to record.
  if (!invoiceRow) return;

  // Stripe redelivers. `paid` is stamped at the very end of this function, so
  // seeing it here means every step below already succeeded once.
  if (invoiceRow.status === "paid") return;

  const { data: lead } = await must(
    db
      .from("leads")
      .select("id, first_name, last_name, email, phone, business_name, campaign, utm_campaign")
      .eq("id", leadId)
      .maybeSingle(),
    "Read the lead"
  );

  // 2. The lead becomes a customer: one client record, the lead closed as
  //    Won, its follow-up emails cancelled, its paperwork linked.
  const { customerId } = await becomeClient(db, {
    leadId,
    stripeCustomerId,
    email,
    businessName: m.business_name || null,
    actor: "stripe",
    note: "Paid. Status set to Won.",
  });

  await must(
    db
      .from("customers")
      .update({
        status: "active",
        // The contracted rate. Collected money lives in revenue_events; this
        // is what they will pay once the trial ends.
        mrr_cents: HOSTING_FROM_CENTS,
      })
      .eq("id", customerId),
    "Update the client record"
  );

  // The Stripe ids are unique per client. If this Stripe customer is already
  // attached to a different record, that is a merge for a person to make,
  // not a reason to keep refusing the payment, so it is logged, not thrown.
  {
    const { error } = await db
      .from("customers")
      .update({ stripe_customer_id: stripeCustomerId, stripe_subscription_id: stripeSubscriptionId })
      .eq("id", customerId);
    if (error) console.error(`Stripe webhook: could not attach Stripe ids to client ${customerId}:`, error.message);
  }

  // 3. Revenue — only what was actually collected today.
  //
  //    Hosting is on a 30-day trial, so nothing recurring is charged now.
  //    Booking a hypothetical $29 here would overstate LTV against ad spend
  //    for every customer who cancels during the trial. The first hosting
  //    payment is written by handleInvoicePaid when Stripe really charges it.
  const campaign = lead?.utm_campaign || lead?.campaign || null;
  const launchCents = amountTotal > 0 ? amountTotal : OFFER_PRICE_CENTS;

  await must(
    db.from("revenue_events").upsert(
      {
        customer_id: customerId,
        lead_id: lead?.id ?? null,
        kind: "initial",
        category: "launch_package",
        description: `${CAMPAIGN_NAME} — one-time launch`,
        amount_cents: launchCents,
        campaign,
        occurred_at: now,
        external_id: `${sessionId}:launch`,
      },
      { onConflict: "external_id", ignoreDuplicates: true }
    ),
    "Book the launch revenue"
  );

  // 4. Open the job. Unique on invoice_id, so a replay can't open a second.
  await openJob({
    customerId,
    leadId: lead?.id ?? null,
    invoiceId: invoiceRow.id,
    businessName: lead?.business_name ?? m.business_name ?? null,
    name: lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() : null,
  });

  // 5. Last: mark the invoice paid. This is what a replay checks, so it is
  //    only written once everything above is on record.
  await must(
    db
      .from("invoices")
      .update({
        status: "paid",
        paid_at: now,
        stripe_session_id: sessionId,
        stripe_invoice_id: str(session, "invoice"),
        stripe_payment_intent: str(session, "payment_intent"),
      })
      .eq("id", invoiceRow.id),
    "Mark the invoice paid"
  );

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

  const { data: order } = await must(
    db.from("sticker_orders").select("id, status, total").eq("id", orderId).maybeSingle(),
    "Read the sticker order"
  );
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

  const { data: invoice } = await must(
    db
      .from("invoices")
      .select("id, status, amount_cents, billing, lead_id, customer_id, catalog_item_id, description")
      .eq("id", invoiceId)
      .maybeSingle(),
    "Read the upsell invoice"
  );

  if (!invoice) return;
  // Stripe redelivers. `paid` is stamped last, so this means it all landed.
  if (invoice.status === "paid") return;

  const now = new Date().toISOString();
  const amount = num(session, "amount_total") || invoice.amount_cents;

  // Category comes from the catalog item so the money lands in the right
  // bucket without the webhook needing to know what any of them mean.
  let category = "other";
  if (invoice.catalog_item_id) {
    const { data: item } = await must(
      db.from("catalog_items").select("category").eq("id", invoice.catalog_item_id).maybeSingle(),
      "Read the catalog item"
    );
    if (item?.category) category = item.category as string;
  }

  const { data: lead } = invoice.lead_id
    ? await must(
        db.from("leads").select("campaign, utm_campaign").eq("id", invoice.lead_id).maybeSingle(),
        "Read the lead"
      )
    : { data: null };

  // Returns the row only when it was newly written; a replay gets nothing
  // back. That is what makes the MRR bump below safe to reach twice.
  const { data: booked } = await must(
    db
      .from("revenue_events")
      .upsert(
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
      )
      .select("id"),
    "Book the upsell revenue"
  );
  const firstTime = (booked?.length ?? 0) > 0;

  // A retainer raises what this customer is worth every month from now on.
  // Added once, alongside the revenue row; the subscription sync later
  // replaces this figure with what Stripe actually bills.
  if (firstTime && invoice.billing === "monthly" && invoice.customer_id) {
    const { data: customer } = await must(
      db.from("customers").select("mrr_cents").eq("id", invoice.customer_id).maybeSingle(),
      "Read the client MRR"
    );
    if (customer) {
      await must(
        db
          .from("customers")
          .update({ mrr_cents: (customer.mrr_cents ?? 0) + amount })
          .eq("id", invoice.customer_id),
        "Raise the client MRR"
      );
    }
  }

  if (firstTime && invoice.lead_id) {
    // A timeline note. Missing it must not hold up marking the invoice paid.
    const { error } = await db.from("lead_events").insert({
      lead_id: invoice.lead_id,
      type: "revenue",
      body: `Upsell paid — ${invoice.description ?? "extra work"}.`,
      actor: "stripe",
    });
    if (error) console.error("Stripe webhook: upsell lead event failed:", error.message);
  }

  // Last: the marker a replay checks.
  await must(
    db
      .from("invoices")
      .update({
        status: "paid",
        paid_at: now,
        stripe_session_id: sessionId,
        stripe_invoice_id: str(session, "invoice"),
        stripe_payment_intent: str(session, "payment_intent"),
      })
      .eq("id", invoice.id),
    "Mark the upsell invoice paid"
  );
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

  const { data: customer } = await must(
    db.from("customers").select("id, lead_id").eq("stripe_customer_id", stripeCustomerId).limit(1).maybeSingle(),
    "Read the client"
  );
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
    const { data: item } = await must(
      db.from("catalog_items").select("name, category").eq("id", subMeta.catalog_item_id).maybeSingle(),
      "Read the catalog item"
    );
    if (item) {
      category = item.category as string;
      description = item.name as string;
    }
  }

  await must(
    db.from("revenue_events").upsert(
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
    ),
    "Book the recurring revenue"
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

  const { data: customer } = await must(
    db.from("customers").select("id, status").eq("stripe_subscription_id", subscriptionId).limit(1).maybeSingle(),
    "Read the client"
  );
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

  await must(db.from("customers").update(patch).eq("id", customer.id), "Sync the client subscription");
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
    await must(
      db.from("customers").update({ status: "churned", churned_at: new Date().toISOString(), mrr_cents: 0 }).eq("id", c.id),
      "Mark the client churned"
    );
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
  await must(
    db
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .lte("total_cents", 0)
      .gt("recurring_cents", 0)
      .in("status", ["sent", "partial"]),
    "Mark the monthly-only invoice paid"
  );
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
  await must(
    db.from("client_services").update(patch).eq("subscription_id", subscriptionId).neq("status", "ended"),
    "Sync the subscription services"
  );

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
 *
 * The payment row is what a replay checks, so it is written after the client
 * record, the subscription link and the revenue. If any of those fail the
 * retry starts again from the top and each one is safe to repeat.
 *
 * Paying an invoice also makes the payer a client: an invoice raised for a
 * lead, before anyone converted them, used to be paid into a void: no client
 * record, the lead still open, and a subscription with no owner to attach to.
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

  const { data: invoiceRow } = await must(
    db
      .from("invoices")
      .select("id, invoice_number, title, status, total_cents, amount_paid_cents, currency, lead_id, customer_id, client_business_name, client_contact_name, client_email, recurring_cents, recurring_interval")
      .eq("id", invoiceId)
      .maybeSingle(),
    "Read the invoice"
  );
  if (!invoiceRow) return;

  // 1. Whoever pays an invoice is a client. Skipped only when the invoice
  //    already has its client and came from no lead: nothing to create or close.
  let customerId = (invoiceRow.customer_id as string | null) ?? null;
  if (!customerId || invoiceRow.lead_id) {
    const result = await becomeClient(db, {
      customerId,
      leadId: (invoiceRow.lead_id as string | null) ?? null,
      email: (invoiceRow.client_email as string | null) ?? null,
      name: (invoiceRow.client_contact_name as string | null) ?? null,
      businessName: (invoiceRow.client_business_name as string | null) ?? null,
      matchByEmail: true,
      actor: "stripe",
      note: `Invoice ${invoiceRow.invoice_number} paid. Status set to Won.`,
      insertExtra: { notes: `Became a client by paying invoice ${invoiceRow.invoice_number}.` },
    });
    customerId = result.customerId;
    if (!invoiceRow.customer_id) {
      await must(
        db.from("invoices").update({ customer_id: customerId }).eq("id", invoiceId).is("customer_id", null),
        "Link the invoice to the client"
      );
    }
  }

  // 2. Paying a recurring invoice starts a Stripe subscription. Tie it to the
  //    client and their service (idempotent, so it also runs on a replay).
  await linkInvoiceSubscription(invoiceId, str(session, "customer"), str(session, "subscription"));

  // A replay Stripe has already delivered.
  const paymentKey = paymentIntent ?? sessionId;
  const { data: already } = await must(
    db
      .from("invoice_payments")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("stripe_payment_intent", paymentKey)
      .limit(1)
      .maybeSingle(),
    "Look for an existing payment"
  );
  if (already) return;

  // 3. Revenue. A recurring invoice billed straight away charges two things
  //    in one go: the one-time balance and the first period. The checkout
  //    session records the one-time part (due_now_cents), so each lands in
  //    its own bucket instead of the whole charge being filed as a launch.
  //    Sessions created before that was recorded book as one line, as before.
  const dueNowRaw = Number(m.due_now_cents);
  const hasSplit = Boolean(str(session, "subscription")) && m.due_now_cents !== undefined && Number.isFinite(dueNowRaw);
  const oneTimeCents = hasSplit ? Math.min(Math.max(Math.round(dueNowRaw), 0), amountTotal) : amountTotal;
  const firstPeriodCents = amountTotal - oneTimeCents;

  if (oneTimeCents > 0) {
    await must(
      db.from("revenue_events").upsert(
        {
          customer_id: customerId,
          lead_id: invoiceRow.lead_id ?? null,
          kind: "initial",
          category: "launch_package",
          description: `Invoice ${invoiceRow.invoice_number} — ${invoiceRow.title}`,
          amount_cents: oneTimeCents,
          occurred_at: now,
          external_id: `${sessionId}:invoice`,
        },
        { onConflict: "external_id", ignoreDuplicates: true }
      ),
      "Book the invoice revenue"
    );
  }
  if (firstPeriodCents > 0) {
    await must(
      db.from("revenue_events").upsert(
        {
          customer_id: customerId,
          lead_id: invoiceRow.lead_id ?? null,
          kind: "recurring",
          category: "hosting",
          description: `Invoice ${invoiceRow.invoice_number} — first ${invoiceRow.recurring_interval ?? "month"}`,
          amount_cents: firstPeriodCents,
          occurred_at: now,
          external_id: `${sessionId}:invoice-recurring`,
        },
        { onConflict: "external_id", ignoreDuplicates: true }
      ),
      "Book the first recurring period"
    );
  }

  await must(
    db
      .from("invoices")
      .update({
        stripe_session_id: sessionId,
        stripe_invoice_id: str(session, "invoice"),
        stripe_payment_intent: paymentIntent,
      })
      .eq("id", invoiceId),
    "Record the Stripe ids on the invoice"
  );

  // 4. The payment itself, last. This row is the replay marker, and writing it
  //    is what moves the invoice to partial or paid (a database trigger).
  {
    const { error } = await db.from("invoice_payments").insert({
      invoice_id: invoiceId,
      amount_cents: amountTotal,
      currency: (invoiceRow.currency as string) ?? "USD",
      method: "stripe",
      reference: sessionId,
      paid_on: now.slice(0, 10),
      note: "Paid by card on the invoice page.",
      recorded_by: "stripe",
      stripe_payment_intent: paymentKey,
    });
    // 23505: a second delivery of this event wrote the row a moment ago.
    if (error && (error as { code?: string }).code === "23505") return;
    if (error) throw new Error(`Record the invoice payment: ${error.message}`);
  }

  // The insert above re-runs the payments trigger, which puts a monthly-only
  // invoice back to `partial`. Its subscription is running: stamp it again.
  // (A failure here is repaired by the retry, through linkInvoiceSubscription.)
  if (str(session, "subscription")) await stampMonthlyOnlyInvoicePaid(invoiceId);

  const settled =
    Number(invoiceRow.amount_paid_cents ?? 0) + amountTotal >= Number(invoiceRow.total_cents ?? 0);

  // From here on the payment is on record and a retry would stop at the
  // marker, so nothing below may throw: these are notes, not money.
  {
    const { error } = await db.from("invoice_events").insert({
      invoice_id: invoiceId,
      event_type: "paid",
      body: `Stripe collected ${(amountTotal / 100).toFixed(2)} USD.${settled ? " The invoice is now settled in full." : " A balance remains."}`,
      actor: "stripe",
      metadata: { session_id: sessionId, amount_cents: amountTotal, settled },
    });
    if (error) console.error("Stripe webhook: invoice event failed:", error.message);
  }

  if (invoiceRow.lead_id) {
    const { error } = await db.from("lead_events").insert({
      lead_id: invoiceRow.lead_id,
      type: "revenue",
      body: `Invoice ${invoiceRow.invoice_number} paid — ${(amountTotal / 100).toFixed(2)} USD.`,
      actor: "stripe",
      meta: { invoice_id: invoiceId, session_id: sessionId },
    });
    if (error) console.error("Stripe webhook: lead event failed:", error.message);
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

  let jobId: string | null = null;

  if (opts.invoiceId) {
    const { data: already } = await must(
      db.from("jobs").select("id").eq("invoice_id", opts.invoiceId).limit(1).maybeSingle(),
      "Look for an existing job"
    );
    jobId = (already?.id as string | undefined) ?? null;
  }

  const isNew = !jobId;

  if (!jobId) {
    const started = new Date();
    const title = opts.businessName || opts.name || "New launch";

    const { data: job } = await must(
      db
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
        .single(),
      "Open the job"
    );
    jobId = job?.id as string;
  }

  // The checklist is written whenever the job has none, not only when the job
  // is new: a run that opened the job and then failed must be able to finish
  // it on the retry instead of leaving a project with nothing to do.
  const { count: taskCount } = await must(
    db.from("job_tasks").select("id", { count: "exact", head: true }).eq("job_id", jobId),
    "Count the job tasks"
  );
  if ((taskCount ?? 0) === 0) {
    await must(
      db.from("job_tasks").insert(
        DEFAULT_JOB_TASKS.map((task, index) => ({
          job_id: jobId,
          stage: task.stage,
          label: task.label,
          position: index,
        }))
      ),
      "Write the job checklist"
    );
  }

  if (!isNew) return;
  const job = { id: jobId };

  const { error: eventError } = await db.from("job_events").insert({
    job_id: job.id,
    kind: "payment",
    body: "Payment received. Job opened at Intake.",
    to_stage: "Intake",
    actor: "stripe",
  });
  if (eventError) console.error("Stripe webhook: job event failed:", eventError.message);
}
