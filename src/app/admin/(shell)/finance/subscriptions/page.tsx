import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSubscriptions, type BillingState, type SubscriptionRow, type SubscriptionsBoard } from "@/lib/finance/subscriptions";
import { Panel, EmptyState, ErrorState } from "@/components/admin/cc/Panel";
import { BarList } from "@/components/admin/cc/Viz";
import { money, moneyCompact, pct } from "@/components/admin/cc/format";
import { IconAlert, IconRepeat, IconChart, IconClock } from "@/components/admin/cc/Icons";
import styles from "@/components/admin/cc/finance/finance.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscriptions" };

/**
 * Subscriptions. Answers: what recurs, from whom, is each one actually
 * charging, and what's billing next. Same rows and maths as Finance → MRR.
 */

const day = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

const BILLING: Record<BillingState, { label: string; tone: string }> = {
  active: { label: "Charging", tone: "t-ok" },
  past_due: { label: "Past due", tone: "t-risk" },
  not_connected: { label: "Not billing", tone: "t-warn" },
  paused: { label: "Paused", tone: "t-muted" },
  cancelled: { label: "Cancelled", tone: "t-muted" },
};

function cadence(months: number): string {
  if (months === 1) return "/mo";
  if (months === 12) return "/yr";
  if (months === 3) return "/qtr";
  return ` every ${months} mo`;
}

export default async function SubscriptionsPage() {
  let data: SubscriptionsBoard | null = null;
  let error: string | null = null;
  try {
    data = await loadSubscriptions(await createSupabaseServerClient());
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Subscriptions could not be loaded.";
  }

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Subscriptions</h1>
          <p>Every recurring client service, what it adds to MRR, and whether it&apos;s actually charging.</p>
        </div>
      </div>
      {error || !data ? <ErrorState message={error ?? "Subscriptions could not be loaded."} /> : <Board d={data} />}
    </>
  );
}

function Board({ d }: { d: SubscriptionsBoard }) {
  const collectingShare = d.mrrCents ? d.collectingCents / d.mrrCents : 0;
  const kpis: Array<{ label: string; value: string; foot: ReactNode; tone?: "warn" }> = [
    { label: "MRR", value: money(d.mrrCents), foot: `${moneyCompact(d.arrCents)}/yr run rate` },
    { label: "Active subscriptions", value: String(d.activeCount), foot: `${d.clientCount} client${d.clientCount === 1 ? "" : "s"}` },
    {
      label: "Charging in Stripe",
      value: money(d.collectingCents),
      foot: d.mrrCents ? `${pct(collectingShare, 0)} of MRR on autopay` : "Nothing recurring yet",
      tone: d.mrrCents && d.collectingCents < d.mrrCents ? "warn" : undefined,
    },
    {
      label: "Needs attention",
      value: String(d.attentionCount),
      foot: d.attentionCount ? <span className="cc-delta down">not collecting as expected</span> : "All collecting",
      tone: d.attentionCount ? "warn" : undefined,
    },
    { label: "Billing next 30 days", value: money(d.next30Cents), foot: `${d.next30Count} charge${d.next30Count === 1 ? "" : "s"} scheduled in Stripe` },
  ];

  return (
    <>
      <div className="cc-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cc-kpi">
            <div className="cc-kpi-top"><span className="cc-kpi-label">{k.label}</span></div>
            <span className="cc-kpi-value" style={k.tone === "warn" ? { color: "#FBBF24" } : undefined}>{k.value}</span>
            <div className="cc-kpi-foot"><span>{k.foot}</span></div>
          </div>
        ))}
      </div>

      <div className="cc-board" style={{ marginTop: 16 }}>
        <Panel title="Active subscriptions" sub={`${money(d.mrrCents)}/mo`} icon={<IconRepeat size={15} />} className="cc-s12" action={{ href: "/admin/services", label: "Services" }}>
          {d.active.length ? <SubscriptionTable rows={d.active} /> : (
            <EmptyState
              title="No recurring services yet"
              text="Hosting, retainers and managed backends appear here once a client has an active recurring service."
              cta={{ href: "/admin/services", label: "Open services" }}
            />
          )}
        </Panel>

        <Panel title="MRR by service" sub={`${d.byService.length} service${d.byService.length === 1 ? "" : "s"}`} icon={<IconChart size={15} />} className="cc-s4">
          {d.byService.length
            ? <BarList rows={d.byService.map((s) => ({ label: `${s.label} (${s.count})`, value: s.cents, share: d.mrrCents ? s.cents / d.mrrCents : 0, valueLabel: `${money(s.cents)}/mo` }))} />
            : <EmptyState title="Nothing recurring yet" text="Monthly value per service shows here." />}
        </Panel>

        <Panel title="Paused & ended" sub={d.inactive.length ? `${d.inactive.length}` : "None"} icon={<IconClock size={15} />} className="cc-s4">
          {d.inactive.length ? (
            <div className={styles.rows}>
              {d.inactive.map((r) => (
                <Link key={r.id} href={r.customerId ? `/admin/clients/${r.customerId}` : "/admin/services"} className={styles.row}>
                  <div>
                    <b>{r.client}</b>
                    <small>{r.service} · {r.status === "paused" ? "paused" : `ended ${day(r.endDate)}`}</small>
                  </div>
                  <span className={styles.amount}>{money(r.monthlyCents)}<small>/mo</small></span>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No churn" text="Paused and cancelled subscriptions land here, so lost MRR stays visible." />}
        </Panel>

        <Panel title="How these numbers work" icon={<IconAlert size={15} />} className="cc-s4">
          <p className={styles.note} style={{ marginTop: 0 }}>
            <b>MRR</b> is every active recurring client service, converted to a monthly amount. It&apos;s the same figure as Finance and the dashboard.<br />
            <b>Charging</b> means a live Stripe subscription is attached and collecting. Paying a recurring invoice creates one automatically.<br />
            <b>Not billing</b> means the service is active but nothing charges it yet, usually because its invoice hasn&apos;t been paid.<br />
            <b>Past due</b> means Stripe couldn&apos;t charge the card and is retrying.<br />
            Status, next bill date and cancellations sync from Stripe on their own.
          </p>
        </Panel>
      </div>
    </>
  );
}

function SubscriptionTable({ rows }: { rows: SubscriptionRow[] }) {
  return (
    <div className="cc-scroll">
      <table className="cc-table dense">
        <thead>
          <tr>
            <th>Client</th>
            <th>Service</th>
            <th className="num">Price</th>
            <th className="num">Monthly</th>
            <th className="num">Share</th>
            <th>Billing</th>
            <th>Next bill</th>
            <th>Since</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = r.billingStatus ? BILLING[r.billingStatus] : null;
            return (
              <tr key={r.id}>
                <td>
                  {r.customerId ? <Link className="cc-link cc-strong" href={`/admin/clients/${r.customerId}`}>{r.client}</Link> : <span className="cc-strong">{r.client}</span>}
                  {r.problem ? <span className={styles.flag} style={{ display: "flex" }}>{r.problem}</span> : null}
                </td>
                <td className="cc-dim">{r.service}</td>
                <td className="num">{money(r.priceCents, { cents: true })}<span className="cc-dim">{cadence(r.intervalMonths)}</span></td>
                <td className="num cc-strong">{money(r.monthlyCents, { cents: true })}</td>
                <td className="num cc-dim">{pct(r.share, 0)}</td>
                <td>{b ? <span className={`cc-chip ${b.tone}`}>{b.label}</span> : <span className="cc-dim">—</span>}</td>
                <td className={r.billingStatus === "active" ? "" : "cc-dim"}>{r.billingStatus === "active" ? day(r.nextBilling) : r.nextBilling ? `${day(r.nextBilling)} (planned)` : "—"}</td>
                <td className="cc-dim">{day(r.startDate)}</td>
                <td>
                  {r.stripeUrl ? <a className="cc-link" href={r.stripeUrl} target="_blank" rel="noreferrer">Stripe ↗</a> : null}
                  {r.pendingInvoice ? <Link className="cc-link" href={`/admin/invoices/${r.pendingInvoice.id}`}>{r.pendingInvoice.number ?? "Invoice"}</Link> : null}
                  {!r.stripeUrl && !r.pendingInvoice ? <span className="cc-dim">—</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
