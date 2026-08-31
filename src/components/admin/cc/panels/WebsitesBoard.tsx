import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadWebsiteBoard,
  STATUS_LABELS,
  TYPE_LABELS,
  type WebsiteBoard as Board,
  type WebsiteFilters,
  type WebsiteRow,
  type WebsiteStatus,
  type WebsiteType,
} from "@/lib/websites/queries";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import { Donut, Legend } from "../Viz";
import WebsiteFiltersBar from "../WebsiteFilters";
import AddWebsite from "../AddWebsite";
import { ago, compact, count, DASH, money, moneyCompact, shortDate } from "../format";
import {
  IconAlert,
  IconBriefcase,
  IconChart,
  IconDollar,
  IconGlobe,
  IconLayers,
  IconPulse,
  IconServer,
  IconSpark,
  IconUsers,
  IconZap,
} from "../Icons";

/**
 * The website portfolio.
 *
 * One rule runs through every panel: a number appears only when something
 * measured it. This project has Supabase, Stripe, Meta and Resend and nothing
 * else — no Vercel token, no analytics property, no uptime monitor, no
 * PageSpeed key. So uptime, performance and traffic render "Not connected"
 * rather than a zero, and a live site nobody is watching is reported as
 * UNMONITORED rather than green. Calling an unwatched site healthy is the
 * precise lie this admin exists to avoid.
 */

const HEALTH_TONE: Record<string, string> = {
  healthy: "t-ok",
  warning: "t-warn",
  issue: "t-risk",
  offline: "t-risk",
  unmonitored: "t-muted",
  development: "t-info",
  archived: "t-muted",
};

const STATUS_TONE: Record<WebsiteStatus, string> = {
  live: "t-ok",
  development: "t-info",
  waiting_on_client: "t-warn",
  review: "t-info",
  maintenance: "t-warn",
  paused: "t-muted",
  issue: "t-risk",
  archived: "t-muted",
};

/* ── The six numbers ───────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;

  const cards = [
    {
      label: "Total websites",
      value: count(k.total),
      icon: <IconGlobe size={15} />,
      foot: <span className="cc-faint">In the portfolio, excluding archived</span>,
      href: "/admin/websites",
    },
    {
      label: "Live websites",
      value: count(k.live),
      icon: <IconZap size={15} />,
      foot: <span className="cc-faint">{k.total > 0 ? `${Math.round((k.live / k.total) * 100)}% of the portfolio` : "Nothing added yet"}</span>,
      href: "/admin/websites?tab=live",
    },
    {
      label: "In development",
      value: count(k.inDevelopment),
      icon: <IconBriefcase size={15} />,
      foot: <span className="cc-faint">Building, in review, or waiting on a client</span>,
      href: "/admin/websites?tab=development",
    },
    {
      label: "Hosting clients",
      value: count(k.hostingClients),
      icon: <IconUsers size={15} />,
      foot: <span className="cc-faint">Clients with an active subscription</span>,
      href: "/admin/clients",
    },
    {
      label: "Monthly revenue",
      value: k.monthlyRevenueCents > 0 ? moneyCompact(k.monthlyRevenueCents) : DASH,
      icon: <IconDollar size={15} />,
      foot: (
        <span className="cc-faint">
          {k.monthlyRevenueCents > 0 ? "Recurring, counted once per client" : "No recurring website revenue yet"}
        </span>
      ),
      href: "/admin/clients",
    },
    {
      label: "Needing attention",
      value: count(k.needingAttention),
      icon: <IconAlert size={15} />,
      foot: (
        <span className={k.needingAttention > 0 ? "cc-delta down" : "cc-faint"}>
          {k.needingAttention > 0 ? "Open problems on live sites" : "Nothing flagged"}
        </span>
      ),
      href: "/admin/websites?attention=1",
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
          <div className="cc-kpi-foot">{c.foot}</div>
        </Link>
      ))}
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────── */

function Tabs({ board, filters }: { board: Board; filters: WebsiteFilters }) {
  const tabs: { key: WebsiteFilters["tab"]; label: string }[] = [
    { key: "all", label: "All websites" },
    { key: "live", label: "Live" },
    { key: "development", label: "In development" },
    { key: "maintenance", label: "Maintenance" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="cc-tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "all" ? "/admin/websites" : `/admin/websites?tab=${t.key}`}
          className={`cc-tab ${filters.tab === t.key ? "is-on" : ""}`}
        >
          {t.label}
          <span className="cc-tab-n">{count(board.tabCounts[t.key])}</span>
        </Link>
      ))}
    </div>
  );
}

/* ── The portfolio table ───────────────────────────────────────────── */

function PortfolioRow({ site }: { site: WebsiteRow }) {
  return (
    <tr>
      <td>
        <span className="cc-strong">{site.name}</span>
        <span className="cc-client-sub">{site.client?.name ?? "Ours"}</span>
      </td>
      <td>
        <a
          className="cc-link"
          href={site.baseUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {site.domain}
        </a>
      </td>
      <td>
        <span className={`cc-chip ${STATUS_TONE[site.status]}`}>{site.statusLabel}</span>
      </td>
      <td className="cc-dim">{site.typeLabel}</td>
      <td className="num">
        {site.revenueCents === null ? (
          <span className="cc-dim" title="No per-site hosting renewal, and this client's subscription covers more than one site.">
            {DASH}
          </span>
        ) : (
          <span title={site.revenueSource === "renewal" ? "From this site's hosting renewal" : "From this client's Stripe subscription"}>
            {money(site.revenueCents)}
          </span>
        )}
      </td>
      <td className="num">
        {site.uptimePct === null ? <span className="cc-faint">Not connected</span> : `${site.uptimePct.toFixed(2)}%`}
      </td>
      <td className="num">
        {site.performanceScore === null ? <span className="cc-faint">{DASH}</span> : site.performanceScore}
      </td>
      <td className="num">
        {site.leadsThisMonth === 0 ? <span className="cc-dim">{DASH}</span> : count(site.leadsThisMonth)}
      </td>
      <td className="num">
        {site.trafficThisMonth === null ? <span className="cc-faint">{DASH}</span> : compact(site.trafficThisMonth)}
      </td>
      <td>
        <span className={`cc-chip ${HEALTH_TONE[site.health.state]}`} title={site.health.reasons.map((r) => r.label).join(" · ") || "Nothing wrong"}>
          {site.health.label}
        </span>
      </td>
      <td className="cc-dim">{ago(site.updatedAt)}</td>
    </tr>
  );
}

function Portfolio({ board, filters }: { board: Board; filters: WebsiteFilters }) {
  const filtered = Boolean(
    filters.q || filters.client || filters.type || filters.status || filters.owner || filters.attention || filters.renewal
  );

  return (
    <Panel
      title="Portfolio"
      sub={`${count(board.rows.length)} ${board.rows.length === 1 ? "site" : "sites"}`}
      icon={<IconLayers size={15} />}
      className="cc-s12"
    >
      {board.rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Nothing matches those filters"
            text="Clear a filter or two and the rest of the portfolio comes back."
            cta={{ href: "/admin/websites", label: "Clear filters" }}
          />
        ) : (
          <EmptyState
            icon={<IconGlobe size={17} />}
            title="No websites have been added yet"
            text="Add the sites you build, host or maintain — including your own. Leads are attributed to them by landing page automatically, so the numbers start filling in on their own."
          />
        )
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Website</th>
                <th>Domain</th>
                <th>Status</th>
                <th>Type</th>
                <th className="num">Revenue</th>
                <th className="num">Uptime</th>
                <th className="num">Perf</th>
                <th className="num">Leads</th>
                <th className="num">Traffic</th>
                <th>Health</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((s) => (
                <PortfolioRow site={s} key={s.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── Health overview ───────────────────────────────────────────────── */

function Health({ board }: { board: Board }) {
  const total = board.healthBreakdown.reduce((t, h) => t + h.count, 0);
  const slices = board.healthBreakdown.map((h) => ({
    label: h.label,
    value: h.count,
    share: total > 0 ? h.count / total : 0,
  }));

  const unmonitored = board.healthBreakdown.find((h) => h.state === "unmonitored")?.count ?? 0;

  return (
    <Panel title="Website health" icon={<IconPulse size={15} />} className="cc-s6">
      {slices.length === 0 ? (
        <EmptyState title="Nothing to score" text="Health appears once there are websites in the portfolio." />
      ) : (
        <>
          <div className="cc-donut-wrap">
            <Donut
              slices={slices}
              total={count(total)}
              caption={total === 1 ? "site" : "sites"}
              format={(v) => count(v)}
            />
            <Legend slices={slices} format={(v) => count(v)} />
          </div>
          {unmonitored > 0 ? (
            <p className="cc-note">
              {unmonitored === 1 ? "One site is" : `${unmonitored} sites are`} live with nothing
              watching {unmonitored === 1 ? "it" : "them"} — no uptime check, deployment feed or
              analytics is connected, so an outage would go unnoticed. That is why they are not
              counted as healthy.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/* ── Websites by type ──────────────────────────────────────────────── */

function ByType({ board }: { board: Board }) {
  const total = board.byType.reduce((t, x) => t + x.count, 0);
  const slices = board.byType.map((t) => ({
    label: t.label,
    value: t.count,
    share: total > 0 ? t.count / total : 0,
  }));

  return (
    <Panel title="Websites by type" icon={<IconLayers size={15} />} className="cc-s6">
      {slices.length === 0 ? (
        <EmptyState title="Nothing to break down" text="This fills in from the websites you add." />
      ) : (
        <div className="cc-donut-wrap">
          <Donut
            slices={slices}
            total={count(total)}
            caption={total === 1 ? "site" : "sites"}
            format={(v) => count(v)}
          />
          <Legend slices={slices} format={(v) => count(v)} />
        </div>
      )}
    </Panel>
  );
}

/* ── Recent deployments ────────────────────────────────────────────── */

const DEPLOY_TONE: Record<string, string> = {
  success: "t-ok",
  building: "t-info",
  failed: "t-risk",
  canceled: "t-muted",
};

function Deployments({ board }: { board: Board }) {
  return (
    <Panel title="Recent deployments" icon={<IconServer size={15} />} className="cc-s6">
      {board.deployments.length === 0 ? (
        <EmptyState
          icon={<IconServer size={17} />}
          title="No deployment data"
          text={
            board.connected.vercel
              ? "Vercel is connected but nothing has synced yet."
              : "Vercel is not connected. The table that holds deployments exists and is shaped like Vercel's own deployment object, so connecting a token later fills this in without a redesign."
          }
        />
      ) : (
        <ul className="cc-feed">
          {board.deployments.map((d) => (
            <li className="cc-feed-item" key={d.id}>
              <span className="cc-feed-main">
                <span className="cc-feed-title">{d.websiteName}</span>
                <span className="cc-feed-sub">
                  {d.environment}
                  {d.gitBranch ? ` · ${d.gitBranch}` : ""}
                </span>
              </span>
              <span className={`cc-chip ${DEPLOY_TONE[d.status] ?? "t-muted"}`}>{d.status}</span>
              <span className="cc-feed-when">{ago(d.deployedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Upcoming renewals ─────────────────────────────────────────────── */

function Renewals({ board }: { board: Board }) {
  return (
    <Panel
      title="Upcoming renewals"
      sub="Domains, hosting, SSL and support"
      icon={<IconAlert size={15} />}
      className="cc-s6"
    >
      {board.renewals.length === 0 ? (
        <EmptyState
          title="No renewals recorded"
          text="Domain and hosting renewal dates are tracked per site. Client subscription dates come from Stripe and live on the client record."
        />
      ) : (
        <ul className="cc-health">
          {board.renewals.map((r) => {
            const tone = r.daysUntil < 0 ? "t-risk" : r.daysUntil <= 7 ? "t-warn" : r.daysUntil <= 30 ? "t-info" : "t-muted";
            const when =
              r.daysUntil < 0
                ? `${Math.abs(r.daysUntil)}d overdue`
                : r.daysUntil === 0
                  ? "today"
                  : `in ${r.daysUntil}d`;
            return (
              <li className="cc-health-row" key={`${r.websiteId}-${r.kind}-${r.renewsAt}`}>
                <div className="cc-health-name">{r.websiteName}</div>
                <div className="cc-health-detail">
                  {r.kind === "ssl" ? "SSL" : r.kind} · {shortDate(r.renewsAt)}
                </div>
                <span className={`cc-chip ${tone}`}>{when}</span>
                <span className="cc-mono">{r.amountCents === null ? DASH : money(r.amountCents)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ── Top performers ────────────────────────────────────────────────── */

function TopPerformers({ board }: { board: Board }) {
  return (
    <Panel
      title="Top performing websites"
      sub="By leads, last 30 days"
      icon={<IconChart size={15} />}
      className="cc-s6"
      action={{ href: "/admin/leads", label: "Leads" }}
    >
      {board.topByLeads.length === 0 ? (
        <EmptyState
          title="No leads attributed yet"
          text="A lead is credited to the site whose domain it landed on. Once forms start converting, the ranking builds itself — no analytics connection needed."
        />
      ) : (
        <div className="cc-barlist">
          {board.topByLeads.map((t) => (
            <div className="cc-barrow" key={t.id}>
              <span className="cc-barrow-label">{t.name}</span>
              <span className="cc-barrow-track">
                <span
                  className="cc-barrow-fill"
                  style={{ width: `${(t.leads / board.topByLeads[0].leads) * 100}%` }}
                />
              </span>
              <span className="cc-barrow-value">{count(t.leads)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Traffic ───────────────────────────────────────────────────────── */

/**
 * One panel, not three.
 *
 * The spec asked for Traffic Overview, Top Traffic Sources and per-site
 * traffic. All three read from the same place, and that place does not exist
 * yet — there is no analytics credential in this project. Three separate
 * "not connected" cards would be three times the noise for one fact, so this
 * says it once and says what connecting it would turn on.
 */
function Traffic({ board }: { board: Board }) {
  return (
    <Panel title="Traffic" icon={<IconChart size={15} />} className="cc-s6">
      {board.connected.analytics ? (
        <EmptyState
          title="Connected, nothing synced"
          text="An analytics integration is recorded but no data has come through yet."
        />
      ) : (
        <>
          <EmptyState
            icon={<IconChart size={17} />}
            title="Analytics not connected"
            text="No analytics property is connected to any site in the portfolio, so visitor counts, sessions and traffic sources cannot be shown. Lead counts on this page are real — they come from your own database, not from analytics."
            cta={{ href: "/admin/settings", label: "Open settings" }}
          />
          <p className="cc-note">
            Connecting one analytics property would fill in: traffic per site, portfolio traffic
            over time, and the source breakdown — organic, direct, referral, social, paid.
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── Quick actions ─────────────────────────────────────────────────── */

/**
 * Only two of these do anything today, and the other four say so.
 *
 * A disabled control that explains itself is more useful than a live one that
 * fails, and far more useful than hiding the feature entirely — knowing the
 * audit is one connection away is worth something.
 */
function QuickActions({ board }: { board: Board }) {
  const actions: { label: string; hint: string; href?: string; icon: React.ReactNode }[] = [
    {
      label: "Run website audit",
      hint: "Crawls your own site now",
      href: "/admin/marketing/seo",
      icon: <IconSpark size={16} />,
    },
    {
      label: "Review renewals",
      hint: `${board.renewals.length} recorded`,
      href: "/admin/websites?renewal=30",
      icon: <IconAlert size={16} />,
    },
    {
      label: "View clients",
      hint: `${board.kpis.hostingClients} paying`,
      href: "/admin/clients",
      icon: <IconUsers size={16} />,
    },
    {
      label: "Connect Vercel",
      hint: "No deployment token yet",
      icon: <IconServer size={16} />,
    },
    {
      label: "Connect analytics",
      hint: "No analytics property yet",
      icon: <IconChart size={16} />,
    },
    {
      label: "AI website manager",
      hint: "Needs a site with real data first",
      icon: <IconSpark size={16} />,
    },
  ];

  return (
    <Panel title="Quick actions" icon={<IconZap size={15} />} className="cc-s12">
      <div className="cc-jobs">
        {actions.map((a) =>
          a.href ? (
            <Link className="cc-job-btn" href={a.href} key={a.label}>
              <span className="cc-job-icon">{a.icon}</span>
              <span className="cc-job-label">{a.label}</span>
              <span className="cc-job-hint">{a.hint}</span>
            </Link>
          ) : (
            <button className="cc-job-btn" key={a.label} type="button" disabled>
              <span className="cc-job-icon">{a.icon}</span>
              <span className="cc-job-label">{a.label}</span>
              <span className="cc-job-hint">{a.hint}</span>
            </button>
          )
        )}
      </div>
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function WebsitesBoard({ filters }: { filters: WebsiteFilters }) {
  const supabase = await createSupabaseServerClient();
  const board = await loadWebsiteBoard(supabase, filters);

  const types = (Object.keys(TYPE_LABELS) as WebsiteType[]).map((k) => ({
    key: k,
    label: TYPE_LABELS[k],
  }));
  const statuses = (Object.keys(STATUS_LABELS) as WebsiteStatus[]).map((k) => ({
    key: k,
    label: STATUS_LABELS[k],
  }));

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Websites</h1>
          <p>Manage and monitor all websites across your portfolio.</p>
        </div>
        <div className="cc-greet-actions">
          <AddWebsite clients={board.clients} />
        </div>
      </div>

      <KpiRow board={board} />
      <Tabs board={board} filters={filters} />
      <WebsiteFiltersBar
        clients={board.clients}
        owners={board.owners}
        types={types}
        statuses={statuses}
      />

      <div className="cc-board">
        {/* Paired tall-with-tall so a short panel is not left beside a long
            one with a column of empty space under it. */}
        <Portfolio board={board} filters={filters} />
        <Health board={board} />
        <Traffic board={board} />
        <Renewals board={board} />
        <TopPerformers board={board} />
        <Deployments board={board} />
        <ByType board={board} />
        <QuickActions board={board} />
      </div>
    </>
  );
}

export function WebsitesBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="Portfolio" rows={6} />
      <PanelSkeleton title="Website health" rows={4} />
      <PanelSkeleton title="Upcoming renewals" rows={4} />
    </div>
  );
}
