import Link from "next/link";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadAppBoard, type AppBoard as Board, type AppFilters, type AppRow } from "@/lib/apps/queries";
import { loadAppChoices } from "@/lib/apps/detail";
import { providerConnections } from "@/lib/apps/providers";
import { DEFAULT_VERCEL_TEAM_ID } from "@/lib/vercel/website-sync";
import { HEALTH_TONE, LIFECYCLE_TONE } from "@/lib/apps/types";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import { Donut, Legend } from "../Viz";
import { ago, count, DASH, money, moneyCompact, shortDate } from "../format";
import AddApp from "../apps/AddApp";
import AppFiltersBar from "../apps/AppFilters";
import AppRowActions from "../apps/AppRowActions";
import AppSync from "../apps/AppSync";
import ManageIntegrations, { type ProviderCard } from "../apps/ManageIntegrations";
import RunChecks from "../apps/RunChecks";
import {
  IconAlert,
  IconBriefcase,
  IconCode,
  IconDollar,
  IconLayers,
  IconPulse,
  IconServer,
  IconUsers,
  IconZap,
} from "../Icons";

/**
 * The application portfolio.
 *
 * The rule that runs through every panel, inherited from the Websites board
 * and made explicit by the brief: a number appears only when something
 * measured it, and MISSING HEALTH DATA IS UNKNOWN, NEVER HEALTHY. An app
 * nobody has checked shows "Unknown" in grey, and the health panel says how
 * many are in that state and what would fix it.
 *
 * The second rule is §34: this page does not call a provider. Everything
 * here is one round of database queries, so a Vercel outage can slow the
 * Sync button and nothing else.
 */

/* ── The six numbers ───────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;

  const cards = [
    {
      label: "Total apps",
      value: count(k.total),
      icon: <IconLayers size={15} />,
      foot: <span className="cc-faint">All registered apps, excluding archived</span>,
      href: "/admin/apps",
    },
    {
      label: "Live apps",
      value: count(k.live),
      icon: <IconZap size={15} />,
      foot: (
        <span className="cc-faint">
          {k.total > 0 ? `${Math.round((k.live / k.total) * 100)}% of the portfolio` : "Nothing registered yet"}
        </span>
      ),
      href: "/admin/apps?tab=live",
    },
    {
      label: "In development",
      value: count(k.inDevelopment),
      icon: <IconCode size={15} />,
      foot: <span className="cc-faint">Planning, building, QA or staging</span>,
      href: "/admin/apps?tab=development",
    },
    {
      label: "Apps with issues",
      value: count(k.withIssues),
      icon: <IconAlert size={15} />,
      foot: (
        <span className={k.withIssues > 0 ? "cc-delta down" : "cc-faint"}>
          {k.withIssues > 0 ? "Need attention now" : "Nothing flagged"}
        </span>
      ),
      href: "/admin/apps?tab=attention",
    },
    {
      label: "Monthly app revenue",
      value: k.monthlyRevenueCents === null ? DASH : moneyCompact(k.monthlyRevenueCents),
      icon: <IconDollar size={15} />,
      foot: (
        <span className="cc-faint">
          {k.monthlyRevenueCents === null
            ? "No recurring app billing recorded"
            : "Recurring, counted once per contract"}
        </span>
      ),
      href: "/admin/invoices",
    },
    {
      label: "Active app clients",
      value: count(k.activeClients),
      icon: <IconUsers size={15} />,
      foot: <span className="cc-faint">Clients with at least one active app</span>,
      href: "/admin/clients",
    },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((card) => (
        <Link className="cc-kpi" key={card.label} href={card.href}>
          <div className="cc-kpi-top">
            <span className="cc-kpi-icon">{card.icon}</span>
            <span className="cc-kpi-label">{card.label}</span>
          </div>
          <div className="cc-kpi-value">{card.value}</div>
          <div className="cc-kpi-foot">{card.foot}</div>
        </Link>
      ))}
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────── */

function Tabs({ board, filters }: { board: Board; filters: AppFilters }) {
  const tabs: { key: AppFilters["tab"]; label: string }[] = [
    { key: "all", label: "All apps" },
    { key: "live", label: "Live" },
    { key: "development", label: "In development" },
    { key: "attention", label: "Needs attention" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="cc-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "all" ? "/admin/apps" : `/admin/apps?tab=${tab.key}`}
          className={`cc-tab ${filters.tab === tab.key ? "is-on" : ""}`}
        >
          {tab.label}
          <span className="cc-tab-n">{count(board.tabCounts[tab.key])}</span>
        </Link>
      ))}
    </div>
  );
}

/* ── Shared cells ──────────────────────────────────────────────────── */

function HealthChip({ app }: { app: AppRow }) {
  const why = app.health.reasons.length
    ? app.health.reasons.map((reason) => reason.label).join(" · ")
    : app.health.state === "unknown"
      ? "Nothing has checked this app recently."
      : "All configured checks passing.";
  return <span className={`cc-chip ${HEALTH_TONE[app.health.state]}`} title={why}>{app.health.label}</span>;
}

function RevenueCell({ app }: { app: AppRow }) {
  if (app.revenueCents === null) {
    return (
      <span className="cc-dim" title="No recurring billing is recorded for this app.">
        {DASH}
      </span>
    );
  }
  return (
    <span
      title={
        app.revenueSource === "client_service"
          ? "From the client service assignment this app is linked to."
          : "From the agreed monthly fee on this app."
      }
    >
      {money(app.revenueCents)}
      <span className="cc-faint"> /mo</span>
    </span>
  );
}

function DeployCell({ app }: { app: AppRow }) {
  if (!app.lastDeploy) return <span className="cc-faint">{DASH}</span>;
  return (
    <span title={`${new Date(app.lastDeploy.at).toLocaleString("en-US")} · ${app.lastDeploy.environment} · ${app.lastDeploy.status}`}>
      {ago(app.lastDeploy.at)}
      <span className="cc-client-sub">{shortDate(app.lastDeploy.at)}</span>
    </span>
  );
}

/* ── The table ─────────────────────────────────────────────────────── */

function PortfolioTable({ board, canManage }: { board: Board; canManage: boolean }) {
  return (
    <div className="cc-scroll">
      <table className="cc-table dense">
        <thead>
          <tr>
            <th>App</th>
            <th>Client / Owner</th>
            <th>Platform</th>
            <th>Status</th>
            <th>Environment</th>
            <th>Health</th>
            <th>Production</th>
            <th>Last deploy</th>
            <th className="num">Revenue</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((app) => (
            <tr key={app.id}>
              <td>
                <Link className="cc-link cc-strong" href={`/admin/apps/${app.id}`}>{app.name}</Link>
                <span className="cc-client-sub">{app.internalName || app.slug}</span>
              </td>
              <td>
                {app.client ? (
                  <Link className="cc-link" href={`/admin/clients/${app.client.id}`}>{app.client.name}</Link>
                ) : (
                  <span className="cc-dim">Internal</span>
                )}
                <span className="cc-client-sub">{app.ownershipLabel}</span>
              </td>
              <td className="cc-dim">{app.platformLabel}</td>
              <td><span className={`cc-chip ${LIFECYCLE_TONE[app.status]}`}>{app.statusLabel}</span></td>
              <td className="cc-dim">{app.environmentLabel}</td>
              <td><HealthChip app={app} /></td>
              <td>
                {app.productionUrl ? (
                  <a className="cc-link" href={app.productionUrl} target="_blank" rel="noopener noreferrer nofollow">
                    {app.productionDomain ?? "Open"}
                  </a>
                ) : (
                  <span className="cc-faint">Not deployed</span>
                )}
              </td>
              <td className="cc-dim"><DeployCell app={app} /></td>
              <td className="num"><RevenueCell app={app} /></td>
              <td>
                <AppRowActions
                  appId={app.id}
                  productionUrl={app.productionUrl}
                  stagingUrl={app.stagingUrl}
                  clientId={app.client?.id ?? null}
                  projectId={app.jobId}
                  isArchived={app.isArchived}
                  canManage={canManage}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Cards ─────────────────────────────────────────────────────────── */

function PortfolioCards({ board, canManage }: { board: Board; canManage: boolean }) {
  return (
    <div className="cc-appcards">
      {board.rows.map((app) => (
        <article className="cc-appcard" key={app.id}>
          <div className="cc-appcard-top">
            <span className="cc-mono">{(app.internalName || app.name).slice(0, 2).toUpperCase()}</span>
            <span className="cc-appcard-name">
              <Link className="cc-link" href={`/admin/apps/${app.id}`}>{app.name}</Link>
            </span>
            <AppRowActions
              appId={app.id}
              productionUrl={app.productionUrl}
              stagingUrl={app.stagingUrl}
              clientId={app.client?.id ?? null}
              projectId={app.jobId}
              isArchived={app.isArchived}
              canManage={canManage}
            />
          </div>

          <div className="cc-appcard-sub">
            {app.client ? app.client.name : "Internal"} · {app.platformLabel}
          </div>

          <div className="cc-taglist" style={{ marginTop: 8 }}>
            <span className={`cc-chip ${LIFECYCLE_TONE[app.status]}`}>{app.statusLabel}</span>
            <HealthChip app={app} />
          </div>

          <dl className="cc-kv" style={{ marginTop: 10 }}>
            <dt>Production</dt>
            <dd>
              {app.productionUrl ? (
                <a className="cc-link" href={app.productionUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {app.productionDomain ?? "Open"}
                </a>
              ) : (
                <span className="cc-faint">Not deployed</span>
              )}
            </dd>
            <dt>Last deploy</dt>
            <dd>{app.lastDeploy ? ago(app.lastDeploy.at) : DASH}</dd>
            <dt>Revenue</dt>
            <dd><RevenueCell app={app} /></dd>
          </dl>

          <div className="cc-rowacts" style={{ marginTop: 10 }}>
            <Link className="cc-btn is-sm" href={`/admin/apps/${app.id}`}>Open app</Link>
            {app.productionUrl ? (
              <a className="cc-btn is-sm" href={app.productionUrl} target="_blank" rel="noopener noreferrer nofollow">
                Production
              </a>
            ) : null}
            {app.stagingUrl ? (
              <a className="cc-btn is-sm" href={app.stagingUrl} target="_blank" rel="noopener noreferrer nofollow">
                Staging
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function Portfolio({
  board,
  filters,
  canManage,
}: {
  board: Board;
  filters: AppFilters;
  canManage: boolean;
}) {
  const filtered = Boolean(
    filters.q || filters.status || filters.platform || filters.ownership ||
    filters.health || filters.environment || filters.client
  );

  return (
    <Panel
      title="Portfolio"
      sub={`${count(board.rows.length)} ${board.rows.length === 1 ? "app" : "apps"}`}
      icon={<IconLayers size={15} />}
      className="cc-s12"
    >
      {board.rows.length === 0 ? (
        board.empty ? (
          <EmptyState
            icon={<IconLayers size={17} />}
            title="No apps yet"
            text="Register your first web or mobile application to start tracking deployments, health, clients, integrations and revenue. If your Vercel account is connected, Sync Apps will find the projects for you to register."
          />
        ) : filtered ? (
          <EmptyState
            title="Nothing matches those filters"
            text="Clear a filter or two and the rest of the portfolio comes back."
            cta={{ href: "/admin/apps", label: "Clear filters" }}
          />
        ) : (
          <EmptyState
            title="Nothing in this tab"
            text="Every app is in another state right now."
            cta={{ href: "/admin/apps", label: "See all apps" }}
          />
        )
      ) : filters.view === "cards" ? (
        <PortfolioCards board={board} canManage={canManage} />
      ) : (
        <PortfolioTable board={board} canManage={canManage} />
      )}
    </Panel>
  );
}

/* ── Health ────────────────────────────────────────────────────────── */

function Health({ board }: { board: Board }) {
  const total = board.healthBreakdown.reduce((sum, item) => sum + item.count, 0);
  const slices = board.healthBreakdown.map((item) => ({
    label: item.label,
    value: item.count,
    share: total > 0 ? item.count / total : 0,
  }));
  const unknown = board.healthBreakdown.find((item) => item.state === "unknown")?.count ?? 0;

  return (
    <Panel title="Portfolio health" icon={<IconPulse size={15} />} className="cc-s6">
      {slices.length === 0 ? (
        <EmptyState title="Nothing to score" text="Health appears once there are apps in the portfolio." />
      ) : (
        <>
          <div className="cc-donut-wrap">
            <Donut slices={slices} total={count(total)} caption={total === 1 ? "app" : "apps"} format={(v) => count(v)} />
            <Legend slices={slices} format={(v) => count(v)} />
          </div>
          {unknown > 0 ? (
            <p className="cc-note">
              {unknown === 1 ? "One app has" : `${unknown} apps have`} no recent health data, so
              their state is Unknown rather than healthy — nothing has looked at
              {unknown === 1 ? " it" : " them"} in the last day. Add an environment URL or connect a
              provider, then run the checks.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/* ── Alerts ────────────────────────────────────────────────────────── */

function Alerts({ board }: { board: Board }) {
  return (
    <Panel
      title="Needs attention"
      sub={board.alerts.length > 0 ? `${board.alerts.length} open` : undefined}
      icon={<IconAlert size={15} />}
      className="cc-s6"
      bodyClass={board.alerts.length === 0 ? "" : "flush"}
    >
      {board.alerts.length === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          text="No app is reporting a failing check, a failed production deployment, an open incident or an expiring certificate."
        />
      ) : (
        <div className="cc-alerts">
          {board.alerts.map((alert) => (
            <Link
              key={alert.id}
              href={`/admin/apps/${alert.appId}?tab=health`}
              className={`cc-alert p-${alert.severity === "critical" ? "critical" : "medium"}`}
            >
              <span className="cc-alert-pri" />
              <span className="cc-alert-main">
                <span className="cc-alert-title">
                  {alert.appName} — {alert.title}
                </span>
                <span className="cc-alert-detail">{alert.detail}</span>
              </span>
              <span className="cc-alert-cat">{alert.severity}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Deployments ───────────────────────────────────────────────────── */

const DEPLOY_TONE: Record<string, string> = {
  success: "t-ok",
  building: "t-info",
  queued: "t-muted",
  failed: "t-risk",
  canceled: "t-muted",
};

function Deployments({ board, connected }: { board: Board; connected: boolean }) {
  return (
    <Panel title="Recent deployments" icon={<IconServer size={15} />} className="cc-s6">
      {board.recentDeployments.length === 0 ? (
        <EmptyState
          icon={<IconServer size={17} />}
          title="No deployment data"
          text={
            connected
              ? "Vercel is connected but no app has been linked to a project yet. Sync Apps will offer the projects it finds."
              : "No deployment provider is connected. The table that holds deployments is shaped like Vercel's own deployment object, so connecting an account fills this in without a redesign — and until then this stays empty rather than showing an invented build."
          }
        />
      ) : (
        <ul className="cc-feed">
          {board.recentDeployments.map((deployment) => (
            <li className="cc-feed-item" key={deployment.id}>
              <span className="cc-feed-main">
                <Link className="cc-feed-title cc-link" href={`/admin/apps/${deployment.appId}?tab=deployments`}>
                  {deployment.appName}
                </Link>
                <span className="cc-feed-sub">
                  {deployment.environment}
                  {deployment.branch ? ` · ${deployment.branch}` : ""}
                </span>
              </span>
              <span className={`cc-chip ${DEPLOY_TONE[deployment.status] ?? "t-muted"}`}>{deployment.status}</span>
              <span className="cc-feed-when">{ago(deployment.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Platform mix ──────────────────────────────────────────────────── */

function ByPlatform({ board }: { board: Board }) {
  const total = board.byPlatform.reduce((sum, item) => sum + item.count, 0);
  const slices = board.byPlatform.map((item) => ({
    label: item.label,
    value: item.count,
    share: total > 0 ? item.count / total : 0,
  }));

  return (
    <Panel title="Apps by platform" icon={<IconLayers size={15} />} className="cc-s6">
      {slices.length === 0 ? (
        <EmptyState title="Nothing to break down" text="This fills in from the apps you register." />
      ) : (
        <div className="cc-donut-wrap">
          <Donut slices={slices} total={count(total)} caption={total === 1 ? "app" : "apps"} format={(v) => count(v)} />
          <Legend slices={slices} format={(v) => count(v)} />
        </div>
      )}
    </Panel>
  );
}

/* ── Infrastructure ────────────────────────────────────────────────── */

function Infrastructure({
  board,
  providers,
}: {
  board: Board;
  providers: ProviderCard[];
}) {
  return (
    <Panel title="Infrastructure" sub="Connections and coverage" icon={<IconServer size={15} />} className="cc-s6">
      <ul className="cc-health">
        {providers.map((provider) => {
          const linked = board.connected[provider.key] ?? 0;
          return (
            <li className="cc-health-row" key={provider.key}>
              <div className="cc-health-name">{provider.label}</div>
              <div className="cc-health-detail">
                {provider.connected
                  ? `${linked} ${linked === 1 ? "app" : "apps"} linked`
                  : "No account connected"}
              </div>
              <span className={`cc-chip ${provider.connected ? "t-ok" : "t-muted"}`}>
                {provider.connected ? "Connected" : "Not connected"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="cc-note">
        A provider that is not connected shows nothing rather than a zero. Connect one from
        Manage Integrations — the token is stored server-side and never reaches a browser.
      </p>
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function AppsBoard({ filters }: { filters: AppFilters }) {
  const session = await getAdminUser();
  const canManage = ["owner", "admin"].includes(session?.admin.role ?? "viewer");

  const supabase = await createSupabaseServerClient();
  const [board, choices, connections] = await Promise.all([
    loadAppBoard(supabase, filters),
    loadAppChoices(supabase),
    providerConnections(),
  ]);

  const providers: ProviderCard[] = [
    {
      key: "vercel",
      label: "Vercel",
      connected: connections.vercel.connected,
      accountLabel: connections.vercel.accountLabel,
      connectedAt: connections.vercel.connectedAt,
      lastError: connections.vercel.lastError,
      unlocks:
        "Deployment history, build status, production and preview URLs, domains and framework — synced onto the apps you link.",
      tokenHint: "Paste a Vercel token",
      tokenUrl: "https://vercel.com/account/tokens",
      needsTeam: true,
      defaultTeam: DEFAULT_VERCEL_TEAM_ID,
    },
    {
      key: "github",
      label: "GitHub",
      connected: connections.github.connected,
      accountLabel: connections.github.accountLabel,
      connectedAt: connections.github.connectedAt,
      lastError: connections.github.lastError,
      unlocks:
        "Latest commit, author and date, default branch, and open issue and pull request counts on each app's repository.",
      tokenHint: "Paste a GitHub token",
      tokenUrl: "https://github.com/settings/tokens",
    },
    {
      key: "supabase",
      label: "Supabase",
      connected: connections.supabase.connected,
      accountLabel: connections.supabase.accountLabel,
      connectedAt: connections.supabase.connectedAt,
      lastError: connections.supabase.lastError,
      unlocks:
        "Project name, region, status and per-service health for the database behind each app. No keys, no connection strings.",
      tokenHint: "Paste a Supabase management token",
      tokenUrl: "https://supabase.com/dashboard/account/tokens",
    },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Apps</h1>
          <p>
            Manage every web and mobile application, deployment, client, environment,
            integration, health signal and revenue stream from one place.
          </p>
        </div>
        <div className="cc-greet-actions">
          <RunChecks canManage={canManage} label="Run checks" />
          <AppSync
            connected={connections.vercel.connected}
            apps={board.rows.map((app) => ({ id: app.id, name: app.name }))}
            canManage={canManage}
          />
          <ManageIntegrations providers={providers} />
          {canManage ? (
            <AddApp
              clients={choices.clients}
              projects={choices.projects}
              services={choices.services}
              people={choices.people}
            />
          ) : null}
        </div>
      </div>

      <KpiRow board={board} />
      <Tabs board={board} filters={filters} />
      <AppFiltersBar clients={board.clients} />

      <div className="cc-board">
        <Portfolio board={board} filters={filters} canManage={canManage} />
        <Health board={board} />
        <Alerts board={board} />
        <Deployments board={board} connected={connections.vercel.connected} />
        <Infrastructure board={board} providers={providers} />
        <ByPlatform board={board} />
        <PlatformCoverage board={board} />
      </div>
    </>
  );
}

/**
 * What the portfolio is missing, said plainly.
 *
 * Every line here is a gap somebody can close, and each is a count of real
 * rows rather than a score. This is the panel that stops "Unknown" from
 * being a mystery.
 */
function PlatformCoverage({ board }: { board: Board }) {
  const gaps = [
    {
      label: "No production URL recorded",
      count: board.rows.filter((app) => !app.productionUrl && app.status === "live").length,
      detail: "Live apps with nowhere for a check to look.",
      href: "/admin/apps?tab=live",
    },
    {
      label: "No health data",
      count: board.rows.filter((app) => !app.health.observed && !app.isArchived).length,
      detail: "Never checked, or last checked more than a day ago.",
      href: "/admin/apps?health=unknown",
    },
    {
      label: "No client or owner",
      count: board.rows.filter((app) => !app.client && app.ownership !== "internal").length,
      detail: "Client-owned apps with no client attached.",
      href: "/admin/apps?ownership=client",
    },
    {
      label: "No recurring billing",
      count: board.rows.filter((app) => app.revenueCents === null && app.ownership !== "internal").length,
      detail: "Client apps with no monthly fee or service assignment recorded.",
      href: "/admin/apps",
    },
    {
      label: "Open issues",
      count: board.rows.reduce((sum, app) => sum + app.openIssues, 0),
      detail: "Tasks linked to an app and not finished.",
      href: "/admin/tasks",
    },
  ].filter((gap) => gap.count > 0);

  return (
    <Panel title="Gaps worth closing" icon={<IconBriefcase size={15} />} className="cc-s6">
      {gaps.length === 0 ? (
        <EmptyState
          title="Nothing obvious missing"
          text="Every app has an owner, a place to check and a billing answer."
        />
      ) : (
        <ul className="cc-health">
          {gaps.map((gap) => (
            <li className="cc-health-row" key={gap.label}>
              <div className="cc-health-name">
                <Link className="cc-link" href={gap.href}>{gap.label}</Link>
              </div>
              <div className="cc-health-detail">{gap.detail}</div>
              <span className="cc-chip t-muted">{count(gap.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function AppsBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="Portfolio" rows={6} />
      <PanelSkeleton title="Portfolio health" rows={4} />
      <PanelSkeleton title="Needs attention" rows={4} />
    </div>
  );
}
