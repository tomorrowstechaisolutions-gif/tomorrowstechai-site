import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLatestReports, loadReportIntegrations, type ReportConnection } from "@/lib/apps/report-queries";
import { isFresh, rollup, type LatestReport } from "@/lib/apps/report-rollup";
import { Panel } from "../Panel";
import { ago, count, DASH, money } from "../format";
import { IconDollar, IconPulse, IconUsers, IconZap } from "../Icons";

/**
 * Our own products, as they report themselves.
 *
 * Each product (Held, Storyborn, the next one) answers one read-only
 * endpoint and the hourly job stores what it said. This strip reads only
 * what was stored — it never calls a product — so a product being down
 * shows up here as an old report, not as a slow page.
 *
 * Three rules, the same ones the rest of the Apps board keeps:
 *
 *   A total counts only reports that are fresh (pulled in the last three
 *   hours), live, and in USD — and the strip says how many that is. A stale
 *   number is still shown on its product's row, marked stale, but it is not
 *   added into "today".
 *
 *   "Not measured" is not zero. A product that does not track a number sends
 *   null, and null is printed as a dash with the reason in the tooltip.
 *
 *   If the reports cannot be read at all, the strip leaves the page alone.
 *   The rest of the Apps board does not depend on it.
 */

const NOT_MEASURED = "This product does not measure this.";

function Num({ value, cents = false }: { value: number | null; cents?: boolean }) {
  if (value === null) return <span className="cc-faint" title={NOT_MEASURED}>{DASH}</span>;
  return <>{cents ? money(value) : count(value)}</>;
}

function ReportState({
  connection,
  report,
  now,
}: {
  connection: ReportConnection;
  report: LatestReport | undefined;
  now: Date;
}) {
  const failing = connection.status === "needs_attention";

  if (!report) {
    return failing ? (
      <span className="cc-chip t-warn" title={connection.error ?? undefined}>Can&apos;t reach it yet</span>
    ) : (
      <span className="cc-chip t-muted">Not connected</span>
    );
  }

  const fresh = isFresh(report.pulledAt, now);
  return (
    <>
      <span
        className={`cc-chip ${fresh && !failing ? "t-ok" : "t-warn"}`}
        title={failing ? connection.error ?? undefined : undefined}
      >
        {fresh ? `Pulled ${ago(report.pulledAt)}` : `Stale · ${ago(report.pulledAt)}`}
      </span>
      {!report.livemode ? <span className="cc-chip t-muted" title="Stripe test mode. Left out of the totals.">Test</span> : null}
      {report.currency !== "usd" ? (
        <span className="cc-chip t-muted" title="Not in USD. Left out of the totals.">{report.currency.toUpperCase()}</span>
      ) : null}
    </>
  );
}

export default async function PortfolioStrip() {
  let connections: ReportConnection[];
  let reports: LatestReport[];
  try {
    const supabase = await createSupabaseServerClient();
    connections = await loadReportIntegrations(supabase);
    if (connections.length === 0) return null;
    reports = await loadLatestReports(supabase, connections);
  } catch (error) {
    console.error("[apps:portfolio-strip]", error instanceof Error ? error.message : error);
    return null;
  }

  const now = new Date();
  const totals = rollup(reports, connections.length, now);
  const byApp = new Map(reports.map((report) => [report.appId, report]));
  const newest = reports.reduce<string | null>(
    (latest, report) => (!latest || report.pulledAt > latest ? report.pulledAt : latest),
    null
  );
  const allReporting = totals.reporting === totals.of;

  const tiles = [
    {
      label: "Product MRR",
      value: totals.mrrCents === null ? DASH : money(totals.mrrCents),
      icon: <IconDollar size={15} />,
      foot: totals.mrrCents === null ? "No product is reporting revenue yet" : "Active subscriptions, after discounts",
    },
    {
      label: "Paid subscribers",
      value: totals.paid === null ? DASH : count(totals.paid),
      icon: <IconZap size={15} />,
      foot: "Active in Stripe. Trials are not counted",
    },
    {
      label: "Users",
      value: totals.users === null ? DASH : count(totals.users),
      icon: <IconUsers size={15} />,
      foot: "Across every reporting product",
    },
    {
      label: "New in 24h",
      value: totals.new24h === null ? DASH : count(totals.new24h),
      icon: <IconUsers size={15} />,
      foot: "Signups in the last day",
    },
    {
      label: "Reporting",
      value: `${totals.reporting} of ${totals.of}`,
      icon: <IconPulse size={15} />,
      foot: allReporting ? "Every product is in these totals" : "Only fresh, live reports are totalled",
    },
    {
      label: "Last pull",
      value: newest ? ago(newest) : DASH,
      icon: <IconPulse size={15} />,
      foot: "Pulled hourly, or on demand per product",
    },
  ];

  return (
    <>
      <div className="cc-kpis">
        {tiles.map((tile) => (
          <div className="cc-kpi" key={tile.label}>
            <div className="cc-kpi-top">
              <span className="cc-kpi-icon">{tile.icon}</span>
              <span className="cc-kpi-label">{tile.label}</span>
            </div>
            <div className="cc-kpi-value">{tile.value}</div>
            <div className="cc-kpi-foot">
              <span className="cc-faint">{tile.foot}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="cc-board" style={{ marginBottom: 16 }}>
        <Panel
          title="Our products"
          sub="As each product reports itself"
          icon={<IconPulse size={15} />}
          className="cc-s12"
          bodyClass="flush"
        >
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Users</th>
                  <th className="num">New 24h</th>
                  <th className="num">Paid</th>
                  <th className="num">Trialing</th>
                  <th className="num">Past due</th>
                  <th className="num">MRR</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((connection) => {
                  const report = byApp.get(connection.appId);
                  const m = report?.metrics;
                  return (
                    <tr key={connection.appId}>
                      <td>
                        <Link className="cc-link cc-strong" href={`/admin/apps/${connection.appId}?tab=business`}>
                          {connection.name}
                        </Link>
                      </td>
                      <td className="num">{m ? <Num value={m.users_total} /> : <span className="cc-faint">{DASH}</span>}</td>
                      <td className="num">{m ? <Num value={m.users_new_24h} /> : <span className="cc-faint">{DASH}</span>}</td>
                      <td className="num">{m ? <Num value={m.paid_total} /> : <span className="cc-faint">{DASH}</span>}</td>
                      <td className="num">{m ? <Num value={m.trialing} /> : <span className="cc-faint">{DASH}</span>}</td>
                      <td className="num">{m ? <Num value={m.past_due} /> : <span className="cc-faint">{DASH}</span>}</td>
                      <td className="num">{m ? <Num value={m.mrr_cents} cents /> : <span className="cc-faint">{DASH}</span>}</td>
                      <td>
                        <ReportState connection={connection} report={report} now={now} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
