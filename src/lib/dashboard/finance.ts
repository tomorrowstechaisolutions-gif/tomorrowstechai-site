import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { chicagoDate, deltaPct, monthToDate } from "./period";
import type { ExpenseCategory, InvoiceStatus, RevenueCategory } from "@/lib/supabase/types";

/**
 * Section 9 — Financial snapshot.
 *
 * Expenses are `expenses` PLUS `campaign_spend` — ad money is a real cost and
 * is deliberately not duplicated into the expenses table, so it has to be
 * added here or net revenue would be flattering and wrong.
 */

export type Transaction = {
  id: string;
  label: string;
  sublabel: string | null;
  amountCents: number;
  /** Negative for money going out. */
  direction: "in" | "out";
  at: string;
  href: string;
};

export type InvoiceAttention = {
  id: string;
  label: string;
  amountCents: number;
  sentAt: string;
  daysOut: number;
  expired: boolean;
  href: string;
};

export type FinanceSnapshot = {
  revenueCents: number;
  revenueDelta: number | null;
  mrrCents: number;
  outstandingCents: number;
  outstandingCount: number;
  expensesCents: number;
  adSpendCents: number;
  netCents: number;
  /** Month-to-date prorated across the whole month. Null on day 1 — one day
   *  of takings is not a forecast. */
  projectedCents: number | null;
  /** Daily revenue for the sparkline, oldest first. */
  series: { date: string; cents: number }[];
  transactions: Transaction[];
  needsAttention: InvoiceAttention[];
};

export async function loadFinance(sb: SupabaseClient): Promise<FinanceSnapshot> {
  const { current, previous, daysInCurrentMonth } = monthToDate();

  const [revenueNow, revenuePrev, customers, invoices, expenses, spend] =
    await Promise.all([
      sb
        .from("revenue_events")
        .select("id, kind, category, description, amount_cents, occurred_at, lead_id")
        .gte("occurred_at", current.fromIso)
        .lt("occurred_at", current.toIso)
        .order("occurred_at", { ascending: false })
        .then((r) => unwrap(r, "revenue")),
      sb
        .from("revenue_events")
        .select("amount_cents")
        .gte("occurred_at", previous.fromIso)
        .lt("occurred_at", previous.toIso)
        .then((r) => unwrap(r, "revenue (prev)")),
      sb
        .from("customers")
        .select("mrr_cents")
        .eq("status", "active")
        .then((r) => unwrap(r, "customers")),
      sb
        .from("invoices")
        .select("id, kind, status, description, amount_cents, launch_cents, sent_at, paid_at, expires_at, lead_id")
        .in("status", ["sent", "paid"])
        .order("sent_at", { ascending: false })
        .limit(60)
        .then((r) => unwrap(r, "invoices")),
      sb
        .from("expenses")
        .select("id, category, vendor, description, amount_cents, occurred_at")
        .gte("occurred_at", current.fromDate)
        .lte("occurred_at", current.toDate)
        .then((r) => unwrap(r, "expenses")),
      sb
        .from("campaign_spend")
        .select("spend_cents, date")
        .gte("date", current.fromDate)
        .lte("date", current.toDate)
        .then((r) => unwrap(r, "ad spend")),
    ]);

  type Rev = {
    id: string;
    kind: string;
    category: RevenueCategory;
    description: string | null;
    amount_cents: number;
    occurred_at: string;
    lead_id: string | null;
  };
  type Inv = {
    id: string;
    kind: "launch" | "upsell";
    status: InvoiceStatus;
    description: string | null;
    amount_cents: number;
    launch_cents: number;
    sent_at: string;
    paid_at: string | null;
    expires_at: string | null;
    lead_id: string | null;
  };
  type Exp = {
    id: string;
    category: ExpenseCategory;
    vendor: string | null;
    description: string | null;
    amount_cents: number;
    occurred_at: string;
  };

  const revRows = revenueNow as Rev[];
  const invRows = invoices as Inv[];
  const expRows = expenses as Exp[];

  const revenueCents = revRows.reduce((t, r) => t + r.amount_cents, 0);
  const prevCents = (revenuePrev as { amount_cents: number }[]).reduce(
    (t, r) => t + r.amount_cents,
    0
  );
  const mrrCents = (customers as { mrr_cents: number }[]).reduce(
    (t, c) => t + c.mrr_cents,
    0
  );

  const open = invRows.filter((i) => i.status === "sent");
  const invValue = (i: Inv) => (i.kind === "launch" ? i.launch_cents : i.amount_cents);
  const outstandingCents = open.reduce((t, i) => t + invValue(i), 0);

  const expensesCents = expRows.reduce((t, e) => t + e.amount_cents, 0);
  const adSpendCents = (spend as { spend_cents: number }[]).reduce(
    (t, s) => t + s.spend_cents,
    0
  );

  // Daily series, zero-filled so a quiet day is a flat line rather than a gap.
  const byDay = new Map<string, number>();
  for (const r of revRows) {
    const d = chicagoDate(new Date(r.occurred_at));
    byDay.set(d, (byDay.get(d) ?? 0) + r.amount_cents);
  }
  const series: { date: string; cents: number }[] = [];
  const [y, m] = current.fromDate.split("-").map(Number);
  const lastDay = Number(current.toDate.slice(8, 10));
  for (let d = 1; d <= lastDay; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    series.push({ date: key, cents: byDay.get(key) ?? 0 });
  }

  const daysElapsed = current.days;
  const projectedCents =
    daysElapsed >= 2 && revenueCents > 0
      ? Math.round((revenueCents / daysElapsed) * daysInCurrentMonth)
      : null;

  const now = Date.now();

  const transactions: Transaction[] = [
    ...revRows.slice(0, 8).map((r) => ({
      id: `rev:${r.id}`,
      label: r.description || r.category.replace(/_/g, " "),
      sublabel: r.kind,
      amountCents: r.amount_cents,
      direction: "in" as const,
      at: r.occurred_at,
      href: r.lead_id ? `/admin/leads/${r.lead_id}` : "/admin/finance",
    })),
    ...expRows.slice(0, 4).map((e) => ({
      id: `exp:${e.id}`,
      label: e.description || e.vendor || e.category,
      sublabel: e.category,
      amountCents: e.amount_cents,
      direction: "out" as const,
      at: `${e.occurred_at}T12:00:00.000Z`,
      href: "/admin/finance/expenses",
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  const needsAttention: InvoiceAttention[] = open
    .map((i) => {
      const daysOut = Math.floor((now - new Date(i.sent_at).getTime()) / 86400_000);
      return {
        id: i.id,
        label: i.description || (i.kind === "launch" ? "Business Launch package" : "Upsell"),
        amountCents: invValue(i),
        sentAt: i.sent_at,
        daysOut,
        expired: i.expires_at !== null && new Date(i.expires_at).getTime() < now,
        href: i.lead_id ? `/admin/leads/${i.lead_id}` : "/admin/finance/invoices",
      };
    })
    .filter((i) => i.expired || i.daysOut >= 3)
    .sort((a, b) => Number(b.expired) - Number(a.expired) || b.daysOut - a.daysOut)
    .slice(0, 3);

  return {
    revenueCents,
    revenueDelta: deltaPct(revenueCents, prevCents),
    mrrCents,
    outstandingCents,
    outstandingCount: open.length,
    expensesCents,
    adSpendCents,
    netCents: revenueCents - expensesCents - adSpendCents,
    projectedCents,
    series,
    transactions,
    needsAttention,
  };
}
