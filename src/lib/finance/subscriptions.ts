import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chicagoDate } from "@/lib/time/chicago";

/**
 * Subscriptions: every recurring client service (hosting, retainers, managed
 * backends) with what it contributes to MRR and whether it is actually
 * collecting.
 *
 * Source of truth is `client_services` where billing_type = 'recurring' —
 * the same rows and the same monthly maths as Finance → MRR and the dashboard
 * tile (lib/finance/overview.ts), so the numbers can never disagree. Stripe
 * keeps `billing_status`, `next_billing_date` and `subscription_id` in sync
 * through the webhook; this page only reads.
 */

export type BillingState = "active" | "past_due" | "not_connected" | "paused" | "cancelled";

export type SubscriptionRow = {
  id: string;
  customerId: string | null;
  client: string;
  service: string;
  status: "active" | "paused" | "ended";
  priceCents: number;
  intervalMonths: number;
  monthlyCents: number;
  /** Fraction of total MRR (active rows only). */
  share: number;
  billingStatus: BillingState | null;
  startDate: string | null;
  endDate: string | null;
  nextBilling: string | null;
  stripeUrl: string | null;
  /** The invoice that will start billing, when Stripe isn't connected yet. */
  pendingInvoice: { id: string; number: string | null; status: string } | null;
  problem: string | null;
};

export type SubscriptionsBoard = {
  mrrCents: number;
  arrCents: number;
  activeCount: number;
  clientCount: number;
  collectingCents: number;
  attentionCount: number;
  next30Cents: number;
  next30Count: number;
  active: SubscriptionRow[];
  inactive: SubscriptionRow[];
  byService: Array<{ label: string; cents: number; count: number }>;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function loadSubscriptions(sb: SupabaseClient): Promise<SubscriptionsBoard> {
  const today = chicagoDate();

  const [services, invoices] = await Promise.all([
    sb.from("client_services")
      .select("id, customer_id, status, billing_type, sale_price_cents, interval_months, start_date, end_date, next_billing_date, billing_status, subscription_id, customers(business_name,name), catalog_items(name)")
      .eq("billing_type", "recurring"),
    // Recurring invoices that haven't been paid yet: paying one is what starts
    // the Stripe subscription, so they explain a "not connected" row.
    sb.from("invoices")
      .select("id, invoice_number, status, customer_id, recurring_cents, created_at")
      .gt("recurring_cents", 0)
      .in("status", ["draft", "sent", "partial"])
      .order("created_at", { ascending: false }),
  ]);
  if (services.error) throw new Error(services.error.message);
  if (invoices.error) throw new Error(invoices.error.message);

  const pendingByCustomer = new Map<string, { id: string; number: string | null; status: string; recurring: number }>();
  for (const i of invoices.data ?? []) {
    if (i.customer_id && !pendingByCustomer.has(i.customer_id)) {
      pendingByCustomer.set(i.customer_id, { id: i.id, number: i.invoice_number, status: i.status, recurring: i.recurring_cents });
    }
  }

  const rows: SubscriptionRow[] = (services.data ?? []).map((s) => {
    const c = one(s.customers as unknown as { business_name: string | null; name: string | null } | null);
    const interval = Math.max(1, s.interval_months ?? 1);
    const price = s.sale_price_cents ?? 0;
    const status = (s.status ?? "active") as SubscriptionRow["status"];
    const billing = (s.billing_status ?? null) as BillingState | null;
    const pending = billing === "not_connected" && s.customer_id ? pendingByCustomer.get(s.customer_id) ?? null : null;
    const overdue = status === "active" && s.next_billing_date && s.next_billing_date < today;

    let problem: string | null = null;
    if (status === "active") {
      if (billing === "past_due") problem = "Payment failed · Stripe is retrying";
      else if (billing === "not_connected") {
        problem = pending
          ? pending.status === "draft"
            ? `Not billing · invoice ${pending.number ?? ""} is still a draft`.replace("  ", " ")
            : `Waiting on first payment · invoice ${pending.number ?? ""} sent`.replace("  ", " ")
          : overdue ? `Not billing · was due ${fmtDay(s.next_billing_date!)}` : "Not billing · no Stripe subscription";
      } else if (overdue) problem = `Billing date passed (${fmtDay(s.next_billing_date!)})`;
    }

    return {
      id: s.id,
      customerId: s.customer_id,
      client: c?.business_name || c?.name || "Unassigned",
      service: one(s.catalog_items as unknown as { name: string } | null)?.name ?? "Service",
      status,
      priceCents: price,
      intervalMonths: interval,
      monthlyCents: Math.round(price / interval),
      share: 0,
      billingStatus: billing,
      startDate: s.start_date,
      endDate: s.end_date,
      nextBilling: s.next_billing_date,
      stripeUrl: s.subscription_id ? `https://dashboard.stripe.com/subscriptions/${s.subscription_id}` : null,
      pendingInvoice: pending ? { id: pending.id, number: pending.number, status: pending.status } : null,
      problem,
    };
  });

  const active = rows.filter((r) => r.status === "active");
  const inactive = rows.filter((r) => r.status !== "active").sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));
  const mrrCents = active.reduce((t, r) => t + r.monthlyCents, 0);
  for (const r of active) r.share = mrrCents ? r.monthlyCents / mrrCents : 0;
  active.sort((a, b) => Number(Boolean(b.problem)) - Number(Boolean(a.problem)) || b.monthlyCents - a.monthlyCents);

  const horizon = addDays(today, 30);
  const upcoming = active.filter((r) => r.billingStatus === "active" && r.nextBilling && r.nextBilling >= today && r.nextBilling <= horizon);

  const services_ = new Map<string, { cents: number; count: number }>();
  for (const r of active) {
    const v = services_.get(r.service) ?? { cents: 0, count: 0 };
    services_.set(r.service, { cents: v.cents + r.monthlyCents, count: v.count + 1 });
  }

  return {
    mrrCents,
    arrCents: mrrCents * 12,
    activeCount: active.length,
    clientCount: new Set(active.map((r) => r.customerId ?? r.id)).size,
    collectingCents: active.filter((r) => r.billingStatus === "active").reduce((t, r) => t + r.monthlyCents, 0),
    attentionCount: active.filter((r) => r.problem).length,
    next30Cents: upcoming.reduce((t, r) => t + r.priceCents, 0),
    next30Count: upcoming.length,
    active,
    inactive,
    byService: [...services_.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.cents - a.cents),
  };
}
