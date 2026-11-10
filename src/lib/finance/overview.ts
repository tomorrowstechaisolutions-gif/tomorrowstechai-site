import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chicagoDate, zonedMidnightUtc } from "@/lib/time/chicago";

/**
 * Finance Overview: one honest picture of the money, over a chosen range.
 *
 * Where each number comes from (shown on the page too, so it's never a black box):
 *
 *  REVENUE  = every row in revenue_events (Stripe webhook, partner sync, manual
 *             entries) + manual invoice payments (invoice_payments where the
 *             method is NOT stripe). Stripe invoice payments are written to BOTH
 *             tables by the webhook, so counting stripe-method rows from
 *             invoice_payments would double them.
 *  EXPENSES = expenses + campaign_spend. Ad spend is deliberately kept out of
 *             the expenses table, so it is added here (same rule as the dashboard).
 *  MRR      = active recurring client_services, normalised to one month
 *             (price ÷ interval_months).
 *  OUTSTANDING = sent/partial invoices: total − amount paid (overdue = past due_date).
 *  PIPELINE = open deals' value × probability (stage default when unset).
 */

export type RangeKey = "mtd" | "90d" | "ytd" | "12m";
export const RANGE_LABELS: Record<RangeKey, string> = {
  mtd: "This month",
  "90d": "Last 90 days",
  ytd: "Year to date",
  "12m": "Last 12 months",
};

type Window = { fromDate: string; toDate: string; days: number };

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / DAY) + 1;

export function windows(range: RangeKey, today = chicagoDate()): { current: Window; previous: Window } {
  const [y, m] = today.split("-").map(Number);
  let fromDate: string;
  if (range === "mtd") fromDate = `${y}-${pad(m)}-01`;
  else if (range === "ytd") fromDate = `${y}-01-01`;
  else if (range === "90d") fromDate = addDays(today, -89);
  else fromDate = addDays(today, -364);
  const days = diffDays(fromDate, today);
  // The previous window is the same number of days immediately before, so a
  // partial month is compared with the same slice of the month before it.
  const prevTo = addDays(fromDate, -1);
  return { current: { fromDate, toDate: today, days }, previous: { fromDate: addDays(prevTo, -(days - 1)), toDate: prevTo, days } };
}

export type Money = { date: string; cents: number; label: string; sub: string | null; href: string | null; category: string; external?: boolean };

export type BankTxn = {
  id: string; date: string; amountCents: number; status: string; counterparty: string | null;
  category: string | null; financeClass: string; overridden: boolean; link: string | null;
};

export type FinanceOverview = {
  range: RangeKey;
  window: Window;
  /** "bank" once Mercury has synced: money in/out comes from the bank feed. */
  source: "bank" | "admin";
  cashCents: number | null;
  creditOwedCents: number | null;
  bankAccounts: Array<{ name: string; kind: string | null; last4: string | null; currentCents: number | null }>;
  bankSyncedAt: string | null;
  pendingIn: Array<{ date: string; cents: number; label: string }>;
  bankTxns: BankTxn[];
  revenueCents: number;
  revenuePrevCents: number;
  expensesCents: number;
  expensesPrevCents: number;
  adSpendCents: number;
  netCents: number;
  marginPct: number | null;
  mrrCents: number;
  recurringClients: number;
  outstandingCents: number;
  outstandingCount: number;
  overdueCents: number;
  pipelineCents: number;
  pipelineWeightedCents: number;
  pipelineCount: number;
  months: Array<{ key: string; label: string; revenue: number; expenses: number; net: number }>;
  revenueByCategory: Array<{ label: string; cents: number }>;
  expensesByCategory: Array<{ label: string; cents: number }>;
  receivables: Array<{ id: string; number: string | null; client: string; balanceCents: number; dueDate: string | null; daysOverdue: number | null; status: string; href: string }>;
  recurring: Array<{ id: string; client: string; service: string; monthlyCents: number; nextBilling: string | null; billingStatus: string | null; problem: string | null; href: string }>;
  ledger: Array<Money & { direction: "in" | "out" }>;
};

// Default win probability per stage when a deal has none set.
const STAGE_PROBABILITY: Record<string, number> = { new: 10, qualified: 25, discovery: 35, proposal: 50, negotiation: 70 };
// invoices.status is draft|sent|partial|paid|expired|void|refunded; "overdue"
// is derived from due_date, never stored.
const OPEN_INVOICE = ["sent", "partial"];
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export async function loadFinanceOverview(sb: SupabaseClient, range: RangeKey): Promise<FinanceOverview> {
  const today = chicagoDate();
  const { current, previous } = windows(range, today);

  // Twelve calendar months for the chart, always (independent of range).
  const [ty, tm] = today.split("-").map(Number);
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ty, tm - 1 - i, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  }
  const earliest = [`${monthKeys[0]}-01`, previous.fromDate].sort()[0];
  const earliestIso = zonedMidnightUtc(earliest).toISOString();

  const [rev, pays, exp, spend, services, invoices, deals] = await Promise.all([
    sb.from("revenue_events").select("id, category, description, amount_cents, occurred_at, lead_id, customer_id, customers(business_name,name)").gte("occurred_at", earliestIso),
    sb.from("invoice_payments").select("id, amount_cents, method, paid_on, invoice_id, invoices(invoice_number, title, client_business_name)").gte("paid_on", earliest).neq("method", "stripe"),
    sb.from("expenses").select("id, category, vendor, description, amount_cents, occurred_at").gte("occurred_at", earliest),
    sb.from("campaign_spend").select("spend_cents, date, campaign").gte("date", earliest),
    sb.from("client_services").select("id, customer_id, status, billing_type, sale_price_cents, interval_months, next_billing_date, billing_status, customers(business_name,name), catalog_items(name)").eq("status", "active"),
    sb.from("invoices").select("id, invoice_number, title, status, total_cents, amount_paid_cents, due_date, client_business_name, customers(business_name,name)").in("status", OPEN_INVOICE),
    sb.from("deals").select("id, stage, value_cents, probability").not("stage", "in", "(won,lost,on_hold)"),
  ]);
  const failed = [rev, pays, exp, spend, services, invoices, deals].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const clientOf = (row: { customers?: unknown; client_business_name?: string | null }) => {
    const c = one(row.customers as { business_name: string | null; name: string | null } | null);
    return row.client_business_name || c?.business_name || c?.name || "Unassigned";
  };

  // ── Bank feed (Mercury). Optional: absent until the token is added. ───────
  const [bankAcc, bankTx] = await Promise.all([
    sb.from("bank_accounts").select("name, kind, last4, current_cents, synced_at"),
    sb.from("bank_transactions").select("id, amount_cents, status, counterparty, bank_category, posted_at, bank_created_at, dashboard_link, finance_class, class_override").order("bank_created_at", { ascending: false }).limit(2000),
  ]);
  const bankAccounts = bankAcc.error ? [] : (bankAcc.data ?? []);
  const bankRows = bankTx.error ? [] : (bankTx.data ?? []);
  const source: "bank" | "admin" = bankAccounts.length ? "bank" : "admin";
  const isCredit = (kind: string | null) => /credit/i.test(kind ?? "");
  const bankTxns: BankTxn[] = bankRows.map((t) => ({
    id: t.id,
    date: chicagoDate(new Date(t.posted_at ?? t.bank_created_at)),
    amountCents: Number(t.amount_cents),
    status: t.status,
    counterparty: t.counterparty,
    category: t.bank_category,
    financeClass: t.finance_class,
    overridden: Boolean(t.class_override),
    link: t.dashboard_link,
  }));
  // Cash basis: a deposit counts when it clears; until then it is "incoming".
  const settled = (t: BankTxn) => t.status === "sent" || t.status === "posted" || t.status === "completed";
  const bankMoney = (t: BankTxn): Money => ({
    date: t.date,
    cents: Math.abs(t.amountCents),
    label: t.counterparty ?? "Bank transaction",
    sub: t.category && t.category !== t.counterparty ? t.category : null,
    href: t.link,
    external: true,
    category: t.category ?? t.counterparty ?? (t.amountCents > 0 ? "Other income" : "Other"),
  });

  // ── Normalise every money movement to { date (Chicago), cents } ──────────
  let inflows: Money[] = [
    ...(rev.data ?? []).map((r) => ({
      date: chicagoDate(new Date(r.occurred_at)),
      cents: r.amount_cents,
      label: r.description || titleCase(r.category ?? "revenue"),
      sub: clientOf(r),
      href: r.lead_id ? `/admin/leads/${r.lead_id}` : r.customer_id ? `/admin/clients/${r.customer_id}` : null,
      category: titleCase(r.category ?? "other"),
    })),
    ...(pays.data ?? []).map((p) => {
      const inv = one(p.invoices as unknown as { invoice_number: string | null; title: string | null; client_business_name: string | null } | null);
      return {
        date: p.paid_on,
        cents: p.amount_cents,
        label: `Invoice ${inv?.invoice_number ?? ""} payment`.trim(),
        sub: `${inv?.client_business_name ?? "Client"} · ${titleCase(p.method ?? "manual")}`,
        href: `/admin/invoices/${p.invoice_id}`,
        category: "Invoice payments",
      };
    }),
  ];
  let outflows: Money[] = [
    ...(exp.data ?? []).map((e) => ({
      date: e.occurred_at,
      cents: e.amount_cents,
      label: e.vendor || e.description || titleCase(e.category),
      sub: e.vendor && e.description ? e.description : null,
      href: null,
      category: titleCase(e.category),
    })),
    ...(spend.data ?? []).map((s) => ({
      date: s.date,
      cents: s.spend_cents,
      label: s.campaign || "Ad spend",
      sub: "Meta ads",
      href: "/admin/marketing/spend",
      category: "Ad spend",
    })),
  ];

  // With a bank feed, the bank IS the money record: the admin's own ledgers
  // (Stripe webhook rows, manual expenses) describe the same cash and would
  // double it. Invoices, MRR, receivables and pipeline still come from the admin.
  if (source === "bank") {
    inflows = bankTxns.filter((t) => t.financeClass === "revenue" && settled(t) && t.amountCents > 0).map(bankMoney);
    outflows = bankTxns.filter((t) => t.financeClass === "expense" && settled(t) && t.amountCents < 0).map(bankMoney);
  }

  const within = (w: Window) => (m: Money) => m.date >= w.fromDate && m.date <= w.toDate;
  const sum = (rows: Money[]) => rows.reduce((t, r) => t + r.cents, 0);
  const inNow = inflows.filter(within(current));
  const outNow = outflows.filter(within(current));
  const revenueCents = sum(inNow);
  const expensesCents = sum(outNow);
  const adSpendCents = sum(outNow.filter((m) => m.category === "Ad spend"));

  const groupBy = (rows: Money[]) => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.category, (map.get(r.category) ?? 0) + r.cents);
    return [...map.entries()].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);
  };

  const months = monthKeys.map((key) => {
    const [y, m] = key.split("-").map(Number);
    const revenue = sum(inflows.filter((r) => r.date.startsWith(key)));
    const expenses = sum(outflows.filter((r) => r.date.startsWith(key)));
    return { key, label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), revenue, expenses, net: revenue - expenses };
  });

  // ── Recurring revenue ───────────────────────────────────────────────────
  const recurringRows = (services.data ?? []).filter((s) => s.billing_type === "recurring");
  const recurring = recurringRows.map((s) => {
    const monthly = Math.round((s.sale_price_cents ?? 0) / Math.max(1, s.interval_months ?? 1));
    const service = one(s.catalog_items as unknown as { name: string } | null)?.name ?? "Service";
    const overdue = s.next_billing_date && s.next_billing_date < today;
    const problem = s.billing_status === "not_connected"
      ? overdue ? `Billing not connected · was due ${fmtDay(s.next_billing_date!)}` : "Billing not connected"
      : overdue ? `Billing date passed (${fmtDay(s.next_billing_date!)})` : null;
    return { id: s.id, client: clientOf(s), service, monthlyCents: monthly, nextBilling: s.next_billing_date, billingStatus: s.billing_status, problem, href: `/admin/clients/${s.customer_id}` };
  }).sort((a, b) => Number(Boolean(b.problem)) - Number(Boolean(a.problem)) || (a.nextBilling ?? "9").localeCompare(b.nextBilling ?? "9"));
  const mrrCents = recurring.reduce((t, r) => t + r.monthlyCents, 0);

  // ── Receivables ─────────────────────────────────────────────────────────
  const receivables = (invoices.data ?? []).map((i) => {
    const balance = Math.max(0, (i.total_cents ?? 0) - (i.amount_paid_cents ?? 0));
    const daysOverdue = i.due_date && i.due_date < today ? diffDays(i.due_date, today) - 1 : null;
    return { id: i.id, number: i.invoice_number, client: clientOf(i), balanceCents: balance, dueDate: i.due_date, daysOverdue, status: i.status, href: `/admin/invoices/${i.id}` };
  }).filter((r) => r.balanceCents > 0).sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1) || b.balanceCents - a.balanceCents);

  // ── Pipeline ────────────────────────────────────────────────────────────
  const openDeals = (deals.data ?? []).filter((d) => (d.value_cents ?? 0) > 0);
  const pipelineCents = openDeals.reduce((t, d) => t + (d.value_cents ?? 0), 0);
  const pipelineWeightedCents = Math.round(openDeals.reduce((t, d) => t + (d.value_cents ?? 0) * ((d.probability ?? STAGE_PROBABILITY[d.stage] ?? 20) / 100), 0));

  const ledger = [
    ...inNow.map((m) => ({ ...m, direction: "in" as const })),
    ...outNow.map((m) => ({ ...m, direction: "out" as const })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  const depository = bankAccounts.filter((a) => !isCredit(a.kind));
  const creditAccounts = bankAccounts.filter((a) => isCredit(a.kind));

  return {
    range,
    window: current,
    source,
    cashCents: depository.length ? depository.reduce((t, a) => t + Number(a.current_cents ?? 0), 0) : null,
    creditOwedCents: creditAccounts.length ? creditAccounts.reduce((t, a) => t + Math.abs(Number(a.current_cents ?? 0)), 0) : null,
    bankAccounts: bankAccounts.map((a) => ({ name: a.name, kind: a.kind, last4: a.last4, currentCents: a.current_cents === null ? null : Number(a.current_cents) })),
    bankSyncedAt: bankAccounts.map((a) => a.synced_at as string).sort().at(-1) ?? null,
    pendingIn: bankTxns.filter((t) => t.status === "pending" && t.amountCents > 0 && t.financeClass !== "transfer").map((t) => ({ date: t.date, cents: t.amountCents, label: t.counterparty ?? "Incoming deposit" })),
    bankTxns: bankTxns.slice(0, 25),
    revenueCents,
    revenuePrevCents: sum(inflows.filter(within(previous))),
    expensesCents,
    expensesPrevCents: sum(outflows.filter(within(previous))),
    adSpendCents,
    netCents: revenueCents - expensesCents,
    marginPct: revenueCents > 0 ? (revenueCents - expensesCents) / revenueCents : null,
    mrrCents,
    recurringClients: new Set(recurringRows.map((r) => r.customer_id)).size,
    outstandingCents: receivables.reduce((t, r) => t + r.balanceCents, 0),
    outstandingCount: receivables.length,
    overdueCents: receivables.filter((r) => (r.daysOverdue ?? 0) > 0).reduce((t, r) => t + r.balanceCents, 0),
    pipelineCents,
    pipelineWeightedCents,
    pipelineCount: openDeals.length,
    months,
    revenueByCategory: groupBy(inNow),
    expensesByCategory: groupBy(outNow),
    receivables,
    recurring,
    ledger,
  };
}
