import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DIMENSION_LABELS, LEAD_RANGE_LABELS, loadLeadAnalytics, type Dimension, type LeadAnalytics, type LeadRange } from "@/lib/analytics/lead-funnel";
import { Panel, EmptyState, ErrorState } from "@/components/admin/cc/Panel";
import { BarList } from "@/components/admin/cc/Viz";
import { money, pct, deltaParts } from "@/components/admin/cc/format";
import { IconAlert, IconChart, IconClock, IconFunnel, IconUsers } from "@/components/admin/cc/Icons";
import fin from "@/components/admin/cc/finance/finance.module.css";
import styles from "@/components/admin/cc/finance/leads.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead analytics" };

/**
 * Lead analytics. Answers: where do leads come from, how far does each one
 * get, how fast are they answered, and which sources become paying clients.
 */

const RANGES = Object.keys(LEAD_RANGE_LABELS) as LeadRange[];
const DIMS = Object.keys(DIMENSION_LABELS) as Dimension[];
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const rate = (n: number, d: number) => (d ? pct(n / d, 0) : "—");

function duration(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 1) return "under 1 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  if (mins < 48 * 60) return `${(mins / 60).toFixed(mins < 600 ? 1 : 0)} hr`;
  return `${Math.round(mins / 1440)} days`;
}

export default async function LeadAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rawRange = typeof params.range === "string" ? params.range : "90d";
  const range: LeadRange = RANGES.includes(rawRange as LeadRange) ? (rawRange as LeadRange) : "90d";
  const rawDim = typeof params.by === "string" ? params.by : "channel";
  const dimension: Dimension = DIMS.includes(rawDim as Dimension) ? (rawDim as Dimension) : "channel";

  let data: LeadAnalytics | null = null;
  let error: string | null = null;
  try {
    data = await loadLeadAnalytics(await createSupabaseServerClient(), range, dimension);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Lead analytics could not be loaded.";
  }

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Lead analytics</h1>
          <p>Where leads come from, how far they get, and which sources turn into clients.</p>
        </div>
        <div className="cc-tabs" role="group" aria-label="Date range" style={{ marginLeft: "auto", borderBottom: 0 }}>
          {RANGES.map((k) => (
            <Link key={k} href={`/admin/intelligence/leads?range=${k}&by=${dimension}`} className={`cc-tab ${k === range ? "is-on" : ""}`} aria-current={k === range ? "page" : undefined}>
              {LEAD_RANGE_LABELS[k]}
            </Link>
          ))}
        </div>
      </div>
      {error || !data ? <ErrorState message={error ?? "Lead analytics could not be loaded."} /> : <Board d={data} />}
    </>
  );
}

function Board({ d }: { d: LeadAnalytics }) {
  const change = d.previousTotal ? deltaParts((d.total - d.previousTotal) / d.previousTotal) : null;
  const talked = d.funnel.find((f) => f.key === "contacted")?.count ?? 0;
  const kpis: Array<{ label: string; value: string; foot: ReactNode }> = [
    {
      label: "Leads",
      value: String(d.total),
      foot: change ? <><span className={`cc-delta ${change.tone}`}>{change.text}</span> vs previous period</> : d.hidden ? `${d.hidden} spam/test hidden` : LEAD_RANGE_LABELS[d.range],
    },
    { label: "Talked to", value: rate(talked, d.total), foot: `${talked} of ${d.total} reached a real conversation` },
    { label: "Won", value: String(d.won), foot: d.total ? `${rate(d.won, d.total)} lead-to-client · ${d.lost} lost` : "No leads yet" },
    { label: "First response", value: duration(d.medianResponseMins), foot: d.respondedCount ? `Median across ${d.respondedCount} lead${d.respondedCount === 1 ? "" : "s"}, includes auto-emails` : "No responses logged yet" },
    {
      label: "Revenue from leads",
      value: money(d.revenueCents),
      foot: d.linkedClients ? `${d.linkedClients} client${d.linkedClients === 1 ? "" : "s"} came from a lead` : "No client is linked to a lead yet",
    },
  ];
  const top = d.funnel[0]?.count || 0;
  const trendMax = Math.max(1, ...d.trend.map((t) => t.count));
  const showSpend = d.dimension === "campaign" && d.spendCents > 0;

  return (
    <>
      <div className="cc-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cc-kpi">
            <div className="cc-kpi-top"><span className="cc-kpi-label">{k.label}</span></div>
            <span className="cc-kpi-value">{k.value}</span>
            <div className="cc-kpi-foot"><span>{k.foot}</span></div>
          </div>
        ))}
      </div>

      <div className="cc-board" style={{ marginTop: 16 }}>
        <Panel title="Funnel" sub={`Furthest stage each lead reached · ${LEAD_RANGE_LABELS[d.range]}`} icon={<IconFunnel size={15} />} className="cc-s6">
          {top ? (
            <div className={styles.funnel}>
              {d.funnel.map((f, i) => {
                const prev = i ? d.funnel[i - 1].count : f.count;
                return (
                  <div key={f.key} className={styles.stage}>
                    <b>{f.label}</b>
                    <span className={styles.track}><span className={`${styles.fill} ${f.key === "won" ? styles.fillWon : ""}`} style={{ width: `${(f.count / top) * 100}%` }} /></span>
                    <span className={styles.stageNum}><b>{f.count}</b><small>{i ? `${rate(f.count, prev)} of previous` : "100%"}</small></span>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState title="No leads in this range" text="Try a longer range above." />}
        </Panel>

        <Panel title={`Leads per ${d.trendUnit}`} sub={`${day(d.from)} – ${day(d.to)}`} icon={<IconChart size={15} />} className="cc-s6">
          <div className={styles.trend} role="img" aria-label={`Leads per ${d.trendUnit}`}>
            {d.trend.map((t, i) => (
              <div key={i} className={styles.col} title={`${t.label}: ${t.count}`}>
                {t.count ? <span className={styles.colNum}>{t.count}</span> : null}
                <span className={`${styles.bar} ${t.count ? "" : styles.barZero}`} style={{ height: `${(t.count / trendMax) * 85}%` }} />
                <span className={styles.colLabel}>{d.trend.length <= 16 || i % Math.ceil(d.trend.length / 12) === 0 ? t.label : ""}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Where leads come from" sub={`By ${DIMENSION_LABELS[d.dimension].toLowerCase()}`} icon={<IconUsers size={15} />} className="cc-s8" action={{ href: "/admin/leads", label: "All leads" }}>
          <div className={styles.dims} role="group" aria-label="Break down by">
            {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((k) => (
              <Link key={k} href={`/admin/intelligence/leads?range=${d.range}&by=${k}`} className={`${styles.dim} ${k === d.dimension ? styles.dimOn : ""}`}>
                {DIMENSION_LABELS[k]}
              </Link>
            ))}
          </div>
          {d.breakdown.length ? (
            <div className="cc-scroll">
              <table className="cc-table dense">
                <thead>
                  <tr>
                    <th>{DIMENSION_LABELS[d.dimension]}</th>
                    <th className="num">Leads</th>
                    <th className="num">Talked to</th>
                    <th className="num">Qualified</th>
                    <th className="num">Won</th>
                    <th className="num">Revenue</th>
                    {showSpend ? <><th className="num">Ad spend</th><th className="num">Cost / lead</th></> : null}
                  </tr>
                </thead>
                <tbody>
                  {d.breakdown.map((r) => (
                    <tr key={r.key}>
                      <td className="cc-strong">{r.key}</td>
                      <td className="num cc-strong">{r.leads}</td>
                      <td className="num">{r.contacted}<span className={styles.pctCell}>{rate(r.contacted, r.leads)}</span></td>
                      <td className="num">{r.qualified}<span className={styles.pctCell}>{rate(r.qualified, r.leads)}</span></td>
                      <td className="num">{r.won}<span className={styles.pctCell}>{rate(r.won, r.leads)}</span></td>
                      <td className="num">{r.revenueCents ? money(r.revenueCents) : <span className="cc-dim">—</span>}</td>
                      {showSpend ? <>
                        <td className="num">{r.spendCents ? money(r.spendCents) : <span className="cc-dim">—</span>}</td>
                        <td className="num">{r.spendCents && r.leads ? money(Math.round(r.spendCents / r.leads), { cents: true }) : <span className="cc-dim">—</span>}</td>
                      </> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.dimension === "service" ? <p className={fin.note}>A lead asking about two services counts once under each.</p> : null}
            </div>
          ) : <EmptyState title="No leads in this range" text="Pick a longer range above." />}
        </Panel>

        <Panel title="Recent leads" sub="Newest first" icon={<IconClock size={15} />} className="cc-s4">
          {d.recent.length ? (
            <div className={fin.rows}>
              {d.recent.map((r) => (
                <Link key={r.id} href={`/admin/leads/${r.id}`} className={fin.row}>
                  <div>
                    <b>{r.name}</b>
                    <small>{r.channel} · {day(r.created)}{r.reached !== r.status ? ` · reached ${r.reached}` : ""}</small>
                  </div>
                  <span className="cc-chip t-muted">{r.status}</span>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No leads yet" text="New leads show here as they come in." />}
        </Panel>

        <Panel title="Where they stand now" sub="Current status" icon={<IconChart size={15} />} className="cc-s4">
          {d.statusNow.length
            ? <BarList rows={d.statusNow.map((s) => ({ label: s.key, value: s.count, share: d.total ? s.count / d.total : 0, valueLabel: String(s.count) }))} />
            : <EmptyState title="Nothing yet" text="Lead statuses show here." />}
        </Panel>

        <Panel title="Why leads were lost" sub={d.lost ? `${d.lost} lost` : "None lost"} icon={<IconAlert size={15} />} className="cc-s4">
          {d.lostReasons.length
            ? <BarList rows={d.lostReasons.map((s) => ({ label: s.key, value: s.count, share: d.lost ? s.count / d.lost : 0, valueLabel: String(s.count) }))} color="#E84D8A" />
            : <EmptyState title="No lost leads" text="When you mark a lead Lost with a reason, the reasons add up here so you can see what to fix." />}
        </Panel>

        <Panel title="How these numbers work" icon={<IconAlert size={15} />} className="cc-s4">
          <p className={fin.note} style={{ marginTop: 0 }}>
            <b>Spam and Test leads</b> are left out of every number{d.hidden ? ` (${d.hidden} hidden in this range)` : ""}.<br />
            <b>Funnel</b> counts the furthest stage each lead ever reached, from its status history. A lead that was Qualified and then Lost still counts as qualified.<br />
            <b>Talked to</b> means Contacted or further. Contact Attempted doesn&apos;t count.<br />
            <b>First response</b> is the time from the lead arriving to the first email, call, note or status change, automated intro emails included.<br />
            <b>Revenue</b> follows a lead into the client record it became (set the lead on the client), using the same client revenue as the Clients page.<br />
            <b>Ad spend and cost per lead</b> show under Campaign once Meta ad spend is synced.
          </p>
        </Panel>
      </div>
    </>
  );
}
