import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { deltaPct, monthToDate } from "./period";
import { getFinanceOverview } from "@/lib/finance/overview";
import type { InvoiceStatus } from "@/lib/supabase/types";

/**
 * Section 9 — Financial snapshot.
 *
 * A compact view of the Finance overview for the current month. It reads the
 * same numbers /admin/finance does (lib/finance/overview) so the two can
 * never disagree; ad spend is shown apart from other costs.
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
  const { current, daysInCurrentMonth } = monthToDate();

  // Headline numbers, sparkline and ledger come from the Finance overview
  // (bank feed first, admin ledgers otherwise): the figures /admin/finance
  // shows. Only the "invoices needing a nudge" list is read here.
  const [money, invoices] = await Promise.all([
    getFinanceOverview("mtd"),
    sb
      .from("invoices")
      .select("id, kind, status, description, amount_cents, launch_cents, sent_at, expires_at, lead_id")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(60)
      .then((r) => unwrap(r, "invoices")),
  ]);

  type Inv = {
    id: string;
    kind: "launch" | "upsell";
    status: InvoiceStatus;
    description: string | null;
    amount_cents: number;
    launch_cents: number;
    sent_at: string;
    expires_at: string | null;
    lead_id: string | null;
  };
  const invValue = (i: Inv) => (i.kind === "launch" ? i.launch_cents : i.amount_cents);

  const daysElapsed = current.days;
  const projectedCents =
    daysElapsed >= 2 && money.revenueCents > 0
      ? Math.round((money.revenueCents / daysElapsed) * daysInCurrentMonth)
      : null;

  const transactions: Transaction[] = money.ledger.slice(0, 6).map((m, i) => ({
    id: `fin:${i}:${m.date}`,
    label: m.label,
    sublabel: m.sub,
    amountCents: m.cents,
    direction: m.direction,
    at: `${m.date}T12:00:00.000Z`,
    href: m.href && !m.external ? m.href : "/admin/finance",
  }));

  const now = Date.now();
  const needsAttention: InvoiceAttention[] = (invoices as Inv[])
    .map((i) => {
      const daysOut = Math.floor((now - new Date(i.sent_at).getTime()) / 86400_000);
      return {
        id: i.id,
        label: i.description || (i.kind === "launch" ? "Business Launch package" : "Upsell"),
        amountCents: invValue(i),
        sentAt: i.sent_at,
        daysOut,
        expired: i.expires_at !== null && new Date(i.expires_at).getTime() < now,
        href: i.lead_id ? `/admin/leads/${i.lead_id}` : "/admin/invoices",
      };
    })
    .filter((i) => i.expired || i.daysOut >= 3)
    .sort((a, b) => Number(b.expired) - Number(a.expired) || b.daysOut - a.daysOut)
    .slice(0, 3);

  return {
    revenueCents: money.revenueCents,
    revenueDelta: deltaPct(money.revenueCents, money.revenuePrevCents),
    mrrCents: money.mrrCents,
    outstandingCents: money.outstandingCents,
    outstandingCount: money.outstandingCount,
    // The overview's expenses already include ad spend; this card shows them apart.
    expensesCents: money.expensesCents - money.adSpendCents,
    adSpendCents: money.adSpendCents,
    netCents: money.netCents,
    projectedCents,
    series: money.dailyIn,
    transactions,
    needsAttention,
  };
}
