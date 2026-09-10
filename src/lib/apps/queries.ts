import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { HEALTH_RANK, needsAttention, scoreApp, type AppHealth } from "./health";
import {
  ENVIRONMENT_LABELS,
  HEALTH_LABELS,
  IN_DEVELOPMENT,
  INTEGRATION_LABELS,
  LIFECYCLE_LABELS,
  OWNERSHIP_LABELS,
  PLATFORM_LABELS,
  safeUrl,
  type EnvironmentType,
  type HealthState,
  type IntegrationProvider,
  type LifecycleStatus,
  type OwnershipType,
  type PlatformType,
} from "./types";

/**
 * Everything the Apps screen shows, in ONE round of queries.
 *
 * The rule from §34 of the brief, and from every other board in this admin:
 * loading /admin/apps must not fan out per app. Eight parallel selects come
 * back, everything else is joined in memory, and no external provider is
 * called on this path at all — a Vercel outage must not be able to make the
 * portfolio page slow or blank. Provider data is read on the detail screen
 * and by the sync job, both of which degrade one panel at a time.
 *
 * The other rule, inherited from the websites module: a number appears only
 * when something measured it. Health comes from app_health_checks and is
 * Unknown when nothing recent exists. Revenue comes from the contract terms
 * or the linked client service and is null — not zero — when neither says.
 */

export type AppRow = {
  id: string;
  name: string;
  slug: string;
  internalName: string | null;
  description: string | null;
  logoUrl: string | null;

  ownership: OwnershipType;
  ownershipLabel: string;
  platform: PlatformType;
  platformLabel: string;
  status: LifecycleStatus;
  statusLabel: string;

  framework: string | null;
  currentVersion: string | null;
  technicalOwner: string | null;
  businessOwner: string | null;

  client: { id: string; name: string } | null;
  jobId: string | null;
  serviceId: string | null;

  /** Where it runs. "Multiple" when more than one environment is recorded. */
  environmentLabel: string;
  environments: { id: string; name: string; type: EnvironmentType; url: string | null }[];
  productionUrl: string | null;
  productionDomain: string | null;
  stagingUrl: string | null;

  health: AppHealth;

  lastDeploy: { at: string; status: string; environment: string } | null;

  /** Recurring revenue and where the number came from. Null when unknown. */
  revenueCents: number | null;
  revenueSource: "client_service" | "contract" | null;

  openIssues: number;
  openIncidents: number;
  connectedProviders: IntegrationProvider[];

  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppFilters = {
  q?: string;
  tab: "all" | "live" | "development" | "attention" | "archived";
  status?: string;
  platform?: string;
  ownership?: string;
  health?: string;
  environment?: string;
  client?: string;
  sort: "name" | "health" | "revenue" | "deploy" | "updated" | "client";
  view: "table" | "cards";
};

export type AppAlert = {
  id: string;
  appId: string;
  appName: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
};

export type AppBoard = {
  kpis: {
    total: number;
    live: number;
    inDevelopment: number;
    withIssues: number;
    monthlyRevenueCents: number | null;
    activeClients: number;
  };
  tabCounts: Record<AppFilters["tab"], number>;
  rows: AppRow[];
  /** Non-archived apps, before any tab or filter narrowing. */
  portfolioSize: number;
  healthBreakdown: { state: HealthState; label: string; count: number }[];
  byPlatform: { platform: PlatformType; label: string; count: number }[];
  alerts: AppAlert[];
  recentDeployments: {
    id: string;
    appId: string;
    appName: string;
    status: string;
    environment: string;
    branch: string | null;
    at: string;
    url: string | null;
  }[];
  clients: { id: string; name: string }[];
  /** Providers with at least one connected row anywhere in the portfolio. */
  connected: Record<IntegrationProvider, number>;
  /** True when nothing has ever been added — distinct from "nothing matches". */
  empty: boolean;
};

/** PostgREST returns an embedded row as an object or a one-element array. */
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const DAY = 86_400_000;

type CustomerLite = {
  id: string;
  name: string | null;
  business_name: string | null;
  status: string;
  mrr_cents: number | null;
};

type AppRaw = {
  id: string;
  name: string;
  slug: string;
  internal_name: string | null;
  description: string | null;
  logo_url: string | null;
  customer_id: string | null;
  job_id: string | null;
  service_id: string | null;
  client_service_id: string | null;
  ownership_type: OwnershipType;
  platform_type: PlatformType;
  lifecycle_status: LifecycleStatus;
  framework: string | null;
  current_version: string | null;
  technical_owner: string | null;
  business_owner: string | null;
  monthly_fee_cents: number | null;
  billing_type: string;
  billing_status: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  customers: CustomerLite | CustomerLite[] | null;
};

type EnvRaw = {
  id: string;
  app_id: string;
  name: string;
  environment_type: EnvironmentType;
  is_production: boolean;
  url: string | null;
};

type IntegrationRaw = {
  app_id: string;
  provider: IntegrationProvider;
  status: string;
  error: string | null;
  label: string | null;
};

type DeployRaw = {
  id: string;
  app_id: string;
  environment: string;
  status: string;
  branch: string | null;
  started_at: string;
  deployment_url: string | null;
};

type DomainRaw = {
  app_id: string;
  domain: string;
  environment: string;
  is_primary: boolean;
  ssl_status: string;
  ssl_expires_at: string | null;
};

type CheckRaw = {
  app_id: string;
  check_type: string;
  status: string;
  message: string | null;
  response_time_ms: number | null;
  checked_at: string;
};

type IncidentRaw = {
  id: string;
  app_id: string;
  severity: string;
  message: string;
  status: string;
  started_at: string;
};

export async function loadAppBoard(
  sb: SupabaseClient,
  filters: AppFilters
): Promise<AppBoard> {
  // Health checks older than this cannot affect a verdict, so there is no
  // reason to read them on the board.
  const checkWindow = new Date(Date.now() - 3 * DAY).toISOString();

  const [apps, environments, integrations, deployments, domains, checks, incidents, openTasks, clientServices] =
    await Promise.all([
      sb
        .from("apps")
        .select(
          "id, name, slug, internal_name, description, logo_url, customer_id, job_id, service_id, client_service_id, ownership_type, platform_type, lifecycle_status, framework, current_version, technical_owner, business_owner, monthly_fee_cents, billing_type, billing_status, is_archived, created_at, updated_at, customers(id, name, business_name, status, mrr_cents)"
        )
        .order("name", { ascending: true })
        .then((r) => unwrap(r, "apps")),
      sb
        .from("app_environments")
        .select("id, app_id, name, environment_type, is_production, url")
        .then((r) => unwrap(r, "environments")),
      sb
        .from("app_integrations")
        .select("app_id, provider, status, error, label")
        .then((r) => unwrap(r, "integrations")),
      sb
        .from("app_deployments")
        .select("id, app_id, environment, status, branch, started_at, deployment_url")
        .order("started_at", { ascending: false })
        .limit(200)
        .then((r) => unwrap(r, "deployments")),
      sb
        .from("app_domains")
        .select("app_id, domain, environment, is_primary, ssl_status, ssl_expires_at")
        .then((r) => unwrap(r, "domains")),
      sb
        .from("app_health_checks")
        .select("app_id, check_type, status, message, response_time_ms, checked_at")
        .gte("checked_at", checkWindow)
        .order("checked_at", { ascending: false })
        .limit(1000)
        .then((r) => unwrap(r, "health checks")),
      sb
        .from("app_incidents")
        .select("id, app_id, severity, message, status, started_at")
        .neq("status", "resolved")
        .order("started_at", { ascending: false })
        .then((r) => unwrap(r, "incidents")),
      sb
        .from("tasks")
        .select("id, app_id")
        .not("app_id", "is", null)
        .eq("done", false)
        .not("status", "in", "(completed,canceled)")
        .then((r) => unwrap(r, "open tasks")),
      sb
        .from("client_services")
        .select("id, sale_price_cents, billing_type, status, interval_months")
        .eq("status", "active")
        .then((r) => unwrap(r, "client services")),
    ]);

  const appRaw = apps as AppRaw[];

  const envByApp = groupBy(environments as EnvRaw[], (e) => e.app_id);
  const integrationsByApp = groupBy(integrations as IntegrationRaw[], (i) => i.app_id);
  const deploysByApp = groupBy(deployments as DeployRaw[], (d) => d.app_id);
  const domainsByApp = groupBy(domains as DomainRaw[], (d) => d.app_id);
  const checksByApp = groupBy(checks as CheckRaw[], (c) => c.app_id);
  const incidentsByApp = groupBy(incidents as IncidentRaw[], (i) => i.app_id);

  const openTaskCount = new Map<string, number>();
  for (const t of openTasks as { app_id: string | null }[]) {
    if (!t.app_id) continue;
    openTaskCount.set(t.app_id, (openTaskCount.get(t.app_id) ?? 0) + 1);
  }

  const serviceById = new Map(
    (clientServices as { id: string; sale_price_cents: number; billing_type: string; interval_months: number }[])
      .map((s) => [s.id, s] as const)
  );

  const now = Date.now();

  const rowsAll: AppRow[] = appRaw.map((a) => {
    const customer = one<CustomerLite>(a.customers);
    const envs = envByApp.get(a.id) ?? [];
    const appIntegrations = integrationsByApp.get(a.id) ?? [];
    const appDeploys = deploysByApp.get(a.id) ?? [];
    const appDomains = domainsByApp.get(a.id) ?? [];
    const appIncidents = incidentsByApp.get(a.id) ?? [];

    const production = envs.find((e) => e.is_production) ?? envs.find((e) => e.environment_type === "production") ?? null;
    const staging = envs.find((e) => e.environment_type === "staging") ?? null;
    const primaryDomain =
      appDomains.find((d) => d.is_primary && d.environment === "production") ??
      appDomains.find((d) => d.environment === "production") ??
      null;

    const lastProduction = appDeploys.find((d) => d.environment === "production") ?? null;
    const lastAny = appDeploys[0] ?? null;

    const health = scoreApp({
      lifecycleStatus: a.lifecycle_status,
      isArchived: a.is_archived,
      checks: (checksByApp.get(a.id) ?? []).map((c) => ({
        checkType: c.check_type as never,
        status: c.status as HealthState,
        message: c.message,
        responseTimeMs: c.response_time_ms,
        checkedAt: c.checked_at,
      })),
      incidents: appIncidents.map((i) => ({
        severity: i.severity as never,
        message: i.message,
        status: i.status,
        startedAt: i.started_at,
      })),
      integrations: appIntegrations.map((i) => ({
        provider: i.provider,
        status: i.status,
        error: i.error,
        label: i.label || INTEGRATION_LABELS[i.provider] || i.provider,
      })),
      lastProductionDeployment: lastProduction
        ? { status: lastProduction.status, at: lastProduction.started_at }
        : null,
      domains: appDomains.map((d) => ({
        domain: d.domain,
        sslStatus: d.ssl_status,
        environment: d.environment,
        expiresInDays: d.ssl_expires_at
          ? Math.round((new Date(d.ssl_expires_at).getTime() - now) / DAY)
          : null,
      })),
      billingStatus: a.billing_status,
      now,
    });

    // ── Revenue, and where it came from ──────────────────────────
    // The linked client service is the stronger source: it is the row the
    // billing system actually works from. The app's own monthly fee is the
    // agreed contract term and is used when there is no assignment. When
    // neither says anything the row shows a dash, not a zero.
    const linked = a.client_service_id ? serviceById.get(a.client_service_id) : undefined;
    let revenueCents: number | null = null;
    let revenueSource: AppRow["revenueSource"] = null;
    if (linked && linked.billing_type === "recurring") {
      revenueCents = Math.round(linked.sale_price_cents / Math.max(1, linked.interval_months));
      revenueSource = "client_service";
    } else if (
      a.billing_type === "recurring" &&
      a.billing_status === "active" &&
      (a.monthly_fee_cents ?? 0) > 0
    ) {
      revenueCents = a.monthly_fee_cents;
      revenueSource = "contract";
    }

    const environmentLabel =
      envs.length === 0
        ? "None"
        : envs.length > 1
          ? "Multiple"
          : ENVIRONMENT_LABELS[envs[0].environment_type] ?? envs[0].name;

    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      internalName: a.internal_name,
      description: a.description,
      logoUrl: a.logo_url,
      ownership: a.ownership_type,
      ownershipLabel: OWNERSHIP_LABELS[a.ownership_type] ?? a.ownership_type,
      platform: a.platform_type,
      platformLabel: PLATFORM_LABELS[a.platform_type] ?? a.platform_type,
      status: a.lifecycle_status,
      statusLabel: LIFECYCLE_LABELS[a.lifecycle_status] ?? a.lifecycle_status,
      framework: a.framework,
      currentVersion: a.current_version,
      technicalOwner: a.technical_owner,
      businessOwner: a.business_owner,
      client: customer
        ? { id: customer.id, name: customer.business_name || customer.name || "Client" }
        : null,
      jobId: a.job_id,
      serviceId: a.service_id,
      environmentLabel,
      environments: envs.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.environment_type,
        url: safeUrl(e.url),
      })),
      productionUrl: safeUrl(production?.url) ?? (primaryDomain ? `https://${primaryDomain.domain}` : null),
      productionDomain: primaryDomain?.domain ?? hostOf(production?.url ?? null),
      stagingUrl: safeUrl(staging?.url),
      health,
      lastDeploy: lastAny
        ? { at: lastAny.started_at, status: lastAny.status, environment: lastAny.environment }
        : null,
      revenueCents,
      revenueSource,
      openIssues: openTaskCount.get(a.id) ?? 0,
      openIncidents: appIncidents.length,
      connectedProviders: appIntegrations
        .filter((i) => i.status === "connected")
        .map((i) => i.provider),
      isArchived: a.is_archived,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };
  });

  // ── Tabs ───────────────────────────────────────────────────────────
  const active = rowsAll.filter((r) => !r.isArchived);

  const tabCounts: Record<AppFilters["tab"], number> = {
    all: active.length,
    live: active.filter((r) => r.status === "live").length,
    development: active.filter((r) => IN_DEVELOPMENT.includes(r.status)).length,
    attention: active.filter((r) => needsAttention(r.health.state)).length,
    archived: rowsAll.filter((r) => r.isArchived).length,
  };

  const inTab = (r: AppRow): boolean => {
    switch (filters.tab) {
      case "live": return !r.isArchived && r.status === "live";
      case "development": return !r.isArchived && IN_DEVELOPMENT.includes(r.status);
      case "attention": return !r.isArchived && needsAttention(r.health.state);
      case "archived": return r.isArchived;
      default: return !r.isArchived;
    }
  };

  const needle = filters.q?.toLowerCase().trim();

  const rows = rowsAll
    .filter((r) => {
      if (!inTab(r)) return false;
      if (needle) {
        const hay = [
          r.name, r.slug, r.internalName, r.client?.name,
          r.productionDomain, r.framework, r.technicalOwner, r.businessOwner,
          ...r.environments.map((e) => e.url ?? ""),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filters.status && r.status !== filters.status) return false;
      if (filters.platform && r.platform !== filters.platform) return false;
      if (filters.ownership && r.ownership !== filters.ownership) return false;
      if (filters.health && r.health.state !== filters.health) return false;
      if (filters.client && r.client?.id !== filters.client) return false;
      if (filters.environment) {
        const wanted = filters.environment;
        if (wanted === "multiple") {
          if (r.environments.length < 2) return false;
        } else if (!r.environments.some((e) => e.type === wanted)) {
          return false;
        }
      }
      return true;
    })
    .sort(sorter(filters.sort));

  // ── KPIs ───────────────────────────────────────────────────────────
  // Each client service is counted once even when two apps point at it, so
  // a shared retainer cannot inflate the portfolio total.
  const countedServices = new Set<string>();
  let revenueTotal = 0;
  let revenueKnown = false;
  for (const r of active) {
    if (r.revenueCents === null) continue;
    const app = appRaw.find((a) => a.id === r.id);
    const key = app?.client_service_id;
    if (r.revenueSource === "client_service" && key) {
      if (countedServices.has(key)) continue;
      countedServices.add(key);
    }
    revenueTotal += r.revenueCents;
    revenueKnown = true;
  }

  const activeClients = new Set(
    active
      .filter((r) => r.client && r.status !== "archived")
      .map((r) => r.client!.id)
  );

  const kpis = {
    total: active.length,
    live: tabCounts.live,
    inDevelopment: tabCounts.development,
    withIssues: tabCounts.attention,
    monthlyRevenueCents: revenueKnown ? revenueTotal : null,
    activeClients: activeClients.size,
  };

  // ── Panels ─────────────────────────────────────────────────────────
  const healthBreakdown = (["critical", "warning", "unknown", "healthy"] as HealthState[])
    .map((state) => ({
      state,
      label: HEALTH_LABELS[state],
      count: active.filter((r) => r.health.state === state).length,
    }))
    .filter((h) => h.count > 0);

  const byPlatform = (Object.keys(PLATFORM_LABELS) as PlatformType[])
    .map((platform) => ({
      platform,
      label: PLATFORM_LABELS[platform],
      count: active.filter((r) => r.platform === platform).length,
    }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);

  const alerts: AppAlert[] = active
    .flatMap((r) =>
      r.health.reasons
        .filter((reason) => reason.severity !== "info")
        .map((reason, index) => ({
          id: `${r.id}:${index}`,
          appId: r.id,
          appName: r.name,
          severity: reason.severity as "critical" | "warning",
          title: reason.label,
          detail: reason.detail,
        }))
    )
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1))
    .slice(0, 8);

  const nameById = new Map(rowsAll.map((r) => [r.id, r.name] as const));
  const recentDeployments = (deployments as DeployRaw[])
    .filter((d) => nameById.has(d.app_id))
    .slice(0, 8)
    .map((d) => ({
      id: d.id,
      appId: d.app_id,
      appName: nameById.get(d.app_id)!,
      status: d.status,
      environment: d.environment,
      branch: d.branch,
      at: d.started_at,
      url: safeUrl(d.deployment_url),
    }));

  const clients = [
    ...new Map(active.filter((r) => r.client).map((r) => [r.client!.id, r.client!] as const)).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const connected = Object.fromEntries(
    (Object.keys(INTEGRATION_LABELS) as IntegrationProvider[]).map((provider) => [
      provider,
      (integrations as IntegrationRaw[]).filter(
        (i) => i.provider === provider && i.status === "connected"
      ).length,
    ])
  ) as Record<IntegrationProvider, number>;

  return {
    kpis,
    tabCounts,
    rows,
    portfolioSize: active.length,
    healthBreakdown,
    byPlatform,
    alerts,
    recentDeployments,
    clients,
    connected,
    empty: rowsAll.length === 0,
  };
}

/**
 * The apps belonging to one client.
 *
 * Exported for the Client record (§26) so that screen never has to know how
 * an app is shaped or how its health is scored. Deliberately small: the
 * five things a client card wants and nothing else.
 */
export async function appsForClient(
  sb: SupabaseClient,
  customerId: string
): Promise<
  {
    id: string;
    name: string;
    status: LifecycleStatus;
    statusLabel: string;
    platformLabel: string;
    health: HealthState;
    healthLabel: string;
    monthlyCents: number | null;
  }[]
> {
  const [apps, checks] = await Promise.all([
    sb
      .from("apps")
      .select(
        "id, name, lifecycle_status, platform_type, monthly_fee_cents, billing_type, billing_status, is_archived"
      )
      .eq("customer_id", customerId)
      .eq("is_archived", false)
      .order("name")
      .then((r) => unwrap(r, "client apps")),
    sb
      .from("app_health_checks")
      .select("app_id, check_type, status, message, response_time_ms, checked_at")
      .gte("checked_at", new Date(Date.now() - DAY).toISOString())
      .then((r) => unwrap(r, "client app checks")),
  ]);

  const byApp = groupBy(checks as CheckRaw[], (c) => c.app_id);

  return (apps as AppRaw[]).map((a) => {
    const health = scoreApp({
      lifecycleStatus: a.lifecycle_status,
      isArchived: a.is_archived,
      checks: (byApp.get(a.id) ?? []).map((c) => ({
        checkType: c.check_type as never,
        status: c.status as HealthState,
        message: c.message,
        responseTimeMs: c.response_time_ms,
        checkedAt: c.checked_at,
      })),
      incidents: [],
      integrations: [],
      lastProductionDeployment: null,
      domains: [],
      billingStatus: a.billing_status,
    });

    return {
      id: a.id,
      name: a.name,
      status: a.lifecycle_status,
      statusLabel: LIFECYCLE_LABELS[a.lifecycle_status] ?? a.lifecycle_status,
      platformLabel: PLATFORM_LABELS[a.platform_type] ?? a.platform_type,
      health: health.state,
      healthLabel: health.label,
      monthlyCents:
        a.billing_type === "recurring" && a.billing_status === "active"
          ? a.monthly_fee_cents
          : null,
    };
  });
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const held = map.get(k);
    if (held) held.push(row);
    else map.set(k, [row]);
  }
  return map;
}

function sorter(sort: AppFilters["sort"]): (a: AppRow, b: AppRow) => number {
  switch (sort) {
    case "health":
      return (a, b) =>
        HEALTH_RANK[a.health.state] - HEALTH_RANK[b.health.state] ||
        a.name.localeCompare(b.name);
    case "revenue":
      return (a, b) => (b.revenueCents ?? -1) - (a.revenueCents ?? -1) || a.name.localeCompare(b.name);
    case "deploy":
      return (a, b) => (b.lastDeploy?.at ?? "").localeCompare(a.lastDeploy?.at ?? "") || a.name.localeCompare(b.name);
    case "updated":
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt);
    case "client":
      return (a, b) =>
        (a.client?.name ?? "￿").localeCompare(b.client?.name ?? "￿") ||
        a.name.localeCompare(b.name);
    default:
      return (a, b) => a.name.localeCompare(b.name);
  }
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
