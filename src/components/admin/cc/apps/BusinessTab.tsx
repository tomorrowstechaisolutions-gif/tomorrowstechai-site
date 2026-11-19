import type { ReactNode } from "react";
import type { Business, BusinessDay } from "@/lib/apps/report-queries";
import type { ReportEventKind, ReportExtra, ReportMetrics } from "@/lib/apps/report-contract";
import { isFresh, safeEventUrl } from "@/lib/apps/report-rollup";
import { HEALTH_TONE } from "@/lib/apps/types";
import { EmptyState, Panel } from "../Panel";
import MiniBars from "../MiniBars";
import { ago, count, DASH, money, shortDate } from "../format";
import { IconDollar, IconPulse, IconUsers, IconZap } from "../Icons";
import PullNowButton from "./PullNowButton";

/**
 * How the product itself is doing: its users, its subscribers, its money,
 * its own pipelines, and what happened in it lately.
 *
 * Every number here was sent by the product through its report endpoint and
 * stored by the hourly pull. This tab reads what was stored. It never calls
 * the product, so it loads the same whether the product is up or down.
 *
 * What it refuses to do:
 *   - print a zero for something the product does not measure. That shows as
 *     "Not measured";
 *   - present an old report as current. Past three hours it says stale, and
 *     when the last pull failed it says so above the numbers and keeps
 *     showing the last good report;
 *   - show a person. Activity carries a kind, a time, a plan and an amount.
 *     Who it was is one click away, inside the product's own admin;
 *   - trust a link it was sent. A reported URL is a link only when it points
 *     at one of this app's own hosts.
 */

const KIND_LABEL: Record<ReportEventKind, string> = {
  signup: "Signup",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  cancel: "Cancellation",
  payment_failed: "Payment failed",
  feedback: "Feedback",
};

const KIND_TONE: Record<ReportEventKind, string> = {
  signup: "t-info",
  upgrade: "t-ok",
  downgrade: "t-muted",
  cancel: "t-warn",
  payment_failed: "t-warn",
  feedback: "t-muted",
};

type Tile = { key: keyof ReportMetrics; label: string; cents?: boolean; hint?: string };

const PEOPLE: Tile[] = [
  { key: "users_total", label: "Users" },
  { key: "users_new_24h", label: "New, 24h" },
  { key: "users_new_7d", label: "New, 7 days" },
  { key: "users_new_30d", label: "New, 30 days" },
  { key: "active_7d", label: "Active, 7 days" },
  { key: "active_30d", label: "Active, 30 days" },
];

const MONEY: Tile[] = [
  { key: "mrr_cents", label: "MRR", cents: true, hint: "Active subscriptions, after discounts" },
  { key: "paid_total", label: "Paid", hint: "Active in Stripe" },
  { key: "trialing", label: "Trialing", hint: "Not revenue yet" },
  { key: "past_due", label: "Past due", hint: "Not counted in MRR" },
  { key: "canceling", label: "Canceling", hint: "Paid, set to end" },
  { key: "collected_30d_cents", label: "Collected, 30d", cents: true, hint: "Paid invoices less refunds" },
];

const OPERATIONS: Tile[] = [
  { key: "feedback_open", label: "Open feedback" },
  { key: "ai_cost_30d_cents", label: "AI cost, 30d", cents: true },
];

function Tiles({ tiles, metrics }: { tiles: Tile[]; metrics: ReportMetrics }) {
  return (
    <div className="cc-stats">
      {tiles.map((tile) => {
        const value = metrics[tile.key];
        return (
          <div className="cc-stat" key={tile.key}>
            <div className="cc-stat-label">{tile.label}</div>
            {value === null ? (
              <>
                <div className="cc-stat-value t-none">Not measured</div>
                <div className="cc-stat-hint">The product does not track this</div>
              </>
            ) : (
              <>
                <div className="cc-stat-value">{tile.cents ? money(value, { cents: true }) : count(value)}</div>
                {tile.hint ? <div className="cc-stat-hint">{tile.hint}</div> : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function extraValue(entry: ReportExtra): string {
  if (entry.unit === "cents") return money(entry.value, { cents: true });
  if (entry.unit === "percent") return `${entry.value}%`;
  return count(entry.value);
}

/** One metric over the days that have a value. Missing days stay missing. */
function Trend({
  title,
  days,
  pick,
  format,
}: {
  title: string;
  days: BusinessDay[];
  pick: (day: BusinessDay) => number | null;
  format: (value: number) => string;
}) {
  const points = days
    .map((day) => ({ key: day.day, value: pick(day) }))
    .filter((point): point is { key: string; value: number } => point.value !== null);
  if (points.length < 2) return null;

  return (
    <div>
      <div className="cc-stat-label" style={{ marginBottom: 8 }}>{title}</div>
      <MiniBars
        points={points}
        labelLeft={shortDate(`${points[0].key}T12:00:00Z`)}
        labelRight={shortDate(`${points[points.length - 1].key}T12:00:00Z`)}
        format={(value, key) => `${key}: ${format(value)}`}
      />
    </div>
  );
}

function Setup({ appName, keyEnv, endpointUrl }: { appName: string; keyEnv: string | null; endpointUrl: string | null }) {
  return (
    <ol className="cc-note" style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
      <li>
        {appName} serves its report at <code>{endpointUrl ?? "/api/portfolio/report"}</code>.
      </li>
      <li>
        In {appName}&rsquo;s Vercel project, set <code>TTAI_REPORT_KEY</code> to a long random value.
      </li>
      <li>
        In this admin center&rsquo;s Vercel project, set <code>{keyEnv ?? "the matching key"}</code> to the same
        value, then redeploy and press Pull now.
      </li>
    </ol>
  );
}

export default function BusinessTab({
  appId,
  appName,
  business,
}: {
  appId: string;
  appName: string;
  business: Business;
}) {
  const { integration, report, events, daily, allowedHosts } = business;

  // ── Nothing connected ────────────────────────────────────────────────
  if (!integration) {
    return (
      <Panel title="Business" icon={<IconPulse size={15} />} className="cc-s12">
        <EmptyState
          icon={<IconUsers size={17} />}
          title="No business report connected"
          text="This app does not report its numbers here yet. When it exposes a report endpoint, its users, subscribers, revenue and activity show up on this tab as totals, never as a copy of its customers."
        />
      </Panel>
    );
  }

  const failing = integration.status === "needs_attention";

  // ── Connected in principle, but no report has ever arrived ───────────
  if (!report) {
    return (
      <Panel
        title="Business"
        sub={failing ? "Not reporting yet" : "Not set up yet"}
        icon={<IconPulse size={15} />}
        className="cc-s12"
        footer={<PullNowButton appId={appId} />}
      >
        <EmptyState
          icon={<IconUsers size={17} />}
          title={failing ? `${appName} isn't reporting yet` : `${appName}'s report is not set up yet`}
          text={
            integration.error ??
            "Nothing has been pulled yet. Three steps connect it, and nothing is shown until a real report arrives."
          }
        />
        <Setup appName={appName} keyEnv={integration.keyEnv} endpointUrl={integration.endpointUrl} />
      </Panel>
    );
  }

  // ── A report exists ──────────────────────────────────────────────────
  const fresh = isFresh(report.pulledAt, new Date());
  const m = report.metrics;

  const header: ReactNode = (
    <div className="cc-taglist" style={{ flexWrap: "wrap" }}>
      <span className={`cc-chip ${fresh ? "t-ok" : "t-warn"}`} title={new Date(report.pulledAt).toLocaleString("en-US")}>
        {fresh ? `Pulled ${ago(report.pulledAt)}` : `Stale · pulled ${ago(report.pulledAt)}`}
      </span>
      {!report.livemode ? (
        <span className="cc-chip t-muted" title="The product is on Stripe test keys. These are not real money.">Test mode</span>
      ) : null}
      {report.currency !== "usd" ? <span className="cc-chip t-muted">{report.currency.toUpperCase()}</span> : null}
      <PullNowButton appId={appId} />
    </div>
  );

  return (
    <>
      <Panel title="Business" sub={`As ${appName} reports itself`} icon={<IconPulse size={15} />} className="cc-s12">
        {header}
        {failing ? (
          <p className="cc-note" role="status" style={{ marginTop: 10 }}>
            The latest pull didn&rsquo;t get through, so this is the last good report. {integration.error ?? ""}
          </p>
        ) : !fresh ? (
          <p className="cc-note" role="status" style={{ marginTop: 10 }}>
            This report is more than three hours old, so it is left out of the portfolio totals until a fresh one arrives.
          </p>
        ) : null}
      </Panel>

      <Panel title="Money" icon={<IconDollar size={15} />} className="cc-s12" bodyClass="flush">
        <Tiles tiles={MONEY} metrics={m} />
      </Panel>

      <Panel title="People" icon={<IconUsers size={15} />} className="cc-s12" bodyClass="flush">
        <Tiles tiles={PEOPLE} metrics={m} />
      </Panel>

      <Panel title="Operations" icon={<IconZap size={15} />} className="cc-s6" bodyClass="flush">
        <Tiles tiles={OPERATIONS} metrics={m} />
        {report.extra.length > 0 ? (
          <div className="cc-stats">
            {report.extra.map((entry) => (
              <div className="cc-stat" key={entry.key}>
                <div className="cc-stat-label">{entry.label}</div>
                <div className="cc-stat-value">{extraValue(entry)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel title="Its own pipelines" sub="Reported by the product" icon={<IconPulse size={15} />} className="cc-s6" bodyClass="flush">
        {report.health.length === 0 ? (
          <div className="cc-panel-body">
            <EmptyState title="No pipeline health reported" text="This product does not report on its own background jobs yet." />
          </div>
        ) : (
          <table className="cc-table dense">
            <tbody>
              {report.health.map((entry) => (
                <tr key={entry.key}>
                  <td className="cc-strong">{entry.label}</td>
                  <td className="cc-dim">{entry.message ?? DASH}</td>
                  <td className="num">
                    <span className={`cc-chip ${HEALTH_TONE[entry.status]}`}>
                      {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {daily.length >= 2 ? (
        <Panel title="Trend" sub="Last 30 days, one point per day pulled" icon={<IconPulse size={15} />} className="cc-s12">
          <div className="cc-split">
            <Trend title="Users" days={daily} pick={(day) => day.users_total} format={(value) => count(value)} />
            <Trend title="MRR" days={daily} pick={(day) => day.mrr_cents} format={(value) => money(value, { cents: true })} />
          </div>
        </Panel>
      ) : null}

      <Panel title="Recent activity" sub="What happened inside the product" icon={<IconPulse size={15} />} className="cc-s12" bodyClass="flush">
        {events.length === 0 ? (
          <div className="cc-panel-body">
            <EmptyState title="Nothing reported yet" text="Signups, upgrades, cancellations and failed payments land here as the product reports them." />
          </div>
        ) : (
          <div className="cc-timeline">
            {events.map((event) => {
              const href = safeEventUrl(event.url, allowedHosts);
              const detail = [
                event.plan,
                event.amountCents !== null ? money(event.amountCents, { cents: true }) : null,
              ].filter(Boolean).join(" · ");
              return (
                <div className="cc-timeline-item" key={event.id}>
                  <span className="cc-timeline-rail">
                    <span className="cc-timeline-node" />
                  </span>
                  <span className="cc-feed-main">
                    <span className="cc-feed-title">
                      <span className={`cc-chip ${KIND_TONE[event.kind]}`} style={{ marginRight: 8 }}>{KIND_LABEL[event.kind]}</span>
                      {event.summary}
                    </span>
                    <span className="cc-feed-sub">
                      {detail}
                      {detail && href ? " · " : ""}
                      {href ? (
                        <a className="cc-link" href={href} target="_blank" rel="noopener noreferrer nofollow">
                          Open in {appName}
                        </a>
                      ) : null}
                    </span>
                  </span>
                  <span className="cc-feed-when" title={new Date(event.occurredAt).toLocaleString("en-US")}>
                    {ago(event.occurredAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
