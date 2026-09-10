import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  loadApp,
  loadAppActivity,
  loadAppChoices,
  loadAppRevenue,
  loadAppTasks,
  loadDeployments,
  loadHealthHistory,
  type AppDetail,
} from "@/lib/apps/detail";
import { githubRepo, providerConnections, supabaseProject } from "@/lib/apps/providers";
import {
  DEPLOYMENT_TONE,
  ENVIRONMENT_TONE,
  HEALTH_LABELS,
  HEALTH_TONE,
  INTEGRATION_LABELS,
  INTEGRATION_STATUS_LABELS,
  INTEGRATION_TONE,
  LIFECYCLE_TONE,
  SEVERITY_TONE,
  SSL_TONE,
  isUuid,
  type EnvironmentType,
  type HealthState,
  type IncidentSeverity,
  type IntegrationStatus,
  type SslStatus,
} from "@/lib/apps/types";
import { EmptyState, Panel } from "@/components/admin/cc/Panel";
import { ago, count, DASH, money, shortDate } from "@/components/admin/cc/format";
import {
  AddDomain,
  AddEnvironment,
  AddIntegration,
  DeploymentActions,
  EditDomain,
  EditEnvironment,
  EditIntegration,
  NewAppTask,
  NewIncident,
  RemoveDomain,
  RemoveEnvironment,
  RemoveIntegration,
  ResolveIncident,
  SettingsForm,
  ActionForm,
} from "@/components/admin/cc/apps/AppForms";
import RunChecks from "@/components/admin/cc/apps/RunChecks";
import { archiveAppAction, restoreAppAction } from "@/app/admin/app-actions";
import {
  IconAlert,
  IconBriefcase,
  IconChart,
  IconCheckSquare,
  IconCode,
  IconDollar,
  IconGlobe,
  IconLayers,
  IconPulse,
  IconServer,
  IconSettings,
  IconUsers,
} from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";

const TABS = [
  "Overview", "Deployments", "Health", "Environments", "Domains", "Database",
  "Integrations", "Users", "Revenue", "Tasks & Issues", "Activity", "Settings",
] as const;

type Tab = (typeof TABS)[number];

const slugOf = (tab: string): string =>
  tab.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "App" };
  const supabase = await createSupabaseServerClient();
  const app = await loadApp(supabase, id).catch(() => null);
  return { title: app ? `${app.name} — Apps` : "App" };
}

/**
 * One app, everything about it.
 *
 * The order of the tabs is the order the questions get asked: what is it and
 * is it up, what shipped, is it healthy, where does it run, what answers on
 * it, what stores its data, what it depends on, who uses it, what it earns,
 * what is outstanding, what has happened, and finally how to change it.
 *
 * Every tab loads only its own data. Opening Overview does not pay for the
 * deployment history, and a provider that is down costs one panel rather
 * than the page.
 */
export default async function AppDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const canManage = ["owner", "admin"].includes(session.admin.role);

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const app = await loadApp(supabase, id);
  if (!app) notFound();

  const query = await searchParams;
  const requested = typeof query.tab === "string" ? query.tab : "overview";
  const tab: Tab = TABS.find((candidate) => slugOf(candidate) === requested) ?? "Overview";
  const page = Math.max(1, Math.min(500, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1));

  let content: React.ReactNode = null;

  if (tab === "Overview") {
    content = <OverviewTab app={app} canManage={canManage} />;
  } else if (tab === "Deployments") {
    const { rows, total } = await loadDeployments(supabase, app.id, page);
    content = <DeploymentsTab app={app} rows={rows} total={total} page={page} canManage={canManage} />;
  } else if (tab === "Health") {
    const history = await loadHealthHistory(supabase, app.id);
    content = <HealthTab app={app} history={history} canManage={canManage} />;
  } else if (tab === "Environments") {
    content = <EnvironmentsTab app={app} canManage={canManage} />;
  } else if (tab === "Domains") {
    content = <DomainsTab app={app} canManage={canManage} />;
  } else if (tab === "Database") {
    content = await databaseTab(app);
  } else if (tab === "Integrations") {
    content = await integrationsTab(app, canManage);
  } else if (tab === "Users") {
    content = <UsersTab app={app} />;
  } else if (tab === "Revenue") {
    const revenue = await loadAppRevenue(supabase, app);
    content = <RevenueTab app={app} revenue={revenue} />;
  } else if (tab === "Tasks & Issues") {
    const [tasks, choices] = await Promise.all([loadAppTasks(supabase, app.id), loadAppChoices(supabase)]);
    content = <TasksTab app={app} tasks={tasks} people={choices.people} canManage={canManage} />;
  } else if (tab === "Activity") {
    const activity = await loadAppActivity(supabase, app.id);
    content = <ActivityTab items={activity} />;
  } else {
    const choices = await loadAppChoices(supabase);
    content = <SettingsTab app={app} choices={choices} canManage={canManage} />;
  }

  return (
    <>
      <div className="cc-greet">
        <div className="cc-idhead">
          <span className="cc-mono lg">{(app.internalName || app.name).slice(0, 2).toUpperCase()}</span>
          <div>
            <Link className="cc-link" href="/admin/apps">← Apps</Link>
            <h1>{app.name}</h1>
            <p>
              {[
                app.platformLabel,
                app.ownershipLabel,
                app.client ? app.client.name : "Internal",
                app.framework,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="cc-taglist" style={{ marginTop: 8 }}>
              <span className={`cc-chip ${LIFECYCLE_TONE[app.status]}`}>{app.statusLabel}</span>
              <span className={`cc-chip ${HEALTH_TONE[app.health.state]}`}>{app.health.label}</span>
              {app.currentVersion ? <span className="cc-chip t-muted">v{app.currentVersion}</span> : null}
              {app.openIncidents.length > 0 ? (
                <span className="cc-chip t-risk">
                  {app.openIncidents.length} open {app.openIncidents.length === 1 ? "incident" : "incidents"}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="cc-greet-actions">
          {app.productionUrl ? (
            <a className="cc-btn" href={app.productionUrl} target="_blank" rel="noopener noreferrer nofollow">
              Open production
            </a>
          ) : null}
          {app.stagingUrl ? (
            <a className="cc-btn" href={app.stagingUrl} target="_blank" rel="noopener noreferrer nofollow">
              Open staging
            </a>
          ) : null}
          <RunChecks appId={app.id} canManage={canManage} label="Run checks" />
        </div>
      </div>

      <nav className="cc-tabs" aria-label="App sections">
        {TABS.map((candidate) => (
          <Link
            key={candidate}
            href={`?tab=${slugOf(candidate)}`}
            className={`cc-tab ${tab === candidate ? "is-on" : ""}`}
            aria-current={tab === candidate ? "page" : undefined}
          >
            {candidate}
            {candidate === "Tasks & Issues" && app.openTasks > 0 ? (
              <span className="cc-tab-n">{count(app.openTasks)}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="cc-board">{content}</div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Overview
   ══════════════════════════════════════════════════════════════════════ */

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="cc-stat">
      <div className="cc-stat-label">{label}</div>
      <div className={`cc-stat-value ${tone ?? ""}`}>{value}</div>
      {hint ? <div className="cc-stat-hint">{hint}</div> : null}
    </div>
  );
}

function OverviewTab({ app, canManage }: { app: AppDetail; canManage: boolean }) {
  const last = app.lastProductionDeployment;

  return (
    <>
      <Panel title="At a glance" icon={<IconPulse size={15} />} className="cc-s12" bodyClass="flush">
        <div className="cc-stats">
          <Stat
            label="Health"
            value={app.health.label}
            tone={app.health.state === "healthy" ? "t-ok" : app.health.state === "critical" ? "t-risk" : app.health.state === "unknown" ? "t-none" : ""}
            hint={
              app.health.state === "unknown"
                ? "Nothing checked recently"
                : app.health.reasons[0]?.label ?? "All checks passing"
            }
          />
          <Stat
            label="Current version"
            value={app.currentVersion ?? DASH}
            hint={app.currentVersion ? "As recorded for production" : "Not recorded"}
          />
          <Stat
            label="Last deploy"
            value={last ? ago(last.startedAt) : DASH}
            hint={last ? `${last.status} · ${last.branch ?? "no branch"}` : "No deployment recorded"}
          />
          <Stat label="Environments" value={count(app.environments.length)} hint={app.production ? "Production configured" : "No production environment"} />
          <Stat
            label="Monthly fee"
            value={app.monthlyFeeCents === null ? DASH : money(app.monthlyFeeCents)}
            hint={app.billingType === "recurring" ? "Agreed recurring terms" : "No recurring terms"}
          />
          <Stat
            label="Open issues"
            value={count(app.openTasks)}
            tone={app.criticalTasks > 0 ? "t-risk" : undefined}
            hint={app.criticalTasks > 0 ? `${app.criticalTasks} critical` : "Tasks linked to this app"}
          />
        </div>
      </Panel>

      <Panel title="App information" icon={<IconLayers size={15} />} className="cc-s6">
        {app.description ? <p className="cc-note" style={{ marginTop: 0 }}>{app.description}</p> : null}
        <dl className="cc-kv">
          <dt>Client</dt>
          <dd>
            {app.client ? (
              <Link className="cc-link" href={`/admin/clients/${app.client.id}`}>{app.client.name}</Link>
            ) : (
              "Internal — ours"
            )}
          </dd>
          <dt>Ownership</dt>
          <dd>{app.ownershipLabel}</dd>
          <dt>Platform</dt>
          <dd>{app.platformLabel}</dd>
          <dt>Stack</dt>
          <dd>{app.framework ?? DASH}</dd>
          <dt>Technical owner</dt>
          <dd>{app.technicalOwner ?? DASH}</dd>
          <dt>Business owner</dt>
          <dd>{app.businessOwner ?? DASH}</dd>
          <dt>Project</dt>
          <dd>
            {app.project ? (
              <Link className="cc-link" href={`/admin/jobs/${app.project.id}`}>
                {app.project.title} · {app.project.stage}
              </Link>
            ) : (
              DASH
            )}
          </dd>
          <dt>Sold as</dt>
          <dd>
            {app.service ? (
              <Link className="cc-link" href={`/admin/services/${app.service.id}`}>{app.service.name}</Link>
            ) : (
              DASH
            )}
          </dd>
          <dt>Lifecycle</dt>
          <dd>{app.statusLabel}</dd>
          <dt>Created</dt>
          <dd>{shortDate(app.createdAt)}</dd>
          <dt>Updated</dt>
          <dd>{ago(app.updatedAt)}</dd>
        </dl>
      </Panel>

      <Panel title="Production" icon={<IconGlobe size={15} />} className="cc-s6">
        {app.production || app.productionUrl ? (
          <dl className="cc-kv">
            <dt>URL</dt>
            <dd>
              {app.productionUrl ? (
                <a className="cc-link" href={app.productionUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {app.productionUrl}
                </a>
              ) : (
                DASH
              )}
            </dd>
            <dt>Deployment</dt>
            <dd>
              {last ? (
                <span className={`cc-chip ${DEPLOYMENT_TONE[last.status as keyof typeof DEPLOYMENT_TONE] ?? "t-muted"}`}>
                  {last.status}
                </span>
              ) : (
                <span className="cc-faint">No deployment recorded</span>
              )}
            </dd>
            <dt>Version</dt>
            <dd>{app.production?.currentVersion ?? app.currentVersion ?? DASH}</dd>
            <dt>Branch</dt>
            <dd>{app.production?.branch ?? app.productionBranch ?? DASH}</dd>
            <dt>Commit</dt>
            <dd>
              {last?.commitSha ? (
                last.commitUrl ? (
                  <a className="cc-link cc-mono" href={last.commitUrl} target="_blank" rel="noopener noreferrer">
                    {last.commitSha.slice(0, 7)}
                  </a>
                ) : (
                  <span className="cc-mono">{last.commitSha.slice(0, 7)}</span>
                )
              ) : (
                DASH
              )}
            </dd>
            <dt>Deployed</dt>
            <dd>{last ? `${ago(last.startedAt)} · ${shortDate(last.startedAt)}` : DASH}</dd>
          </dl>
        ) : (
          <EmptyState
            title="No production environment"
            text="Add one on the Environments tab with its URL, and the health checks will have somewhere to look."
          />
        )}
      </Panel>

      <Panel title="Infrastructure" icon={<IconServer size={15} />} className="cc-s6">
        <dl className="cc-kv">
          <dt>Hosting</dt>
          <dd>{app.production?.hostingProvider ?? app.environments.find((e) => e.hostingProvider)?.hostingProvider ?? DASH}</dd>
          <dt>Database</dt>
          <dd>{app.production?.databaseProvider ?? app.environments.find((e) => e.databaseProvider)?.databaseProvider ?? DASH}</dd>
          <dt>Repository</dt>
          <dd>
            {app.repoUrl ? (
              <a className="cc-link" href={app.repoUrl} target="_blank" rel="noopener noreferrer">
                {app.repoSlug ?? app.repoUrl}
              </a>
            ) : (
              DASH
            )}
          </dd>
          <dt>Domains</dt>
          <dd>{app.domains.length > 0 ? app.domains.map((d) => d.domain).join(", ") : DASH}</dd>
          <dt>Integrations</dt>
          <dd>
            {app.integrations.length > 0
              ? app.integrations.map((integration) => integration.providerLabel).join(", ")
              : "None recorded"}
          </dd>
        </dl>
      </Panel>

      <Panel
        title="Quick actions"
        icon={<IconCheckSquare size={15} />}
        className="cc-s6"
      >
        <div className="cc-rowacts">
          <Link className="cc-btn is-sm" href="?tab=deployments">Deployments</Link>
          <Link className="cc-btn is-sm" href="?tab=health">Health</Link>
          <Link className="cc-btn is-sm" href="?tab=revenue">Revenue</Link>
          {app.client ? (
            <Link className="cc-btn is-sm" href={`/admin/clients/${app.client.id}`}>View client</Link>
          ) : null}
          {app.project ? (
            <Link className="cc-btn is-sm" href={`/admin/jobs/${app.project.id}`}>View project</Link>
          ) : null}
          {canManage ? <Link className="cc-btn is-sm" href="?tab=settings">Edit app</Link> : null}
        </div>
        {app.notes ? <p className="cc-note">{app.notes}</p> : null}
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Deployments
   ══════════════════════════════════════════════════════════════════════ */

function DeploymentsTab({
  app,
  rows,
  total,
  page,
  canManage,
}: {
  app: AppDetail;
  rows: Awaited<ReturnType<typeof loadDeployments>>["rows"];
  total: number;
  page: number;
  canManage: boolean;
}) {
  const hasVercel = app.integrations.some((i) => i.provider === "vercel" && i.status === "connected");
  const perPage = 25;
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <Panel
      title="Deployment history"
      sub={total > 0 ? `${count(total)} recorded` : undefined}
      icon={<IconServer size={15} />}
      className="cc-s12"
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<IconServer size={17} />}
          title="No deployment data"
          text={
            hasVercel
              ? "This app is linked to a hosting project but nothing has synced yet. Run Sync Apps from the portfolio."
              : "No deployment provider is linked to this app. Connect one from Manage Integrations and link its project — until then this stays empty rather than inventing a build."
          }
        />
      ) : (
        <>
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Environment</th>
                  <th>Version</th>
                  <th>Branch</th>
                  <th>Commit</th>
                  <th>Provider</th>
                  <th>Triggered by</th>
                  <th>Started</th>
                  <th className="num">Duration</th>
                  <th>Links</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((deployment) => (
                  <tr key={deployment.id}>
                    <td>
                      <span className={`cc-chip ${DEPLOYMENT_TONE[deployment.status as keyof typeof DEPLOYMENT_TONE] ?? "t-muted"}`}>
                        {deployment.status}
                      </span>
                    </td>
                    <td>
                      <span className={`cc-chip ${ENVIRONMENT_TONE[deployment.environment as EnvironmentType] ?? "t-muted"}`}>
                        {deployment.environment}
                      </span>
                    </td>
                    <td className="cc-dim">{deployment.version ?? DASH}</td>
                    <td className="cc-dim">{deployment.branch ?? DASH}</td>
                    <td>
                      {deployment.commitSha ? (
                        <span className="cc-mono" title={deployment.commitMessage ?? undefined}>
                          {deployment.commitSha.slice(0, 7)}
                        </span>
                      ) : (
                        DASH
                      )}
                    </td>
                    <td className="cc-dim">{deployment.provider}</td>
                    <td className="cc-dim">{deployment.triggeredBy ?? DASH}</td>
                    <td className="cc-dim" title={new Date(deployment.startedAt).toLocaleString("en-US")}>
                      {ago(deployment.startedAt)}
                    </td>
                    <td className="num cc-dim">
                      {deployment.durationMs === null ? DASH : `${Math.round(deployment.durationMs / 1000)}s`}
                    </td>
                    <td>
                      <div className="cc-rowacts">
                        {deployment.deploymentUrl ? (
                          <a className="cc-link" href={deployment.deploymentUrl} target="_blank" rel="noopener noreferrer nofollow">
                            Open
                          </a>
                        ) : null}
                        {deployment.logsUrl ? (
                          <a className="cc-link" href={deployment.logsUrl} target="_blank" rel="noopener noreferrer">
                            Logs
                          </a>
                        ) : null}
                        {deployment.commitUrl ? (
                          <a className="cc-link" href={deployment.commitUrl} target="_blank" rel="noopener noreferrer">
                            Commit
                          </a>
                        ) : null}
                        {!deployment.deploymentUrl && !deployment.logsUrl && !deployment.commitUrl ? (
                          <span className="cc-faint">{DASH}</span>
                        ) : null}
                      </div>
                    </td>
                    {canManage ? (
                      <td>
                        <DeploymentActions
                          appId={app.id}
                          deploymentId={deployment.id}
                          environment={deployment.environment}
                          canRedeploy={hasVercel && Boolean(deployment.externalId)}
                          hasVersion={Boolean(deployment.version || deployment.commitSha)}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="cc-pager">
              <Link className={`cc-page-btn ${page <= 1 ? "is-off" : ""}`} href={`?tab=deployments&page=${page - 1}`}>
                Prev
              </Link>
              <span className="cc-page-btn is-on">{page}</span>
              <Link className={`cc-page-btn ${page >= pages ? "is-off" : ""}`} href={`?tab=deployments&page=${page + 1}`}>
                Next
              </Link>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Health
   ══════════════════════════════════════════════════════════════════════ */

function HealthTab({
  app,
  history,
  canManage,
}: {
  app: AppDetail;
  history: Awaited<ReturnType<typeof loadHealthHistory>>;
  canManage: boolean;
}) {
  return (
    <>
      <Panel
        title="Overall health"
        sub={app.health.lastCheckedAt ? `Last checked ${ago(app.health.lastCheckedAt)}` : "Never checked"}
        icon={<IconPulse size={15} />}
        className="cc-s12"
      >
        <div className="cc-taglist" style={{ marginBottom: 12 }}>
          <span className={`cc-chip ${HEALTH_TONE[app.health.state]}`}>{app.health.label}</span>
          {app.health.observed ? null : (
            <span className="cc-faint">
              Unknown is not a failure — it means nothing has looked recently. It is never
              reported as healthy.
            </span>
          )}
        </div>

        {/* Four children exactly — .cc-check-row is a four-column grid, and
            the tone belongs on the row so the dot picks it up. */}
        <div className="cc-checks">
          {app.health.categories.map((category) => (
            <div className={`cc-check-row ${HEALTH_TONE[category.state]}`} key={category.type}>
              <span className="cc-check-dot" />
              <span className="cc-check-name">{category.label}</span>
              <span className="cc-check-detail">{category.detail}</span>
              <span className="cc-check-score">
                {HEALTH_LABELS[category.state]}
                {category.responseMs === null ? "" : ` · ${category.responseMs}ms`}
              </span>
            </div>
          ))}
        </div>

        {app.health.reasons.length > 0 ? (
          <div className="cc-reasons">
            {app.health.reasons.map((reason, index) => (
              <div className="cc-reason" key={`${reason.label}-${index}`}>
                <span className={`cc-reason-pts ${reason.severity === "critical" ? "t-risk" : reason.severity === "warning" ? "t-warn" : "t-muted"}`}>
                  {reason.severity === "critical" ? "!!" : reason.severity === "warning" ? "!" : "·"}
                </span>
                <span>
                  <strong>{reason.label}</strong> — {reason.detail}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <p className="cc-note">
          Background jobs are always Unknown: nothing in this system runs or watches an
          app&rsquo;s background work, so no check is written for it. That is deliberate — a
          green row for something nobody looked at would be worse than an empty one.
        </p>
      </Panel>

      <Panel
        title="Incidents"
        sub={history.incidents.length > 0 ? `${count(history.incidents.length)} recorded` : undefined}
        icon={<IconAlert size={15} />}
        className="cc-s6"
        footer={canManage ? <NewIncident appId={app.id} /> : undefined}
      >
        {history.incidents.length === 0 ? (
          <EmptyState title="No incidents" text="Nothing has been recorded against this app, by a person or by a check." />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>What</th>
                  <th>Status</th>
                  <th className="num">Duration</th>
                  {canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {history.incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td className="cc-dim" title={new Date(incident.startedAt).toLocaleString("en-US")}>
                      {shortDate(incident.startedAt)}
                    </td>
                    <td className="cc-dim">{incident.incidentType}</td>
                    <td>
                      <span className={`cc-chip ${SEVERITY_TONE[incident.severity as IncidentSeverity] ?? "t-muted"}`}>
                        {incident.severity}
                      </span>
                    </td>
                    <td>{incident.message}</td>
                    <td>
                      <span className={`cc-chip ${incident.status === "resolved" ? "t-ok" : "t-warn"}`}>
                        {incident.status}
                      </span>
                    </td>
                    <td className="num cc-dim">
                      {incident.durationMs === null
                        ? "open"
                        : `${Math.max(1, Math.round(incident.durationMs / 60000))}m`}
                    </td>
                    {canManage ? (
                      <td>
                        {incident.status === "resolved" ? null : (
                          <ResolveIncident appId={app.id} incidentId={incident.id} />
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Recent checks" icon={<IconChart size={15} />} className="cc-s6">
        {history.checks.length === 0 ? (
          <EmptyState
            title="No checks have run"
            text="Run checks from the header. It probes each environment URL, does a real TLS handshake against every production domain, and asks each connected provider what it sees."
          />
        ) : (
          <ul className="cc-feed">
            {history.checks.slice(0, 12).map((check) => (
              <li className="cc-feed-item" key={check.id}>
                <span className="cc-feed-main">
                  <span className="cc-feed-title">{check.checkType.replace(/_/g, " ")}</span>
                  <span className="cc-feed-sub">{check.message ?? check.target ?? ""}</span>
                </span>
                <span className={`cc-chip ${HEALTH_TONE[check.status as HealthState] ?? "t-muted"}`}>{check.status}</span>
                <span className="cc-feed-when">{ago(check.checkedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Environments
   ══════════════════════════════════════════════════════════════════════ */

function EnvironmentsTab({ app, canManage }: { app: AppDetail; canManage: boolean }) {
  return (
    <Panel
      title="Environments"
      sub={`${count(app.environments.length)} configured`}
      icon={<IconLayers size={15} />}
      className="cc-s12"
      footer={canManage ? <AddEnvironment appId={app.id} /> : undefined}
    >
      {app.environments.length === 0 ? (
        <EmptyState
          icon={<IconLayers size={17} />}
          title="No environments yet"
          text="Add production, staging and development as separate environments. Each one keeps its own URL, branch, database and health, which is what lets this screen tell them apart."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Environment</th>
                <th>URL</th>
                <th>Branch</th>
                <th>Hosting</th>
                <th>Database</th>
                <th>Version</th>
                <th>Health</th>
                <th>Last deploy</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {app.environments.map((environment) => (
                <tr key={environment.id}>
                  <td>
                    <span className="cc-strong">{environment.name}</span>
                    <span className="cc-client-sub">
                      <span className={`cc-chip ${ENVIRONMENT_TONE[environment.type]}`}>{environment.typeLabel}</span>
                      {environment.isProduction ? " · primary" : ""}
                    </span>
                  </td>
                  <td>
                    {environment.url ? (
                      <a className="cc-link" href={environment.url} target="_blank" rel="noopener noreferrer nofollow">
                        {environment.url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="cc-faint">Not set</span>
                    )}
                    {environment.apiBaseUrl ? (
                      <span className="cc-client-sub">API: {environment.apiBaseUrl.replace(/^https?:\/\//, "")}</span>
                    ) : null}
                  </td>
                  <td className="cc-dim">{environment.branch ?? DASH}</td>
                  <td className="cc-dim">
                    {environment.hostingProvider ?? DASH}
                    {environment.hostingProjectId ? (
                      <span className="cc-client-sub cc-mono">{environment.hostingProjectId}</span>
                    ) : null}
                  </td>
                  <td className="cc-dim">
                    {environment.databaseProvider ?? DASH}
                    {environment.databaseRegion ? (
                      <span className="cc-client-sub">{environment.databaseRegion}</span>
                    ) : null}
                  </td>
                  <td className="cc-dim">{environment.currentVersion ?? DASH}</td>
                  <td>
                    <span className={`cc-chip ${HEALTH_TONE[environment.healthStatus]}`}>
                      {HEALTH_LABELS[environment.healthStatus]}
                    </span>
                    {environment.lastCheckedAt ? (
                      <span className="cc-client-sub">{ago(environment.lastCheckedAt)}</span>
                    ) : null}
                  </td>
                  <td className="cc-dim">
                    {environment.lastDeployedAt ? ago(environment.lastDeployedAt) : DASH}
                  </td>
                  {canManage ? (
                    <td>
                      <div className="cc-rowacts">
                        <EditEnvironment
                          appId={app.id}
                          value={{
                            id: environment.id,
                            name: environment.name,
                            type: environment.type,
                            isProduction: environment.isProduction,
                            url: environment.url,
                            apiBaseUrl: environment.apiBaseUrl,
                            branch: environment.branch,
                            hostingProvider: environment.hostingProvider,
                            hostingProjectId: environment.hostingProjectId,
                            hostingTeamId: environment.hostingTeamId,
                            databaseProvider: environment.databaseProvider,
                            databaseProjectId: environment.databaseProjectId,
                            databaseRegion: environment.databaseRegion,
                            currentVersion: environment.currentVersion,
                          }}
                        />
                        <RemoveEnvironment appId={app.id} environmentId={environment.id} name={environment.name} />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Domains
   ══════════════════════════════════════════════════════════════════════ */

function DomainsTab({ app, canManage }: { app: AppDetail; canManage: boolean }) {
  const environments = app.environments.map((environment) => ({ id: environment.id, name: environment.name }));

  return (
    <Panel
      title="Domains"
      sub={`${count(app.domains.length)} recorded`}
      icon={<IconGlobe size={15} />}
      className="cc-s12"
      footer={canManage ? <AddDomain appId={app.id} environments={environments} /> : undefined}
    >
      {app.domains.length === 0 ? (
        <EmptyState
          icon={<IconGlobe size={17} />}
          title="No domains recorded"
          text="Add the hostnames this app answers on. SSL status comes from a real TLS handshake when checks run, so it reports the certificate actually being served rather than one somebody typed."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Environment</th>
                <th>Provider</th>
                <th>SSL</th>
                <th>Expires</th>
                <th>Primary</th>
                <th>Redirects</th>
                <th>Verified</th>
                <th>Checked</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {app.domains.map((domain) => (
                <tr key={domain.id}>
                  <td>
                    <a className="cc-link" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow">
                      {domain.domain}
                    </a>
                    {domain.websiteId ? (
                      <span className="cc-client-sub">
                        <Link className="cc-link" href="/admin/websites">Also in Websites</Link>
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`cc-chip ${ENVIRONMENT_TONE[domain.environment as EnvironmentType] ?? "t-muted"}`}>
                      {domain.environment}
                    </span>
                  </td>
                  <td className="cc-dim">{domain.provider ?? DASH}</td>
                  <td>
                    <span className={`cc-chip ${SSL_TONE[domain.sslStatus as SslStatus] ?? "t-muted"}`}>
                      {domain.sslStatus === "unknown" ? "Unknown" : domain.sslStatus}
                    </span>
                  </td>
                  <td className="cc-dim">{domain.sslExpiresAt ? shortDate(domain.sslExpiresAt) : DASH}</td>
                  <td className="cc-dim">{domain.isPrimary ? "Yes" : DASH}</td>
                  <td className="cc-dim">{domain.redirectTo ?? DASH}</td>
                  <td className="cc-dim">
                    {domain.verified === null ? DASH : domain.verified ? "Yes" : "No"}
                  </td>
                  <td className="cc-dim">{domain.lastCheckedAt ? ago(domain.lastCheckedAt) : "Never"}</td>
                  {canManage ? (
                    <td>
                      <div className="cc-rowacts">
                        <EditDomain
                          appId={app.id}
                          environments={environments}
                          value={{
                            id: domain.id,
                            domain: domain.domain,
                            environment: domain.environment,
                            environmentId: domain.environmentId,
                            provider: domain.provider,
                            isPrimary: domain.isPrimary,
                            redirectTo: domain.redirectTo,
                          }}
                        />
                        <RemoveDomain appId={app.id} domainId={domain.id} domain={domain.domain} />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Database
   ══════════════════════════════════════════════════════════════════════ */

async function databaseTab(app: AppDetail): Promise<React.ReactNode> {
  const link = app.integrations.find((integration) => integration.provider === "supabase");
  const connections = await providerConnections();
  const ref =
    link?.accountRef ??
    app.environments.find((environment) => environment.databaseProjectId)?.databaseProjectId ??
    null;

  const live = connections.supabase.connected && ref ? await supabaseProject(ref) : null;

  return (
    <>
      <Panel title="Database" icon={<IconServer size={15} />} className="cc-s6">
        {app.environments.some((environment) => environment.databaseProvider) ? (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Environment</th>
                  <th>Provider</th>
                  <th>Project</th>
                  <th>Region</th>
                </tr>
              </thead>
              <tbody>
                {app.environments
                  .filter((environment) => environment.databaseProvider || environment.databaseProjectId)
                  .map((environment) => (
                    <tr key={environment.id}>
                      <td>{environment.name}</td>
                      <td className="cc-dim">{environment.databaseProvider ?? DASH}</td>
                      <td className="cc-mono">{environment.databaseProjectId ?? DASH}</td>
                      <td className="cc-dim">{environment.databaseRegion ?? DASH}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No database recorded"
            text="Set a database provider and project reference on an environment, and this fills in."
          />
        )}
        <p className="cc-note">
          Passwords, service-role keys, connection strings and environment variables are not
          stored here and never will be. This tab holds identifiers and status only.
        </p>
      </Panel>

      <Panel title="Live status" icon={<IconPulse size={15} />} className="cc-s6">
        {!connections.supabase.connected ? (
          <EmptyState
            icon={<IconServer size={17} />}
            title="Supabase not connected"
            text="Connect a Supabase management token from Manage Integrations on the portfolio page to read project status, region and per-service health. Nothing is guessed until then."
            cta={{ href: "/admin/apps", label: "Manage integrations" }}
          />
        ) : !ref ? (
          <EmptyState
            title="No project linked"
            text="Supabase is connected, but this app has no project reference. Add one on an environment or as a Supabase integration."
          />
        ) : !live || !live.ok ? (
          <EmptyState
            title="Could not read the project"
            text={live && !live.ok ? live.error : "The management API did not answer."}
          />
        ) : (
          <>
            <dl className="cc-kv">
              <dt>Project</dt>
              <dd>{live.data.name}</dd>
              <dt>Ref</dt>
              <dd className="cc-mono">{live.data.ref}</dd>
              <dt>Region</dt>
              <dd>{live.data.region}</dd>
              <dt>Status</dt>
              <dd>
                <span className={`cc-chip ${live.data.status === "ACTIVE_HEALTHY" ? "t-ok" : "t-warn"}`}>
                  {live.data.status}
                </span>
              </dd>
              <dt>Created</dt>
              <dd>{live.data.createdAt ? shortDate(live.data.createdAt) : DASH}</dd>
            </dl>

            {live.data.services.length > 0 ? (
              <ul className="cc-health" style={{ marginTop: 10 }}>
                {live.data.services.map((service) => (
                  <li className="cc-health-row" key={service.name}>
                    <div className="cc-health-name">{service.name}</div>
                    <span className={`cc-chip ${service.healthy === true ? "t-ok" : service.healthy === false ? "t-risk" : "t-muted"}`}>
                      {service.healthy === true ? "Healthy" : service.healthy === false ? "Unhealthy" : "Not reported"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-note">
                This token can see the project but not its per-service health, so those read
                &ldquo;not reported&rdquo; rather than healthy.
              </p>
            )}
          </>
        )}
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Integrations
   ══════════════════════════════════════════════════════════════════════ */

async function integrationsTab(app: AppDetail, canManage: boolean): Promise<React.ReactNode> {
  const connections = await providerConnections();
  const repo = app.repoSlug && connections.github.connected ? await githubRepo(app.repoSlug) : null;

  return (
    <>
      <Panel
        title="Integrations"
        sub={`${count(app.integrations.length)} recorded`}
        icon={<IconServer size={15} />}
        className="cc-s12"
        footer={canManage ? <AddIntegration appId={app.id} /> : undefined}
      >
        {app.integrations.length === 0 ? (
          <EmptyState
            icon={<IconServer size={17} />}
            title="No integrations recorded"
            text="Record the external services this app depends on. A service with no row here is reported as not connected everywhere in the admin — that is what makes the health checks honest."
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Environment</th>
                  <th>Reference</th>
                  <th>Owner</th>
                  <th>Last check</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {app.integrations.map((integration) => (
                  <tr key={integration.id}>
                    <td>
                      <span className="cc-strong">{integration.providerLabel}</span>
                      {integration.label ? <span className="cc-client-sub">{integration.label}</span> : null}
                    </td>
                    <td className="cc-dim">{INTEGRATION_LABELS[integration.provider] ?? integration.provider}</td>
                    <td>
                      <span className={`cc-chip ${INTEGRATION_TONE[integration.status as IntegrationStatus] ?? "t-muted"}`}>
                        {INTEGRATION_STATUS_LABELS[integration.status as IntegrationStatus] ?? integration.status}
                      </span>
                      {integration.error ? <span className="cc-client-sub t-risk">{integration.error}</span> : null}
                    </td>
                    <td className="cc-dim">{integration.environment}</td>
                    <td className="cc-mono">{integration.accountRef ?? DASH}</td>
                    <td className="cc-dim">{integration.owner ?? DASH}</td>
                    <td className="cc-dim">{integration.lastCheckedAt ? ago(integration.lastCheckedAt) : "Never"}</td>
                    {canManage ? (
                      <td>
                        <div className="cc-rowacts">
                          <EditIntegration
                            appId={app.id}
                            value={{
                              id: integration.id,
                              provider: integration.provider,
                              label: integration.label,
                              status: integration.status,
                              environment: integration.environment,
                              accountRef: integration.accountRef,
                              owner: integration.owner,
                            }}
                          />
                          <RemoveIntegration
                            appId={app.id}
                            integrationId={integration.id}
                            label={integration.providerLabel}
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cc-note">
          No API key appears in this table, because none is stored in it. Account tokens live
          in the server-only vault and are reachable only by the server.
        </p>
      </Panel>

      <Panel title="Repository" icon={<IconCode size={15} />} className="cc-s12">
        {!app.repoUrl ? (
          <EmptyState
            title="No repository linked"
            text="Add a repository URL in Settings. With GitHub connected, this shows the latest commit, the default branch and open issue and pull request counts."
          />
        ) : !connections.github.connected ? (
          <>
            <dl className="cc-kv">
              <dt>Repository</dt>
              <dd>
                <a className="cc-link" href={app.repoUrl} target="_blank" rel="noopener noreferrer">
                  {app.repoSlug ?? app.repoUrl}
                </a>
              </dd>
              <dt>Default branch</dt>
              <dd>{app.defaultBranch ?? DASH}</dd>
              <dt>Production branch</dt>
              <dd>{app.productionBranch ?? DASH}</dd>
            </dl>
            <EmptyState
              title="GitHub not connected"
              text="Connect a GitHub token from Manage Integrations to read the latest commit, its author and date, and open issue and pull request counts."
              cta={{ href: "/admin/apps", label: "Manage integrations" }}
            />
          </>
        ) : !repo || !repo.ok ? (
          <EmptyState
            title="Could not read the repository"
            text={repo && !repo.ok ? repo.error : "GitHub did not answer."}
          />
        ) : (
          <>
            <dl className="cc-kv">
              <dt>Repository</dt>
              <dd>
                <a className="cc-link" href={repo.data.url} target="_blank" rel="noopener noreferrer">
                  {repo.data.slug}
                </a>{" "}
                <span className="cc-chip t-muted">{repo.data.private ? "Private" : "Public"}</span>
              </dd>
              <dt>Default branch</dt>
              <dd>{repo.data.defaultBranch}</dd>
              <dt>Production branch</dt>
              <dd>{app.productionBranch ?? repo.data.defaultBranch}</dd>
              <dt>Latest commit</dt>
              <dd>
                {repo.data.latestCommit ? (
                  <>
                    <a className="cc-link cc-mono" href={repo.data.latestCommit.url} target="_blank" rel="noopener noreferrer">
                      {repo.data.latestCommit.shortSha}
                    </a>{" "}
                    {repo.data.latestCommit.message}
                  </>
                ) : (
                  DASH
                )}
              </dd>
              <dt>Commit author</dt>
              <dd>{repo.data.latestCommit?.author ?? DASH}</dd>
              <dt>Commit date</dt>
              <dd>{repo.data.latestCommit?.date ? `${ago(repo.data.latestCommit.date)} · ${shortDate(repo.data.latestCommit.date)}` : DASH}</dd>
              <dt>Open issues</dt>
              <dd>{count(repo.data.openIssues)}</dd>
              <dt>Open pull requests</dt>
              <dd>
                {repo.data.openPullRequests === null ? (
                  <span className="cc-faint">This token cannot search pull requests, so this is unknown rather than zero.</span>
                ) : (
                  count(repo.data.openPullRequests)
                )}
              </dd>
            </dl>
            <div className="cc-rowacts" style={{ marginTop: 10 }}>
              <a className="cc-btn is-sm" href={repo.data.url} target="_blank" rel="noopener noreferrer">Open repository</a>
              <a className="cc-btn is-sm" href={`${repo.data.url}/issues`} target="_blank" rel="noopener noreferrer">Open issues</a>
              {repo.data.latestCommit ? (
                <a className="cc-btn is-sm" href={repo.data.latestCommit.url} target="_blank" rel="noopener noreferrer">Open commit</a>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Users
   ══════════════════════════════════════════════════════════════════════ */

/**
 * The Users tab is deliberately empty.
 *
 * An app's end users live in that app's own database. Copying them into
 * this one would duplicate other people's personal data into a CRM with a
 * different retention story and no consent for it — for a client's app, it
 * would be their users in our database.
 *
 * So this tab holds the shape and says what would fill it: a summary
 * endpoint the app itself exposes, read through an integration. Counts, not
 * a copied user table.
 */
function UsersTab({ app }: { app: AppDetail }) {
  const analytics = app.integrations.find((integration) =>
    ["google", "supabase"].includes(integration.provider) && integration.status === "connected"
  );

  return (
    <Panel title="Users" icon={<IconUsers size={15} />} className="cc-s12">
      <EmptyState
        icon={<IconUsers size={17} />}
        title="No user metrics connected"
        text={
          analytics
            ? "This app has a connected provider, but no user-summary endpoint has been configured for it yet, so there is nothing to show."
            : "User counts would come from the app's own database through a summary endpoint, not by copying its user table into this one. Nothing is shown because nothing has been measured."
        }
      />
      <p className="cc-note">
        This tab will never hold a copy of an app&rsquo;s end users. For a client app those are
        the client&rsquo;s users, and they do not belong in this database. When user metrics are
        wired up they arrive as aggregate counts — total, active, new, invited — from an
        endpoint the app exposes for the purpose.
      </p>
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Revenue
   ══════════════════════════════════════════════════════════════════════ */

const BASIS_NOTE: Record<string, string> = {
  linked: "These invoices are attributed to this app directly.",
  client_and_service:
    "No invoice is linked to this app directly, so these are the client's invoices that include this app's service. Treat them as an indication rather than a total.",
  client:
    "No invoice is linked to this app and none names its service, so these are all of this client's invoices — the client's revenue, not this app's.",
  none: "No invoices are attributed to this app.",
};

function RevenueTab({
  app,
  revenue,
}: {
  app: AppDetail;
  revenue: Awaited<ReturnType<typeof loadAppRevenue>>;
}) {
  return (
    <>
      <Panel title="Revenue" icon={<IconDollar size={15} />} className="cc-s12" bodyClass="flush">
        <div className="cc-stats">
          <Stat
            label="MRR"
            value={revenue.mrrCents === null ? DASH : money(revenue.mrrCents)}
            hint={
              revenue.mrrBasis === "client_service"
                ? "From the client service assignment"
                : revenue.mrrBasis === "contract"
                  ? "From the agreed monthly fee"
                  : "No recurring billing recorded"
            }
          />
          <Stat
            label="Setup revenue"
            value={revenue.setupCents === null ? DASH : money(revenue.setupCents)}
            hint="Agreed setup fee"
          />
          <Stat
            label="Collected"
            value={revenue.lifetimeCents === 0 ? DASH : money(revenue.lifetimeCents)}
            hint="Payments recorded against the invoices below"
          />
          <Stat
            label="Outstanding"
            value={revenue.outstandingCents === 0 ? DASH : money(revenue.outstandingCents)}
            tone={revenue.outstandingCents > 0 ? "t-risk" : undefined}
            hint="Invoiced and not yet paid"
          />
          <Stat
            label="Subscription"
            value={revenue.clientService ? revenue.clientService.status : app.billingStatus === "active" ? "Active" : DASH}
            hint={
              revenue.clientService?.nextBillingDate
                ? `Next bills ${shortDate(revenue.clientService.nextBillingDate)}`
                : "From the client services system"
            }
          />
        </div>
      </Panel>

      <Panel
        title="Invoices"
        sub={revenue.invoices.length > 0 ? `${count(revenue.invoices.length)} found` : undefined}
        icon={<IconDollar size={15} />}
        className="cc-s12"
      >
        <p className="cc-note" style={{ marginTop: 0 }}>{BASIS_NOTE[revenue.basis]}</p>

        {revenue.invoices.length === 0 ? (
          <EmptyState
            title="No invoices"
            text="Raise invoices in the Invoices system as normal. Set the app on one and it is counted here exactly; otherwise this falls back to the client and says so."
            cta={{ href: "/admin/invoices/new", label: "New invoice" }}
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Title</th>
                  <th>Client</th>
                  <th className="num">Amount</th>
                  <th className="num">Paid</th>
                  <th>Status</th>
                  <th>Basis</th>
                </tr>
              </thead>
              <tbody>
                {revenue.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="cc-dim">{invoice.issueDate ? shortDate(invoice.issueDate) : DASH}</td>
                    <td>
                      <Link className="cc-link" href={`/admin/invoices/${invoice.id}`}>
                        {invoice.number ?? "Invoice"}
                      </Link>
                    </td>
                    <td className="cc-dim">{invoice.title ?? DASH}</td>
                    <td className="cc-dim">{app.client?.name ?? DASH}</td>
                    <td className="num">{money(invoice.totalCents)}</td>
                    <td className="num">{invoice.paidCents === 0 ? DASH : money(invoice.paidCents)}</td>
                    <td>
                      <span className={`cc-chip ${invoice.status === "paid" ? "t-ok" : invoice.status === "sent" ? "t-warn" : "t-muted"}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="cc-dim">{invoice.linked ? "This app" : "Client"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Payments" icon={<IconChart size={15} />} className="cc-s6">
        {revenue.payments.length === 0 ? (
          <EmptyState title="No payments recorded" text="Payments appear here as they are recorded against the invoices above." />
        ) : (
          <ul className="cc-feed">
            {revenue.payments.map((payment) => (
              <li className="cc-feed-item" key={payment.id}>
                <span className="cc-feed-main">
                  <span className="cc-feed-title">{money(payment.amountCents)}</span>
                  <span className="cc-feed-sub">
                    {[payment.method, payment.reference].filter(Boolean).join(" · ") || "Payment"}
                  </span>
                </span>
                <span className="cc-feed-when">{payment.paidOn ? shortDate(payment.paidOn) : DASH}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Where these numbers come from" icon={<IconBriefcase size={15} />} className="cc-s6">
        <dl className="cc-kv">
          <dt>Recurring</dt>
          <dd>
            {revenue.clientService
              ? "The client service assignment in the Services system."
              : app.billingType === "recurring"
                ? "The agreed monthly fee on this app record."
                : "Nothing recurring is recorded."}
          </dd>
          <dt>Collected</dt>
          <dd>invoice_payments — every payment recorded, however it arrived.</dd>
          <dt>Outstanding</dt>
          <dd>Invoice totals minus payments, ignoring void, draft and refunded.</dd>
          <dt>Service</dt>
          <dd>
            {app.service ? (
              <Link className="cc-link" href={`/admin/services/${app.service.id}`}>{app.service.name}</Link>
            ) : (
              "Not sold through a service."
            )}
          </dd>
        </dl>
        <p className="cc-note">
          There is no separate billing engine here. Everything above is read from the
          existing Invoices, Payments and Client Services tables on every load, so this
          screen cannot drift from the ledger.
        </p>
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Tasks and issues
   ══════════════════════════════════════════════════════════════════════ */

const PRIORITY_TONE: Record<string, string> = {
  critical: "t-risk",
  high: "t-warn",
  medium: "t-info",
  low: "t-muted",
};

function TasksTab({
  app,
  tasks,
  people,
  canManage,
}: {
  app: AppDetail;
  tasks: Awaited<ReturnType<typeof loadAppTasks>>;
  people: { email: string; name: string }[];
  canManage: boolean;
}) {
  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  return (
    <Panel
      title="Tasks & issues"
      sub={`${count(open.length)} open`}
      icon={<IconCheckSquare size={15} />}
      className="cc-s12"
      action={{ href: "/admin/tasks", label: "Tasks board" }}
      footer={
        canManage ? (
          <div className="cc-rowacts">
            <NewAppTask appId={app.id} people={people} label="Create task" defaultType="development" />
            <NewAppTask appId={app.id} people={people} label="Report bug" defaultType="quality" />
            <NewAppTask appId={app.id} people={people} label="Feature request" defaultType="design" />
          </div>
        ) : undefined
      }
    >
      {tasks.length === 0 ? (
        <EmptyState
          icon={<IconCheckSquare size={17} />}
          title="No tasks linked to this app"
          text="Work on an app is a normal task with the app attached, so everything the Tasks board can do — templates, assignment, priority, the drawer — works on these too."
          cta={{ href: "/admin/tasks", label: "Open the Tasks board" }}
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Due</th>
                <th>Client</th>
                <th>Project</th>
              </tr>
            </thead>
            <tbody>
              {[...open, ...done].map((task) => (
                <tr key={task.id}>
                  <td>
                    <Link className="cc-link" href={`/admin/tasks?task=${task.id}`}>{task.title}</Link>
                  </td>
                  <td className="cc-dim">{task.type.replace(/_/g, " ")}</td>
                  <td>
                    <span className={`cc-chip ${PRIORITY_TONE[task.priority] ?? "t-muted"}`}>{task.priority}</span>
                  </td>
                  <td>
                    <span className={`cc-chip ${task.done ? "t-ok" : "t-muted"}`}>
                      {task.done ? "completed" : task.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="cc-dim">{task.owner ?? "Unassigned"}</td>
                  <td className="cc-dim">{task.dueAt ? shortDate(task.dueAt) : DASH}</td>
                  <td className="cc-dim">
                    {app.client ? (
                      <Link className="cc-link" href={`/admin/clients/${app.client.id}`}>{app.client.name}</Link>
                    ) : (
                      DASH
                    )}
                  </td>
                  <td className="cc-dim">
                    {task.jobId ? (
                      <Link className="cc-link" href={`/admin/jobs/${task.jobId}`}>Project</Link>
                    ) : (
                      DASH
                    )}
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

/* ══════════════════════════════════════════════════════════════════════
   Activity
   ══════════════════════════════════════════════════════════════════════ */

function ActivityTab({ items }: { items: Awaited<ReturnType<typeof loadAppActivity>> }) {
  return (
    <Panel title="Activity" icon={<IconPulse size={15} />} className="cc-s12" bodyClass="flush">
      {items.length === 0 ? (
        <div className="cc-panel-body">
          <EmptyState title="Nothing has happened yet" text="Changes, deployments, incidents and health events land here as they occur." />
        </div>
      ) : (
        <div className="cc-timeline">
          {items.map((item) => (
            <div className="cc-timeline-item" key={item.id}>
              <span className="cc-timeline-rail">
                <span className="cc-timeline-node" />
              </span>
              <span className="cc-feed-main">
                <span className="cc-feed-title">{item.body}</span>
                <span className="cc-feed-sub">
                  {[item.kind.replace(/_/g, " "), item.actor].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="cc-feed-when" title={new Date(item.at).toLocaleString("en-US")}>
                {ago(item.at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Settings
   ══════════════════════════════════════════════════════════════════════ */

function SettingsTab({
  app,
  choices,
  canManage,
}: {
  app: AppDetail;
  choices: Awaited<ReturnType<typeof loadAppChoices>>;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <Panel title="Settings" icon={<IconSettings size={15} />} className="cc-s12">
        <EmptyState
          title="Read only"
          text="Only owners and admins can change an app. You can see everything on the other tabs."
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel title="App settings" icon={<IconSettings size={15} />} className="cc-s12">
        <SettingsForm
          value={{
            id: app.id,
            name: app.name,
            internalName: app.internalName,
            description: app.description,
            logoUrl: app.logoUrl,
            ownership: app.ownership,
            platform: app.platform,
            status: app.status,
            framework: app.framework,
            currentVersion: app.currentVersion,
            technicalOwner: app.technicalOwner,
            businessOwner: app.businessOwner,
            customerId: app.client?.id ?? null,
            jobId: app.project?.id ?? null,
            serviceId: app.service?.id ?? null,
            repoProvider: app.repoProvider,
            repoUrl: app.repoUrl,
            defaultBranch: app.defaultBranch,
            productionBranch: app.productionBranch,
            setupFeeCents: app.setupFeeCents,
            monthlyFeeCents: app.monthlyFeeCents,
            billingType: app.billingType,
            billingStatus: app.billingStatus,
            subscriptionId: app.subscriptionId,
            notes: app.notes,
          }}
          clients={choices.clients}
          projects={choices.projects}
          services={choices.services}
          people={choices.people}
        />
      </Panel>

      <Panel title={app.isArchived ? "Restore" : "Archive"} icon={<IconAlert size={15} />} className="cc-s6">
        <p className="cc-note" style={{ marginTop: 0 }}>
          {app.isArchived
            ? "This app is archived. Restoring brings it back paused, with every deployment, incident and invoice it had."
            : "Archiving hides this app from the portfolio and stops it being checked. Nothing is deleted — its deployments, incidents, tasks and invoices all stay, and it can be restored."}
        </p>
        {app.isArchived ? (
          <ActionForm action={restoreAppAction} label="Restore app" small>
            <input type="hidden" name="app_id" value={app.id} />
          </ActionForm>
        ) : (
          <ActionForm
            action={archiveAppAction}
            label="Archive app"
            danger
            small
            confirm={`Archive ${app.name}? It stops appearing in the portfolio and stops being health-checked. Nothing is deleted.`}
          >
            <input type="hidden" name="app_id" value={app.id} />
          </ActionForm>
        )}
        <p className="cc-note">
          There is no delete. An app row carries its deployment history, its incidents and
          the invoices attributed to it; removing one to tidy a list would orphan all of it.
        </p>
      </Panel>
    </>
  );
}
