import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadFinanceOverview, RANGE_LABELS, type FinanceOverview, type RangeKey } from "@/lib/finance/overview";
import { Panel, EmptyState, ErrorState } from "@/components/admin/cc/Panel";
import { BarList } from "@/components/admin/cc/Viz";
import MonthlyChart from "@/components/admin/cc/finance/MonthlyChart";
import { deltaParts, money, moneyCompact, pct } from "@/components/admin/cc/format";
import { IconAlert, IconCart, IconChart, IconDollar, IconFile, IconFunnel, IconRepeat } from "@/components/admin/cc/Icons";
import styles from "@/components/admin/cc/finance/finance.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finance" };

/**
 * Finance Overview. Answers: what came in, what went out, what's left, what's
 * owed to us, what recurs, and what's coming. Every figure is traceable; the
 * "How these numbers work" panel says exactly which records feed each one.
 */

const RANGES = Object.keys(RANGE_LABELS) as RangeKey[];

/** Date-only (YYYY-MM-DD) values are calendar days, not instants: read at noon UTC so no timezone shifts them a day. */
const day = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";

function delta(now: number, prev: number) {
  if (!prev) return null;
  return deltaParts((now - prev) / prev);
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = typeof params.range === "string" ? params.range : "mtd";
  const range: RangeKey = RANGES.includes(raw as RangeKey) ? (raw as RangeKey) : "mtd";

  let data: FinanceOverview | null = null;
  let error: string | null = null;
  try {
    data = await loadFinanceOverview(await createSupabaseServerClient(), range);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Finance data could not be loaded.";
  }

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Finance</h1>
          <p>What came in, what went out, what&apos;s owed, and what recurs.</p>
        </div>
        <div className="cc-tabs" role="group" aria-label="Date range" style={{ marginLeft: "auto", borderBottom: 0 }}>
          {RANGES.map((k) => (
            <Link key={k} href={`/admin/finance?range=${k}`} className={`cc-tab ${k === range ? "is-on" : ""}`} aria-current={k === range ? "page" : undefined}>
              {RANGE_LABELS[k]}
            </Link>
          ))}
        </div>
      </div>

      {error || !data ? <ErrorState message={error ?? "Finance data could not be loaded."} /> : <Overview d={data} />}
    </>
  );
}

function Overview({ d }: { d: FinanceOverview }) {
  const revDelta = delta(d.revenueCents, d.revenuePrevCents);
  const expDelta = delta(d.expensesCents, d.expensesPrevCents);
  const vs = d.range === "mtd" ? "vs same days last month" : "vs previous period";
  const kpis = [
    { label: "Revenue", value: money(d.revenueCents), foot: revDelta ? <><span className={`cc-delta ${revDelta.tone}`}>{revDelta.text}</span> {vs}</> : "Cash collected" },
    { label: "Net profit", value: money(d.netCents), foot: d.marginPct === null ? "No revenue in this period" : `${pct(d.marginPct, 0)} margin`, tone: d.netCents < 0 ? "down" : undefined },
    { label: "Expenses", value: money(d.expensesCents), foot: expDelta ? <><span className={`cc-delta ${expDelta.tone === "up" ? "down" : expDelta.tone === "down" ? "up" : "flat"}`}>{expDelta.text}</span> {vs}</> : d.adSpendCents ? `incl. ${money(d.adSpendCents)} ad spend` : "Incl. ad spend" },
    { label: "MRR", value: money(d.mrrCents), foot: `${d.recurringClients} recurring client${d.recurringClients === 1 ? "" : "s"} · ${moneyCompact(d.mrrCents * 12)}/yr` },
    { label: "Outstanding", value: money(d.outstandingCents), foot: d.overdueCents ? <span className="cc-delta down">{money(d.overdueCents)} overdue</span> : `${d.outstandingCount} open invoice${d.outstandingCount === 1 ? "" : "s"}` },
    { label: "Pipeline (weighted)", value: money(d.pipelineWeightedCents), foot: `${money(d.pipelineCents)} across ${d.pipelineCount} open deal${d.pipelineCount === 1 ? "" : "s"}` },
  ];
  const revTotal = d.revenueByCategory.reduce((t, r) => t + r.cents, 0);
  const expTotal = d.expensesByCategory.reduce((t, r) => t + r.cents, 0);
  const problems = d.recurring.filter((r) => r.problem);

  return (
    <>
      <div className="cc-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cc-kpi">
            <div className="cc-kpi-top"><span className="cc-kpi-label">{k.label}</span></div>
            <span className="cc-kpi-value" style={k.tone === "down" ? { color: "#FB7185" } : undefined}>{k.value}</span>
            <div className="cc-kpi-foot"><span>{k.foot}</span></div>
          </div>
        ))}
      </div>

      <div className="cc-board" style={{ marginTop: 16 }}>
        <Panel title="Revenue vs expenses" sub="Last 12 months · hover a month for detail" icon={<IconChart size={15} />} className="cc-s8">
          <MonthlyChart months={d.months} />
        </Panel>

        <Panel title="Recurring revenue" sub={`${money(d.mrrCents)}/mo`} icon={<IconRepeat size={15} />} className="cc-s4" action={{ href: "/admin/services", label: "Services" }}>
          {d.recurring.length ? (
            <div className={styles.rows}>
              {d.recurring.map((r) => (
                <Link key={r.id} href={r.href} className={styles.row}>
                  <div>
                    <b>{r.client}</b>
                    <small>{r.service}{r.nextBilling && !r.problem ? ` · next bill ${day(r.nextBilling)}` : ""}</small>
                    {r.problem ? <span className={styles.flag}>{r.problem}</span> : null}
                  </div>
                  <span className={styles.amount}>{money(r.monthlyCents, { cents: true })}<small>/mo</small></span>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No recurring clients yet" text="Active recurring services (hosting, retainers) show here with their monthly value." />}
          {problems.length ? <p className={styles.note}><b>{problems.length} recurring service{problems.length === 1 ? "" : "s"}</b> may not be collecting. Connect billing on the client&apos;s service so it charges automatically.</p> : null}
        </Panel>

        <Panel title="Revenue by source" sub={RANGE_LABELS[d.range]} icon={<IconDollar size={15} />} className="cc-s4">
          {d.revenueByCategory.length
            ? <BarList rows={d.revenueByCategory.map((r) => ({ label: r.label, value: r.cents, share: revTotal ? r.cents / revTotal : 0, valueLabel: money(r.cents) }))} />
            : <EmptyState title="No revenue in this period" text="Stripe payments, manual invoice payments and partner revenue land here." />}
        </Panel>

        <Panel title="Expenses by category" sub={RANGE_LABELS[d.range]} icon={<IconCart size={15} />} className="cc-s4">
          {d.expensesByCategory.length
            ? <BarList rows={d.expensesByCategory.map((r) => ({ label: r.label, value: r.cents, share: expTotal ? r.cents / expTotal : 0, valueLabel: money(r.cents, { cents: true }) }))} color="#E84D8A" />
            : <EmptyState title="No expenses in this period" text="Business expenses and ad spend land here." />}
        </Panel>

        <Panel title="Who owes you" sub={d.outstandingCount ? `${money(d.outstandingCents)} outstanding` : "All paid up"} icon={<IconFile size={15} />} className="cc-s4" action={{ href: "/admin/invoices", label: "Invoices" }}>
          {d.receivables.length ? (
            <div className={styles.rows}>
              {d.receivables.slice(0, 8).map((r) => (
                <Link key={r.id} href={r.href} className={styles.row}>
                  <div>
                    <b>{r.client}</b>
                    <small>{r.number ?? "Invoice"} · {r.daysOverdue && r.daysOverdue > 0 ? <span className={styles.late}>{r.daysOverdue} day{r.daysOverdue === 1 ? "" : "s"} overdue</span> : r.dueDate ? `due ${day(r.dueDate)}` : "no due date"}</small>
                  </div>
                  <span className={styles.amount}>{money(r.balanceCents, { cents: true })}</span>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="Nothing outstanding" text="Sent invoices with an unpaid balance show here, oldest overdue first." />}
        </Panel>

        <Panel title="Money in & out" sub={`Latest in ${RANGE_LABELS[d.range].toLowerCase()}`} icon={<IconFunnel size={15} />} className="cc-s8">
          {d.ledger.length ? (
            <div className={styles.rows}>
              {d.ledger.map((m, i) => {
                const body = <>
                  <div><b>{m.label}</b><small>{day(m.date)}{m.sub ? ` · ${m.sub}` : ""} · {m.category}</small></div>
                  <span className={`${styles.amount} ${m.direction === "in" ? styles.in : styles.out}`}>{m.direction === "in" ? "+" : "−"}{money(m.cents, { cents: true })}</span>
                </>;
                return m.href ? <Link key={i} href={m.href} className={styles.row}>{body}</Link> : <div key={i} className={styles.row}>{body}</div>;
              })}
            </div>
          ) : <EmptyState title="No money moved in this period" text="Try a longer range above." />}
        </Panel>

        <Panel title="How these numbers work" icon={<IconAlert size={15} />} className="cc-s4">
          <p className={styles.note} style={{ marginTop: 0 }}>
            <b>Revenue</b> is cash collected: Stripe payments (via the Stripe webhook), partner revenue, and payments you record by hand on an invoice. Stripe invoice payments are counted once.<br />
            <b>Expenses</b> are logged business expenses plus Meta ad spend.<br />
            <b>MRR</b> is every active recurring service, converted to a monthly amount.<br />
            <b>Outstanding</b> is sent invoices&apos; unpaid balance; overdue means past the due date.<br />
            <b>Pipeline</b> is open deal value × win probability (the stage default when none is set).<br />
            Drafts, voided invoices and lost deals are excluded.
          </p>
        </Panel>
      </div>
    </>
  );
}
