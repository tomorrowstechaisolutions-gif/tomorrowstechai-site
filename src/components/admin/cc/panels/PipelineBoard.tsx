import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadPipelineBoard,
  type PipelineBoard as Board,
  type PipelineDeal,
  type PipelineFilters,
} from "@/lib/pipeline/queries";
import { STAGE_TONE } from "@/lib/crm/stages";
import { moveDealAction, toggleCommitAction } from "@/app/admin/pipeline-actions";
import { LOST_REASONS } from "@/lib/crm/stages";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import { Donut, Legend } from "../Viz";
import MiniBars from "../MiniBars";
import PipelineFiltersBar from "../PipelineFilters";
import SetTarget from "../SetTarget";
import { ago, count, DASH, due, money, moneyCompact, pct, shortDate } from "../format";
import {
  IconAlert,
  IconChart,
  IconCheck,
  IconClock,
  IconDollar,
  IconFunnel,
  IconLayers,
  IconSpark,
  IconZap,
} from "../Icons";

/**
 * The Pipeline.
 *
 * Operates on DEALS, never on lead status: a lead's status is where the
 * relationship stands, a deal's stage is where one sale stands, and one
 * company can have four of them at once.
 *
 * Three numbers on this page are easy to fake and are not:
 *   · win rate is null, not 0%, when nothing has closed
 *   · the forecast gap is null until a target is actually set
 *   · value-over-time draws only days that were recorded, starting the day
 *     snapshots began, because a past pipeline cannot be reconstructed
 */

const PRIORITY_TONE: Record<string, string> = {
  critical: "t-risk", high: "t-risk", medium: "t-warn", low: "t-info",
};

/* ── 1. The six numbers ────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;

  const cards = [
    {
      label: "Pipeline value", value: k.pipelineCents > 0 ? moneyCompact(k.pipelineCents) : DASH,
      icon: <IconDollar size={15} />, foot: "Open deals, recurring annualised",
      href: "/admin/pipeline",
    },
    {
      label: "Active deals", value: count(k.activeDeals),
      icon: <IconLayers size={15} />, foot: "Still winnable", href: "/admin/pipeline",
    },
    {
      label: "Weighted pipeline", value: k.weightedCents > 0 ? moneyCompact(k.weightedCents) : DASH,
      icon: <IconFunnel size={15} />, foot: "Value × probability", href: "/admin/pipeline",
    },
    {
      label: "Average deal", value: k.avgDealCents === null ? DASH : money(k.avgDealCents),
      icon: <IconChart size={15} />, foot: k.avgDealCents === null ? "No valued deals open" : "Open deals with a value",
      href: "/admin/pipeline",
    },
    {
      label: "Won this month", value: count(k.wonThisMonth),
      icon: <IconCheck size={15} />, foot: "Closed won since the 1st", href: "/admin/pipeline?stage=won",
    },
    {
      label: "Win rate", value: k.winRatePct === null ? DASH : `${k.winRatePct.toFixed(0)}%`,
      icon: <IconZap size={15} />,
      foot: k.winRatePct === null ? "Nothing closed this month" : "Won ÷ closed, this month",
      href: "/admin/pipeline",
    },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((c) => (
        <Link className="cc-kpi" key={c.label} href={c.href}>
          <div className="cc-kpi-top">
            <span className="cc-kpi-icon">{c.icon}</span>
            <span className="cc-kpi-label">{c.label}</span>
          </div>
          <div className="cc-kpi-value">{c.value}</div>
          <div className="cc-kpi-foot"><span className="cc-faint">{c.foot}</span></div>
        </Link>
      ))}
    </div>
  );
}

/* ── 2. The board ──────────────────────────────────────────────────── */

/**
 * A deal card, with the stage move as a form rather than a drag.
 *
 * Drag-and-drop needs client-side state, a DnD library and an optimistic
 * update that can disagree with the server. A select and a button work
 * without JavaScript, survive a failed request honestly, and — because the
 * move goes through a server action — get the same audited stage history
 * that every other path does.
 */
function DealCard({ deal }: { deal: PipelineDeal }) {
  return (
    <article className={`cc-deal ${deal.priority ? `p-${deal.priority}` : ""}`}>
      <div className="cc-deal-top">
        <span className="cc-deal-title">{deal.title}</span>
        {deal.committed ? (
          <span className="cc-chip t-ok" title="Committed to this month's forecast">Commit</span>
        ) : null}
      </div>

      <span className="cc-deal-company">{deal.company?.name ?? "No company"}</span>
      {deal.contactName ? <span className="cc-deal-contact">{deal.contactName}</span> : null}

      <div className="cc-deal-money">
        <span className="cc-deal-value">
          {deal.valueCents === null ? DASH : money(deal.valueCents)}
          {deal.billing === "monthly" ? <span className="cc-faint">/mo</span> : null}
        </span>
        <span className="cc-deal-prob" title={deal.probabilityIsDefault ? "Stage default" : "Set by the owner"}>
          {deal.probability}%
        </span>
      </div>

      <div className="cc-deal-meta">
        <span>{deal.owner ?? "Unassigned"}</span>
        <span>{deal.expectedClose ? due(deal.expectedClose) : "No close date"}</span>
      </div>

      <div className="cc-deal-meta">
        <span title="Days in this stage">
          <IconClock size={11} /> {deal.daysInStage}d in stage
        </span>
        <span>{deal.lastActivityAt ? ago(deal.lastActivityAt) : "No activity"}</span>
      </div>

      {deal.nextAction ? (
        <span className="cc-deal-next">Next: {deal.nextAction}</span>
      ) : null}

      {deal.issues.length > 0 ? (
        <span className={`cc-chip ${PRIORITY_TONE[deal.priority ?? "low"]}`} title={deal.issues.map((i) => i.detail).join("\n")}>
          {deal.issues[0].label}
        </span>
      ) : null}
    </article>
  );
}

function StageBoard({ board }: { board: Board }) {
  const anyDeals = board.columns.some((c) => c.count > 0);

  return (
    <Panel
      title="Pipeline board"
      sub={`${count(board.kpis.activeDeals)} open`}
      icon={<IconLayers size={15} />}
      className="cc-s12"
    >
      {!anyDeals ? (
        <EmptyState
          icon={<IconFunnel size={17} />}
          title="No active deals"
          text="A deal is one thing you are selling to one company. Create them from the CRM, where they attach to a company and a contact."
          cta={{ href: "/admin/crm?tab=deals", label: "Open CRM" }}
        />
      ) : (
        <div className="cc-kanban">
          {board.columns.map((col) => (
            <section className="cc-kcol" key={col.key}>
              <header className="cc-kcol-head">
                <span className="cc-kcol-name">{col.label}</span>
                <span className="cc-kcol-n">{col.count}</span>
                <span className="cc-kcol-val">
                  {col.valueCents > 0 ? moneyCompact(col.valueCents) : DASH}
                </span>
              </header>
              <div className="cc-kcol-body">
                {col.deals.length === 0 ? (
                  <p className="cc-kcol-empty">Nothing here</p>
                ) : (
                  col.deals.map((d) => <DealCard deal={d} key={d.id} />)
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── 3. Table view ─────────────────────────────────────────────────── */

const STAGE_OPTIONS = [
  "new", "qualified", "discovery", "proposal", "negotiation", "won", "on_hold",
];

function TableView({ board }: { board: Board }) {
  return (
    <Panel
      title="Deals"
      sub={`${count(board.deals.length)} shown`}
      icon={<IconLayers size={15} />}
      className="cc-s12"
    >
      {board.deals.length === 0 ? (
        <EmptyState
          title="No deals match"
          text="Clear a filter, or create a deal from the CRM where it attaches to a company and a contact."
          cta={{ href: "/admin/crm?tab=deals", label: "Open CRM" }}
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Deal</th><th>Company</th><th>Contact</th><th>Service</th><th>Stage</th>
                <th className="num">Value</th><th className="num">Prob</th><th className="num">Weighted</th>
                <th>Close</th><th>Owner</th><th>Last activity</th><th className="num">In stage</th>
                <th>Move</th>
              </tr>
            </thead>
            <tbody>
              {board.deals.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="cc-strong">{d.title}</span>
                    {d.nextAction ? <span className="cc-client-sub">Next: {d.nextAction}</span> : null}
                  </td>
                  <td className="cc-dim">{d.company?.name ?? DASH}</td>
                  <td className="cc-dim">{d.contactName ?? DASH}</td>
                  <td className="cc-dim">{d.service ?? DASH}</td>
                  <td><span className={`cc-chip ${STAGE_TONE[d.stage]}`}>{d.stageLabel}</span></td>
                  <td className="num">
                    {d.valueCents === null ? <span className="cc-dim">{DASH}</span> :
                      `${money(d.valueCents)}${d.billing === "monthly" ? "/mo" : ""}`}
                  </td>
                  <td className="num">
                    <span className={d.probabilityIsDefault ? "cc-dim" : ""} title={d.probabilityIsDefault ? "Stage default" : "Set by the owner"}>
                      {d.probability}%
                    </span>
                  </td>
                  <td className="num">{d.weightedCents > 0 ? money(d.weightedCents) : <span className="cc-dim">{DASH}</span>}</td>
                  <td className="cc-dim">{d.expectedClose ? due(d.expectedClose) : DASH}</td>
                  <td className="cc-dim">{d.owner ?? DASH}</td>
                  <td className="cc-dim">{d.lastActivityAt ? ago(d.lastActivityAt) : <span className="cc-faint">Never</span>}</td>
                  <td className="num">{d.daysInStage}d</td>
                  <td>
                    <form action={moveDealAction} className="cc-inline-form">
                      <input type="hidden" name="deal_id" value={d.id} />
                      <select name="stage" className="cc-filter-select" defaultValue={d.stage} aria-label={`Stage for ${d.title}`}>
                        {STAGE_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s === "on_hold" ? "On hold" : s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                      {/* Only read when the stage above is Lost, and required
                          then — the server refuses the move without it. Kept
                          visible rather than revealed by script so the form
                          works with nothing but HTML. */}
                      <select
                        name="lost_reason"
                        className="cc-filter-select cc-reason"
                        defaultValue={d.lostReason ?? ""}
                        aria-label={`Reason, if losing ${d.title}`}
                      >
                        <option value="">If lost&hellip;</option>
                        {LOST_REASONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button type="submit" className="cc-btn">Move</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="cc-note">
        Moving a deal here writes an audited stage-history row — including how long it sat in the
        stage it left — through a database trigger, so a move made from anywhere leaves the same
        trail. Marking one <strong>Lost</strong> requires a reason — pick one from the second
        dropdown, or the move is refused. That field is the only evidence the business will ever
        have about why it loses.
      </p>
    </Panel>
  );
}

/* ── 4. Summary and conversion ─────────────────────────────────────── */

function Summary({ board }: { board: Board }) {
  const total = board.summary.reduce((t, s) => t + s.count, 0);
  const slices = board.summary.map((s) => ({
    label: s.label, value: s.count, share: total > 0 ? s.count / total : 0,
  }));

  return (
    <Panel title="Pipeline summary" icon={<IconChart size={15} />} className="cc-s6">
      {slices.length === 0 ? (
        <EmptyState title="No deals yet" text="This fills in as deals are created." />
      ) : (
        <>
          <div className="cc-donut-wrap">
            <Donut slices={slices} total={count(total)} caption={total === 1 ? "deal" : "deals"} format={(v) => count(v)} />
            <Legend slices={slices} format={(v) => count(v)} />
          </div>
          <ul className="cc-health">
            {board.summary.map((s) => (
              <li className="cc-health-row" key={s.key}>
                <div className="cc-health-name">{s.label}</div>
                <div className="cc-health-detail">{s.count} {s.count === 1 ? "deal" : "deals"}</div>
                <span className="cc-mono">{s.valueCents > 0 ? money(s.valueCents) : DASH}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function Conversion({ board }: { board: Board }) {
  const anyData = board.conversions.some((c) => c.entered > 0);

  return (
    <Panel
      title="Stage conversion"
      sub="From the transition log"
      icon={<IconFunnel size={15} />}
      className="cc-s6"
    >
      {!anyData ? (
        <EmptyState
          title="No stage history yet"
          text="Conversion is measured from actual stage moves, not from how many deals are standing in each column today. It fills in as deals move."
        />
      ) : (
        <div className="cc-barlist">
          {board.conversions.map((c) => (
            <div className="cc-barrow" key={`${c.from}-${c.to}`}>
              <span className="cc-barrow-label">{c.label}</span>
              <span className="cc-barrow-track">
                <span className="cc-barrow-fill" style={{ width: `${(c.pct ?? 0) * 100}%` }} />
              </span>
              <span className="cc-barrow-value">{c.pct === null ? DASH : pct(c.pct, 0)}</span>
              <span className="cc-barrow-share">
                {c.entered === 0 ? "none entered" : `${c.moved} / ${c.entered}`}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="cc-note">
        Counting who is standing in each stage today cannot answer this — the deals that already
        moved past are not there to be counted. Only the log of the moves can.
      </p>
    </Panel>
  );
}

/* ── 5. Value over time ────────────────────────────────────────────── */

function ValueOverTime({ board }: { board: Board }) {
  const points = board.valueOverTime;

  return (
    <Panel
      title="Value over time"
      sub={board.snapshotsStart ? `Since ${shortDate(board.snapshotsStart)}` : undefined}
      icon={<IconChart size={15} />}
      className="cc-s6"
    >
      {points.length < 2 ? (
        <EmptyState
          icon={<IconClock size={17} />}
          title="Not enough history yet"
          text="A past pipeline cannot be reconstructed — values change, deals open and close, and today's rows say nothing about last month. So the total is written down once a day from now on, and this chart draws only the days actually recorded."
        />
      ) : (
        <MiniBars
          points={points.map((p) => ({ key: p.date, value: Math.round(p.pipelineCents / 100) }))}
          labelLeft={shortDate(points[0].date)}
          labelRight={shortDate(points[points.length - 1].date)}
          format={(v, key) => `${shortDate(key)}: ${money(v * 100)}`}
        />
      )}
    </Panel>
  );
}

/* ── 6. Top deals, attention, lost ─────────────────────────────────── */

function TopDeals({ board }: { board: Board }) {
  return (
    <Panel title="Top deals" sub="Largest open opportunities" icon={<IconDollar size={15} />} className="cc-s6">
      {board.topDeals.length === 0 ? (
        <EmptyState title="No open deals" text="The largest opportunities appear here as they are created." />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr><th>Deal</th><th>Company</th><th>Stage</th><th className="num">Value</th><th className="num">Prob</th><th>Close</th><th>Commit</th></tr>
            </thead>
            <tbody>
              {board.topDeals.map((d) => (
                <tr key={d.id}>
                  <td><span className="cc-strong">{d.title}</span></td>
                  <td className="cc-dim">{d.company?.name ?? DASH}</td>
                  <td><span className={`cc-chip ${STAGE_TONE[d.stage]}`}>{d.stageLabel}</span></td>
                  <td className="num">{d.valueCents === null ? DASH : money(d.valueCents)}</td>
                  <td className="num">{d.probability}%</td>
                  <td className="cc-dim">{d.expectedClose ? due(d.expectedClose) : DASH}</td>
                  <td>
                    <form action={toggleCommitAction} className="cc-inline-form">
                      <input type="hidden" name="deal_id" value={d.id} />
                      <button type="submit" className={`cc-btn ${d.committed ? "primary" : ""}`}>
                        {d.committed ? "Committed" : "Commit"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Attention({ board }: { board: Board }) {
  return (
    <Panel
      title="Deals needing attention"
      sub={board.attention.length > 0 ? `${count(board.attention.length)} flagged` : undefined}
      icon={<IconAlert size={15} />}
      className="cc-s6"
    >
      {board.attention.length === 0 ? (
        <EmptyState
          title="Nothing needs chasing"
          text="No overdue close dates, no silent deals, nothing stuck, and every open deal has a next step."
        />
      ) : (
        <div className="cc-alerts">
          {board.attention.map((d) => (
            <div className={`cc-alert p-${d.priority ?? "low"}`} key={d.id}>
              <span className="cc-alert-pri" />
              <span className="cc-alert-main">
                <span className="cc-alert-title">{d.title} — {d.issues[0].label}</span>
                <span className="cc-alert-detail">
                  {d.company?.name ?? "No company"} · {d.issues[0].detail}
                  {d.issues.length > 1 ? ` (+${d.issues.length - 1} more)` : ""}
                </span>
              </span>
              <span className="cc-alert-cat">{d.issues[0].suggested}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function LostDeals({ board }: { board: Board }) {
  return (
    <Panel title="Lost deals" icon={<IconAlert size={15} />} className="cc-s6">
      {board.lost.length === 0 ? (
        <EmptyState title="No lost deals" text="Deals marked lost appear here with the reason, which is what makes the pattern visible later." />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr><th>Deal</th><th>Company</th><th className="num">Value</th><th>Reason</th><th>Lost</th><th>Owner</th></tr>
            </thead>
            <tbody>
              {board.lost.map((d) => (
                <tr key={d.id}>
                  <td><span className="cc-strong">{d.title}</span></td>
                  <td className="cc-dim">{d.company?.name ?? DASH}</td>
                  <td className="num">{d.valueCents === null ? DASH : money(d.valueCents)}</td>
                  <td><span className="cc-chip t-risk">{d.lostReason ?? "Not given"}</span></td>
                  <td className="cc-dim">{d.lostAt ? shortDate(d.lostAt) : DASH}</td>
                  <td className="cc-dim">{d.owner ?? DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── 7. Forecast ───────────────────────────────────────────────────── */

function ForecastPanel({ board }: { board: Board }) {
  const f = board.forecast;
  const hasTarget = f.targetCents !== null;

  return (
    <Panel title="Forecast" sub="This month" icon={<IconChart size={15} />} className="cc-s6">
      <div className="cc-stats">
        <div className="cc-stat">
          <div className="cc-stat-label">Pipeline</div>
          <div className="cc-stat-value">{f.pipelineCents > 0 ? money(f.pipelineCents) : DASH}</div>
          <div className="cc-stat-hint">Everything open</div>
        </div>
        <div className="cc-stat">
          <div className="cc-stat-label">Weighted</div>
          <div className="cc-stat-value">{f.weightedCents > 0 ? money(f.weightedCents) : DASH}</div>
          <div className="cc-stat-hint">Value × probability</div>
        </div>
        <div className="cc-stat">
          <div className="cc-stat-label">Best case</div>
          <div className="cc-stat-value">{f.bestCaseCents > 0 ? money(f.bestCaseCents) : DASH}</div>
          <div className="cc-stat-hint">Closing this month, 50%+</div>
        </div>
        <div className="cc-stat">
          <div className="cc-stat-label">Commit</div>
          <div className="cc-stat-value">{f.commitCents > 0 ? money(f.commitCents) : DASH}</div>
          <div className="cc-stat-hint">Marked by the owner</div>
        </div>
        <div className="cc-stat">
          <div className="cc-stat-label">Closed won</div>
          <div className="cc-stat-value t-ok">{f.closedWonCents > 0 ? money(f.closedWonCents) : DASH}</div>
          <div className="cc-stat-hint">Already banked</div>
        </div>
        <div className="cc-stat">
          <div className="cc-stat-label">Gap to target</div>
          <div className={`cc-stat-value ${f.gapCents !== null && f.gapCents > 0 ? "t-risk" : f.gapCents !== null ? "t-ok" : ""}`}>
            {f.gapCents === null ? DASH : money(Math.abs(f.gapCents))}
          </div>
          <div className="cc-stat-hint">
            {f.gapCents === null ? "No target set" : f.gapCents > 0 ? "Still to find" : "Ahead of target"}
          </div>
        </div>
      </div>

      {hasTarget ? (
        <>
          <div className="cc-subhead">Attainment</div>
          <div className="cc-barlist">
            <div className="cc-barrow">
              <span className="cc-barrow-label">Closed won</span>
              <span className="cc-barrow-track">
                <span className="cc-barrow-fill" style={{ width: `${Math.min(100, (f.attainmentPct ?? 0) * 100)}%` }} />
              </span>
              <span className="cc-barrow-value">{f.attainmentPct === null ? DASH : pct(f.attainmentPct, 0)}</span>
              <span className="cc-barrow-share">of {money(f.targetCents!)}</span>
            </div>
            <div className="cc-barrow">
              <span className="cc-barrow-label">+ commit</span>
              <span className="cc-barrow-track">
                <span className="cc-barrow-fill" style={{ width: `${Math.min(100, (f.projectedPct ?? 0) * 100)}%` }} />
              </span>
              <span className="cc-barrow-value">{f.projectedPct === null ? DASH : pct(f.projectedPct, 0)}</span>
              <span className="cc-barrow-share">projected</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <EmptyState
            title="No sales target configured"
            text="Without a target there is no gap to report, and a made-up target produces a made-up gap. Set one and attainment fills in."
          />
          <SetTarget />
        </>
      )}
    </Panel>
  );
}

/* ── 8. The advisor ────────────────────────────────────────────────── */

/**
 * Rules over the same deals, not a model call.
 *
 * Every line names the deal and the fact that produced it. Nothing here
 * moves a stage, changes a value, or sends anything — the consequential
 * verbs on this page all sit behind their own form with a server-side check.
 */
function Advisor({ board }: { board: Board }) {
  type Rec = { id: string; kind: string; title: string; body: string; tone: string };
  const recs: Rec[] = [];
  const f = board.forecast;

  const overdue = board.attention.filter((d) => d.issues.some((i) => i.code === "close_passed"));
  if (overdue.length > 0) {
    recs.push({
      id: "overdue", kind: "High priority",
      title: `${overdue.length} deal${overdue.length === 1 ? " is" : "s are"} past their close date`,
      body: `${overdue.slice(0, 3).map((d) => d.title).join(", ")}. Either the date was optimistic or the deal has gone quiet — both are worth ten minutes today.`,
      tone: "risk",
    });
  }

  const quiet = board.attention.filter((d) => d.issues.some((i) => i.code === "no_activity"));
  if (quiet.length > 0) {
    const biggest = quiet.slice().sort((a, b) => b.annualisedCents - a.annualisedCents)[0];
    recs.push({
      id: "quiet", kind: "At risk",
      title: `${quiet.length} deal${quiet.length === 1 ? " has" : "s have"} gone quiet`,
      body: `The largest is ${biggest.title}${biggest.company ? ` at ${biggest.company.name}` : ""} — ${biggest.valueCents ? money(biggest.valueCents) : "unvalued"}, and nothing has been logged against it in ${biggest.daysInStage} days.`,
      tone: "risk",
    });
  }

  const proposals = board.columns.find((c) => c.key === "proposal");
  if (proposals && proposals.count > 0) {
    recs.push({
      id: "proposal", kind: "Opportunity",
      title: `${proposals.count} deal${proposals.count === 1 ? "" : "s"} sitting in Proposal`,
      body: `${moneyCompact(proposals.valueCents)} of work is waiting on a decision. Proposal is the stage where deals go quietly cold, and a follow-up is usually the whole intervention.`,
      tone: "opportunity",
    });
  }

  if (f.targetCents !== null && f.gapCents !== null && f.gapCents > 0) {
    const coverage = f.commitCents >= f.gapCents;
    recs.push({
      id: "gap", kind: "Forecast",
      title: `${money(f.gapCents)} still to find against this month's target`,
      body: coverage
        ? `Committed deals alone would cover it — ${money(f.commitCents)} is marked as expected to close.`
        : `Committed deals cover ${money(f.commitCents)} of it. The rest has to come from the ${money(f.weightedCents)} weighted pipeline, or from work not yet in it.`,
      tone: coverage ? "revenue" : "risk",
    });
  }

  const noNext = board.attention.filter((d) => d.issues.some((i) => i.code === "no_next_action"));
  if (noNext.length > 0) {
    recs.push({
      id: "no_next", kind: "Action",
      title: `${noNext.length} open deal${noNext.length === 1 ? " has" : "s have"} no next step`,
      body: "A deal with nothing scheduled does not move on its own. Booking the next call is the cheapest thing on this page.",
      tone: "action",
    });
  }

  // Only worth saying once there is enough closed history to mean anything.
  const withReasons = board.lost.filter((d) => d.lostReason);
  if (withReasons.length >= 3) {
    const counts = new Map<string, number>();
    for (const d of withReasons) counts.set(d.lostReason!, (counts.get(d.lostReason!) ?? 0) + 1);
    const [reason, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n >= 2) {
      recs.push({
        id: "lost_pattern", kind: "Pattern",
        title: `"${reason}" is the most common reason you lose`,
        body: `${n} of the last ${withReasons.length} lost deals. Worth knowing whether that is a pricing question, a positioning question, or the wrong leads arriving.`,
        tone: "marketing",
      });
    }
  }

  return (
    <Panel
      title="AI Pipeline Advisor"
      sub="Ranked by what would change the month"
      icon={<IconSpark size={15} />}
      className="cc-s6"
      footer={
        <span className="cc-note">
          Every line is derived from your own deals, dates and stage history — no model has been
          asked to guess. Nothing here moves a deal, changes a value or sends a message.
        </span>
      }
    >
      {recs.length === 0 ? (
        <EmptyState
          title="Nothing to flag"
          text="No overdue closes, nothing gone quiet, every open deal has a next step, and the forecast is on track."
        />
      ) : (
        <div className="cc-insights">
          {recs.map((r) => (
            <article className={`cc-insight k-${r.tone}`} key={r.id}>
              <span className="cc-insight-rail" />
              <div className="cc-insight-body">
                <div className="cc-insight-kind">{r.kind}</div>
                <div className="cc-insight-title">{r.title}</div>
                <p className="cc-insight-text">{r.body}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function PipelineBoard({ filters }: { filters: PipelineFilters }) {
  const supabase = await createSupabaseServerClient();
  const board = await loadPipelineBoard(supabase, filters);

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Pipeline</h1>
          <p>Visualize your sales pipeline. Focus on the right deals. Close more business.</p>
        </div>
        <div className="cc-greet-actions">
          <Link href="/admin/crm?tab=deals" className="cc-add-btn">
            <IconFunnel size={15} />
            <span>New deal</span>
          </Link>
        </div>
      </div>

      <KpiRow board={board} />

      <div className="cc-viewbar">
        <div className="cc-tabs">
          <Link href="/admin/pipeline" className={`cc-tab ${filters.view === "board" ? "is-on" : ""}`}>Board</Link>
          <Link href="/admin/pipeline?view=table" className={`cc-tab ${filters.view === "table" ? "is-on" : ""}`}>Table</Link>
        </div>
      </div>

      <PipelineFiltersBar
        owners={board.owners}
        companies={board.companies}
        services={board.services}
        sources={board.sources}
      />

      <div className="cc-board">
        {filters.view === "table" ? <TableView board={board} /> : <StageBoard board={board} />}
        <Advisor board={board} />
        <Attention board={board} />
        <ForecastPanel board={board} />
        <Summary board={board} />
        <Conversion board={board} />
        <ValueOverTime board={board} />
        <TopDeals board={board} />
        <LostDeals board={board} />
      </div>
    </>
  );
}

export function PipelineBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="Pipeline board" rows={7} />
      <PanelSkeleton title="AI Pipeline Advisor" rows={4} />
      <PanelSkeleton title="Forecast" rows={4} />
    </div>
  );
}
