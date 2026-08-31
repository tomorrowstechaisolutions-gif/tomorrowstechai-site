import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadCrmBoard,
  type CrmBoard as Board,
  type CrmFilters,
} from "@/lib/crm/queries";
import { DEAL_STAGES, STAGE_TONE } from "@/lib/crm/stages";
import { setDealStageAction } from "@/app/admin/crm-actions";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import { Donut, Legend } from "../Viz";
import CrmFiltersBar from "../CrmFilters";
import { ago, count, DASH, due, money, moneyCompact } from "../format";
import {
  IconBriefcase,
  IconChart,
  IconDollar,
  IconFunnel,
  IconInbox,
  IconLayers,
  IconPulse,
  IconUsers,
} from "../Icons";

/**
 * The CRM.
 *
 *   Company → Contacts → Lead/Inquiry → Deals → Stage → Proposal → Won/Lost
 *
 * A CONTACT is a lead, and a lead who bought is also a customer — both appear
 * in one list because they are the same people at different points. Several
 * leads sharing one company_id are several contacts at one company; that is
 * the whole multi-contact model, with no third record for the same human.
 *
 * A DEAL is its own row because one company buys more than once. The lead
 * keeps its status and the dashboard pipeline still reads it, unchanged.
 *
 * Every ratio is null when its denominator is zero. A 0% win rate on zero
 * closed deals is not a fact about the business.
 */

const STATUS_TONE: Record<string, string> = {
  "New": "t-info",
  "Contact Attempted": "t-info",
  "Contacted": "t-info",
  "Qualified": "t-warn",
  "Demo Scheduled": "t-warn",
  "Proposal/Checkout Sent": "t-warn",
  "Won": "t-ok",
  "Client": "t-ok",
  "Lost": "t-risk",
  "Churned": "t-risk",
  "Paused": "t-muted",
  "Follow Up Later": "t-muted",
};

/* ── The six numbers ───────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;

  const cards = [
    { label: "Contacts", value: count(k.contacts), icon: <IconUsers size={15} />, foot: "Leads and clients together", href: "/admin/crm" },
    { label: "Companies", value: count(k.companies), icon: <IconBriefcase size={15} />, foot: "Businesses, not people", href: "/admin/crm?tab=companies" },
    { label: "Engaged", value: count(k.engaged), icon: <IconPulse size={15} />, foot: "Something has actually happened", href: "/admin/crm" },
    { label: "Open deals", value: count(k.openDeals), icon: <IconFunnel size={15} />, foot: "Still winnable", href: "/admin/crm?tab=deals" },
    { label: "Clients", value: count(k.clients), icon: <IconInbox size={15} />, foot: "Active paying clients", href: "/admin/clients" },
    {
      label: "Pipeline value",
      value: k.pipelineCents > 0 ? moneyCompact(k.pipelineCents) : DASH,
      icon: <IconDollar size={15} />,
      foot: k.pipelineCents > 0 ? "Recurring annualised" : "No valued deals open",
      href: "/admin/crm?tab=deals",
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

/* ── Tabs ──────────────────────────────────────────────────────────── */

function Tabs({ board, filters }: { board: Board; filters: CrmFilters }) {
  const tabs: { key: CrmFilters["tab"]; label: string }[] = [
    { key: "contacts", label: "Contacts" },
    { key: "companies", label: "Companies" },
    { key: "deals", label: "Deals" },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div className="cc-tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "contacts" ? "/admin/crm" : `/admin/crm?tab=${t.key}`}
          className={`cc-tab ${filters.tab === t.key ? "is-on" : ""}`}
        >
          {t.label}
          <span className="cc-tab-n">{count(board.tabCounts[t.key])}</span>
        </Link>
      ))}
    </div>
  );
}

/* ── The main table, four shapes behind one panel ──────────────────── */

function Records({ board, filters }: { board: Board; filters: CrmFilters }) {
  const empty = (
    <EmptyState
      icon={<IconUsers size={17} />}
      title="Nothing here yet"
      text="Contacts arrive from the lead forms on your site. Companies are created from the business names on those leads, and deals are what you sell them."
      cta={{ href: "/admin/leads", label: "Open Leads" }}
    />
  );

  return (
    <Panel
      title="Records"
      sub={
        filters.tab === "contacts" ? `${count(board.contacts.length)} contacts`
        : filters.tab === "companies" ? `${count(board.companies.length)} companies`
        : filters.tab === "deals" ? `${count(board.deals.length)} deals`
        : `${count(board.activity.length)} events`
      }
      icon={<IconLayers size={15} />}
      className="cc-s12"
    >
      <Tabs board={board} filters={filters} />

      {filters.tab === "contacts" ? (
        board.contacts.length === 0 ? empty : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Contact</th><th>Company</th><th>Email</th><th>Phone</th>
                  <th>Status</th><th>Interested in</th><th>Owner</th>
                  <th>Last activity</th><th>Next</th><th className="num">Open deals</th>
                </tr>
              </thead>
              <tbody>
                {board.contacts.map((c) => (
                  <tr key={`${c.kind}-${c.id}`}>
                    <td>
                      <span className="cc-strong">{c.name}</span>
                      <span className="cc-client-sub">{c.kind === "customer" ? "Client" : "Lead"}</span>
                    </td>
                    <td className="cc-dim">{c.companyName ?? DASH}</td>
                    <td>{c.email ? <a className="cc-link" href={`mailto:${c.email}`}>{c.email}</a> : DASH}</td>
                    <td className="cc-dim">{c.phone ?? DASH}</td>
                    <td><span className={`cc-chip ${STATUS_TONE[c.status] ?? "t-muted"}`}>{c.status}</span></td>
                    <td className="cc-dim">{c.servicesInterested.slice(0, 2).join(", ") || DASH}</td>
                    <td className="cc-dim">{c.owner ?? DASH}</td>
                    <td className="cc-dim">
                      {c.lastActivityAt ? (
                        <>
                          {ago(c.lastActivityAt)}
                          {c.lastActivityLabel ? <span className="cc-client-sub">{c.lastActivityLabel}</span> : null}
                        </>
                      ) : <span className="cc-faint">Never</span>}
                    </td>
                    <td className="cc-dim">{c.nextActionAt ? due(c.nextActionAt) : DASH}</td>
                    <td className="num">{c.openDeals === 0 ? <span className="cc-dim">{DASH}</span> : count(c.openDeals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {filters.tab === "companies" ? (
        board.companies.length === 0 ? empty : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Company</th><th>Type</th><th>Location</th>
                  <th className="num">Contacts</th><th className="num">Open deals</th>
                  <th className="num">Pipeline</th><th className="num">Won</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {board.companies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="cc-strong">{c.name}</span>
                      {c.domain ? <span className="cc-client-sub">{c.domain}</span> : null}
                    </td>
                    <td className="cc-dim">{c.businessType ?? DASH}</td>
                    <td className="cc-dim">{[c.city, c.state].filter(Boolean).join(", ") || DASH}</td>
                    <td className="num">{count(c.contacts)}</td>
                    <td className="num">{c.openDeals === 0 ? <span className="cc-dim">{DASH}</span> : count(c.openDeals)}</td>
                    <td className="num">{c.pipelineCents > 0 ? money(c.pipelineCents) : <span className="cc-dim">{DASH}</span>}</td>
                    <td className="num">{c.wonCents > 0 ? money(c.wonCents) : <span className="cc-dim">{DASH}</span>}</td>
                    <td>
                      {c.isClient ? <span className="cc-chip t-ok">Client</span> : <span className="cc-chip t-muted">Prospect</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {filters.tab === "deals" ? (
        board.deals.length === 0 ? (
          <EmptyState
            icon={<IconFunnel size={17} />}
            title="No deals yet"
            text="A deal is one thing you are selling to one company — a website, then automation, then hosting. Each carries its own stage and value, so a repeat client does not overwrite their own history."
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Deal</th><th>Company</th><th>Contact</th><th>Stage</th>
                  <th className="num">Value</th><th>Proposal</th><th>Close</th>
                  <th>Owner</th><th>Move to</th>
                </tr>
              </thead>
              <tbody>
                {board.deals.map((d) => (
                  <tr key={d.id}>
                    <td><span className="cc-strong">{d.title}</span></td>
                    <td className="cc-dim">{d.company?.name ?? DASH}</td>
                    <td className="cc-dim">{d.contactName ?? DASH}</td>
                    <td><span className={`cc-chip ${STAGE_TONE[d.stage]}`}>{d.stageLabel}</span></td>
                    <td className="num">
                      {d.valueCents === null ? <span className="cc-dim">{DASH}</span> : (
                        <span title={d.billing === "monthly" ? "Recurring — annualised in the pipeline total" : "One-off"}>
                          {money(d.valueCents)}{d.billing === "monthly" ? "/mo" : ""}
                        </span>
                      )}
                    </td>
                    <td>
                      {d.hasProposal ? <span className="cc-chip t-info">Sent</span> : <span className="cc-dim">{DASH}</span>}
                    </td>
                    <td className="cc-dim">{d.expectedClose ? due(d.expectedClose) : DASH}</td>
                    <td className="cc-dim">{d.owner ?? DASH}</td>
                    <td>
                      <form action={setDealStageAction} className="cc-inline-form">
                        <input type="hidden" name="deal_id" value={d.id} />
                        <select name="stage" className="cc-filter-select" defaultValue={d.stage} aria-label={`Stage for ${d.title}`}>
                          {DEAL_STAGES.map((s) => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                          ))}
                        </select>
                        <button type="submit" className="cc-btn">Set</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {filters.tab === "activity" ? (
        board.activity.length === 0 ? (
          <EmptyState
            title="No activity in the last 90 days"
            text="Notes, calls, emails, form submissions and status changes all land here automatically as they happen."
          />
        ) : (
          <ul className="cc-feed">
            {board.activity.map((a) => (
              <li className="cc-feed-item" key={a.id}>
                <span className="cc-feed-main">
                  <span className="cc-feed-title">{a.label}</span>
                  <span className="cc-feed-sub">{a.detail ?? a.who ?? ""}</span>
                </span>
                <span className="cc-feed-when">{ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Panel>
  );
}

/* ── The funnel, the mix, and the ratios ───────────────────────────── */

function Funnel({ board }: { board: Board }) {
  const max = Math.max(...board.funnel.map((s) => s.count), 1);

  return (
    <Panel
      title="Pipeline"
      sub="Deals by stage"
      icon={<IconFunnel size={15} />}
      className="cc-s6"
      action={{ href: "/admin", label: "Dashboard" }}
    >
      {board.funnel.every((s) => s.count === 0) ? (
        <EmptyState
          title="No deals in the funnel"
          text="Create a deal against a company and the funnel fills in. Stage names match the dashboard pipeline exactly, so the two screens can never disagree."
        />
      ) : (
        <div className="cc-pipe">
          {board.funnel.map((s) => (
            <div className="cc-pipe-row" key={s.key}>
              <span className="cc-pipe-fill" style={{ width: `${(s.count / max) * 100}%` }} />
              <span className="cc-pipe-n">{count(s.count)}</span>
              <span className="cc-pipe-label">{s.label}</span>
              <span className="cc-pipe-val">
                {s.valueCents > 0 ? money(s.valueCents) : DASH}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Mix({ board }: { board: Board }) {
  const total = board.stageDistribution.reduce((t, s) => t + s.count, 0);
  const slices = board.stageDistribution.map((s) => ({
    label: s.label,
    value: s.count,
    share: total > 0 ? s.count / total : 0,
  }));

  return (
    <Panel title="Deal stage distribution" icon={<IconChart size={15} />} className="cc-s6">
      {slices.length === 0 ? (
        <EmptyState title="Nothing to break down" text="This fills in from the deals you create." />
      ) : (
        <div className="cc-donut-wrap">
          <Donut
            slices={slices}
            total={count(total)}
            caption={total === 1 ? "deal" : "deals"}
            format={(v) => count(v)}
          />
          <Legend slices={slices} format={(v) => count(v)} />
        </div>
      )}
    </Panel>
  );
}

function Metrics({ board }: { board: Board }) {
  const m = board.metrics;

  return (
    <Panel title="Conversion" icon={<IconChart size={15} />} className="cc-s6">
      <div className="cc-stats">
        <div className="cc-stat">
          <div className="cc-stat-label">Lead to client</div>
          <div className="cc-stat-value">{m.conversionPct === null ? DASH : `${m.conversionPct.toFixed(1)}%`}</div>
          <div className="cc-stat-hint">Of everyone we know</div>
        </div>
        <div className="cc-stat">
          <div className="cc-stat-label">Average deal</div>
          <div className="cc-stat-value">{m.avgDealCents === null ? DASH : money(m.avgDealCents)}</div>
          <div className="cc-stat-hint">Won deals with a value</div>
        </div>
        <div className="cc-stat">
          <div className="cc-stat-label">Win rate</div>
          <div className="cc-stat-value">{m.winRatePct === null ? DASH : `${m.winRatePct.toFixed(1)}%`}</div>
          <div className="cc-stat-hint">Won ÷ closed</div>
        </div>
      </div>
      <p className="cc-note">
        Each of these is an em dash until its denominator exists. A 0% win rate on zero closed
        deals is not a fact about the business. Recurring deals are annualised before being
        compared with one-off work, so a $99/month deal and a $1,188 build count the same.
      </p>
    </Panel>
  );
}

function RecentActivity({ board }: { board: Board }) {
  return (
    <Panel
      title="Recent activity"
      icon={<IconPulse size={15} />}
      className="cc-s6"
      action={{ href: "/admin/leads", label: "Leads" }}
    >
      {board.activity.length === 0 ? (
        <EmptyState title="Nothing recorded" text="Notes, calls, emails and form submissions appear here as they happen." />
      ) : (
        <ul className="cc-feed">
          {board.activity.slice(0, 6).map((a) => (
            <li className="cc-feed-item" key={a.id}>
              <span className="cc-feed-main">
                <span className="cc-feed-title">{a.label}</span>
                <span className="cc-feed-sub">{a.detail ?? a.who ?? ""}</span>
              </span>
              <span className="cc-feed-when">{ago(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function CrmBoard({ filters }: { filters: CrmFilters }) {
  const supabase = await createSupabaseServerClient();
  const board = await loadCrmBoard(supabase, filters);

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>CRM</h1>
          <p>Manage relationships. Build trust. Grow revenue.</p>
        </div>
      </div>

      <KpiRow board={board} />
      <CrmFiltersBar
        companies={board.companyOptions}
        owners={board.owners}
        stages={DEAL_STAGES.map((s) => ({ key: s.key, label: s.label }))}
      />

      <div className="cc-board">
        <Records board={board} filters={filters} />
        <Funnel board={board} />
        <Mix board={board} />
        <Metrics board={board} />
        <RecentActivity board={board} />
      </div>
    </>
  );
}

export function CrmBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="Records" rows={7} />
      <PanelSkeleton title="Pipeline" rows={5} />
      <PanelSkeleton title="Deal stage distribution" rows={4} />
    </div>
  );
}
