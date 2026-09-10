import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { scoreApp } from "@/lib/apps/health";
import { HEALTH_RANK, needsAttention, scoreSoftware, type SoftwareHealth } from "./health";
import {
  BILLABLE_CLIENT_STATUS,
  DEVELOPMENT_TAB,
  HEALTH_LABELS,
  IN_DEVELOPMENT,
  LIFECYCLE_LABELS,
  PRODUCT_TYPE_LABELS,
  versionSortKey,
  type ClientStatus,
  type HealthState,
  type LifecycleStatus,
  type ProductType,
} from "./types";

/**
 * Everything the Software screen shows, in ONE round of queries.
 *
 * The rule from §44 of the brief, and from every other board in this admin:
 * loading /admin/software must not fan out per product. Nine parallel selects
 * come back, everything else is joined in memory, and no external provider is
 * called on this path at all.
 *
 * The other rule, inherited from Websites and Apps: A NUMBER APPEARS ONLY
 * WHEN SOMETHING MEASURED IT. Health rolls up from the linked apps and is
 * Unknown when nothing recent exists or no app is linked. MRR is the sum of
 * what clients ACTUALLY AGREED TO PAY — the snapshots on software_clients —
 * never the current plan price, so changing a price list cannot silently
 * restate last month's revenue. Where nothing is known the cell is a dash,
 * not a zero.
 */

const DAY = 86_400_000;

export type SoftwareRow = {
  id: string;
  name: string;
  slug: string;
  internalName: string | null;
  description: string | null;
  logoUrl: string | null;

  productType: ProductType;
  productTypeLabel: string;
  industry: string | null;

  status: LifecycleStatus;
  statusLabel: string;
  health: SoftwareHealth;

  owner: string | null;
  technicalOwner: string | null;
  salesOwner: string | null;

  /** Clients on this product, and how many are actually billing. */
  clientCount: number;
  billingClientCount: number;
  clients: { id: string; name: string }[];

  /** What is live, and what is queued behind it. */
  currentVersion: string | null;
  stagingVersion: string | null;

  planCount: number;
  appCount: number;
  featureCount: number;

  /** Recurring revenue from the agreed snapshots. Null when nothing bills. */
  mrrCents: number | null;
  /** Setup fees agreed across this product's clients. Null when none. */
  setupRevenueCents: number | null;

  openIssues: number;
  criticalIssues: number;
  nextRelease: { id: string; name: string; targetDate: string | null; status: string } | null;

  isArchived: boolean;
  launchDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SoftwareFilters = {
  q?: string;
  tab: "all" | "live" | "development" | "beta" | "testing" | "archived";
  type?: string;
  status?: string;
  industry?: string;
  health?: string;
  owner?: string;
  client?: string;
  sort: "updated" | "mrr" | "clients" | "version" | "health" | "name";
  view: "table" | "cards";
  /** Window for the Revenue Overview panel. §9. */
  months: 3 | 6 | 12;
};

export type SoftwareAlert = {
  id: string;
  softwareId: string;
  softwareName: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
};

/**
 * The Revenue Overview panel's numbers.
 *
 * The monthly series is RECONSTRUCTED from subscription start and end dates
 * at each client's agreed price — real rows, not a stored rollup, because no
 * rollup exists yet and inventing one would be worse. It is approximate in
 * one knowable way: a client who was migrated to different pricing shows
 * their CURRENT agreed price for the whole period, because that is the only
 * price the assignment row holds. The panel says so rather than presenting
 * the line as measured history.
 *
 * `basis: "none"` means not one client has a start date and a price, so
 * there is nothing to draw and the panel says that instead of a flat zero.
 */
export type RevenueOverview = {
  months: { label: string; mrrCents: number; clients: number }[];
  mrrCents: number | null;
  /** Fraction, e.g. 0.22 for +22%. Null when the window has no baseline. */
  mrrDelta: number | null;
  clientDelta: number | null;
  newClients: number;
  canceledClients: number;
  /** Canceled ÷ clients present at any point in the window. */
  churnRate: number | null;
  basis: "reconstructed" | "none";
};

export type SoftwareBoard = {
  revenue: RevenueOverview;
  kpis: {
    activeProducts: number;
    totalProducts: number;
    saasClients: number;
    mrrCents: number | null;
    inDevelopment: number;
    activeVersions: number;
    needingAttention: number;
  };
  tabCounts: Record<SoftwareFilters["tab"], number>;
  rows: SoftwareRow[];
  alerts: SoftwareAlert[];
  byStatus: { status: LifecycleStatus; label: string; count: number }[];
  healthBreakdown: { state: HealthState; label: string; count: number }[];
  topPerforming: {
    id: string;
    name: string;
    statusLabel: string;
    status: LifecycleStatus;
    clientCount: number;
    mrrCents: number | null;
    health: HealthState;
    healthLabel: string;
  }[];
  /** Distinct values present, so a filter never offers an empty result. */
  industries: string[];
  owners: string[];
  clients: { id: string; name: string }[];
  /** True when nothing has ever been added — distinct from "nothing matches". */
  empty: boolean;
};

/** PostgREST returns an embedded row as an object or a one-element array. */
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type CustomerLite = { id: string; name: string | null; business_name: string | null };

type ProductRaw = {
  id: string;
  name: string;
  slug: string;
  internal_name: string | null;
  description: string | null;
  logo_url: string | null;
  product_type: ProductType;
  industry: string | null;
  status: LifecycleStatus;
  owner: string | null;
  technical_owner: string | null;
  sales_owner: string | null;
  launch_date: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

type PlanRaw = { id: string; software_id: string; status: string };
type FeatureRaw = { id: string; software_id: string };

type VersionRaw = {
  id: string;
  software_id: string;
  version: string;
  is_current_production: boolean;
  is_current_staging: boolean;
};

type ClientRaw = {
  id: string;
  software_id: string;
  customer_id: string;
  status: ClientStatus;
  monthly_price_snapshot_cents: number | null;
  setup_fee_snapshot_cents: number | null;
  onboarding_status: string;
  onboarding_due_at: string | null;
  start_date: string;
  end_date: string | null;
  customers: CustomerLite | CustomerLite[] | null;
};

type AppRaw = {
  id: string;
  software_id: string | null;
  name: string;
  lifecycle_status: string;
  is_archived: boolean;
  billing_status: string;
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
  app_id: string;
  severity: string;
  message: string;
  status: string;
  started_at: string;
};

type ReleaseRaw = {
  id: string;
  software_id: string;
  name: string;
  status: string;
  target_date: string | null;
  blocked_reason: string | null;
};

type TaskRaw = { id: string; software_id: string | null; priority: string | null };

export async function loadSoftwareBoard(
  sb: SupabaseClient,
  filters: SoftwareFilters
): Promise<SoftwareBoard> {
  // Health checks older than this cannot affect a verdict, so there is no
  // reason to read them on the board.
  const checkWindow = new Date(Date.now() - 3 * DAY).toISOString();

  const [products, plans, features, versions, clients, apps, checks, incidents, releases, openTasks] =
    await Promise.all([
      sb
        .from("software_products")
        .select(
          "id, name, slug, internal_name, description, logo_url, product_type, industry, status, owner, technical_owner, sales_owner, launch_date, is_archived, created_at, updated_at"
        )
        .order("name", { ascending: true })
        .then((r) => unwrap<ProductRaw[]>(r, "software products")),
      sb
        .from("software_plans")
        .select("id, software_id, status")
        .then((r) => unwrap<PlanRaw[]>(r, "software plans")),
      sb
        .from("software_features")
        .select("id, software_id")
        .then((r) => unwrap<FeatureRaw[]>(r, "software features")),
      sb
        .from("software_versions")
        .select("id, software_id, version, is_current_production, is_current_staging")
        .then((r) => unwrap<VersionRaw[]>(r, "software versions")),
      sb
        .from("software_clients")
        .select(
          "id, software_id, customer_id, status, monthly_price_snapshot_cents, setup_fee_snapshot_cents, onboarding_status, onboarding_due_at, start_date, end_date, customers(id, name, business_name)"
        )
        .then((r) => unwrap<ClientRaw[]>(r, "software clients")),
      sb
        .from("apps")
        .select("id, software_id, name, lifecycle_status, is_archived, billing_status")
        .not("software_id", "is", null)
        .then((r) => unwrap<AppRaw[]>(r, "linked apps")),
      sb
        .from("app_health_checks")
        .select("app_id, check_type, status, message, response_time_ms, checked_at")
        .gte("checked_at", checkWindow)
        .order("checked_at", { ascending: false })
        .limit(1000)
        .then((r) => unwrap<CheckRaw[]>(r, "app health checks")),
      sb
        .from("app_incidents")
        .select("app_id, severity, message, status, started_at")
        .neq("status", "resolved")
        .then((r) => unwrap<IncidentRaw[]>(r, "app incidents")),
      sb
        .from("software_releases")
        .select("id, software_id, name, status, target_date, blocked_reason")
        .not("status", "in", "(released,canceled)")
        .order("target_date", { ascending: true, nullsFirst: false })
        .then((r) => unwrap<ReleaseRaw[]>(r, "software releases")),
      sb
        .from("tasks")
        .select("id, software_id, priority")
        .not("software_id", "is", null)
        .eq("done", false)
        .not("status", "in", "(completed,canceled)")
        .then((r) => unwrap<TaskRaw[]>(r, "open software tasks")),
    ]);

  const plansBy = groupBy(plans, (p) => p.software_id);
  const featuresBy = groupBy(features, (f) => f.software_id);
  const versionsBy = groupBy(versions, (v) => v.software_id);
  const clientsBy = groupBy(clients, (c) => c.software_id);
  const appsBy = groupBy(apps.filter((a) => a.software_id), (a) => a.software_id!);
  const releasesBy = groupBy(releases, (r) => r.software_id);
  const checksByApp = groupBy(checks, (c) => c.app_id);
  const incidentsByApp = groupBy(incidents, (i) => i.app_id);

  const issuesBy = new Map<string, { open: number; critical: number }>();
  for (const task of openTasks) {
    if (!task.software_id) continue;
    const held = issuesBy.get(task.software_id) ?? { open: 0, critical: 0 };
    held.open += 1;
    if (task.priority === "critical") held.critical += 1;
    issuesBy.set(task.software_id, held);
  }

  const now = Date.now();

  const rowsAll: SoftwareRow[] = products.map((product) => {
    const productPlans = plansBy.get(product.id) ?? [];
    const productVersions = versionsBy.get(product.id) ?? [];
    const productClients = clientsBy.get(product.id) ?? [];
    const productApps = (appsBy.get(product.id) ?? []).filter((a) => !a.is_archived);
    const productReleases = releasesBy.get(product.id) ?? [];
    const issues = issuesBy.get(product.id) ?? { open: 0, critical: 0 };

    // ── App health, rolled up ──────────────────────────────────────
    // The app module already knows how to score an app; this does not
    // reimplement it. Integrations, domains and deployments are read on the
    // app's own screen, so the same reduced input `appsForClient` uses is
    // used here: checks and incidents, which are the signals that decide
    // whether something is actually down.
    const appHealth = productApps.map((app) => {
      const verdict = scoreApp({
        lifecycleStatus: app.lifecycle_status,
        isArchived: app.is_archived,
        checks: (checksByApp.get(app.id) ?? []).map((c) => ({
          checkType: c.check_type as never,
          status: c.status as HealthState,
          message: c.message,
          responseTimeMs: c.response_time_ms,
          checkedAt: c.checked_at,
        })),
        incidents: (incidentsByApp.get(app.id) ?? []).map((i) => ({
          severity: i.severity as never,
          message: i.message,
          status: i.status,
          startedAt: i.started_at,
        })),
        integrations: [],
        lastProductionDeployment: null,
        domains: [],
        billingStatus: app.billing_status,
        now,
      });

      const worst = verdict.reasons.find((r) => r.severity === "critical")
        ?? verdict.reasons.find((r) => r.severity === "warning")
        ?? null;

      return {
        id: app.id,
        name: app.name,
        state: verdict.state,
        observed: verdict.observed,
        isProduction: app.lifecycle_status === "live",
        topReason: worst ? worst.detail : null,
      };
    });

    // ── The product's own signals ──────────────────────────────────
    const blockedReleases = productReleases
      .filter((r) => r.status === "blocked")
      .map((r) => ({ name: r.name, reason: r.blocked_reason }));

    const overdueReleases = productReleases
      .filter((r) => r.status !== "blocked" && r.target_date && new Date(r.target_date).getTime() < now)
      .map((r) => ({
        name: r.name,
        targetDate: r.target_date!,
        daysLate: Math.max(1, Math.round((now - new Date(r.target_date!).getTime()) / DAY)),
      }));

    const overdueOnboarding = productClients
      .filter(
        (c) =>
          c.onboarding_status !== "complete" &&
          c.status !== "canceled" &&
          c.onboarding_due_at &&
          new Date(c.onboarding_due_at).getTime() < now
      )
      .map((c) => ({
        client: clientName(one<CustomerLite>(c.customers)),
        daysLate: Math.max(1, Math.round((now - new Date(c.onboarding_due_at!).getTime()) / DAY)),
      }));

    const pastDueClients = productClients
      .filter((c) => c.status === "past_due")
      .map((c) => ({ client: clientName(one<CustomerLite>(c.customers)) }));

    const liveClients = productClients.filter((c) => c.status !== "canceled");

    const health = scoreSoftware({
      lifecycleStatus: product.status,
      isArchived: product.is_archived,
      apps: appHealth,
      blockedReleases,
      overdueReleases,
      overdueOnboarding,
      pastDueClients,
      criticalIssues: issues.critical,
      totalClients: liveClients.length,
    });

    // ── Revenue, from the AGREED SNAPSHOTS ─────────────────────────
    // Never the plan price. A client pays what they agreed to pay, and the
    // whole point of the snapshot columns is that repricing a plan cannot
    // reach backwards into this number.
    const billing = productClients.filter((c) =>
      (BILLABLE_CLIENT_STATUS as string[]).includes(c.status)
    );
    let mrr = 0;
    let mrrKnown = false;
    for (const client of billing) {
      if (client.monthly_price_snapshot_cents === null) continue;
      mrr += client.monthly_price_snapshot_cents;
      mrrKnown = true;
    }

    let setup = 0;
    let setupKnown = false;
    for (const client of productClients) {
      if (client.status === "canceled") continue;
      if (client.setup_fee_snapshot_cents === null) continue;
      setup += client.setup_fee_snapshot_cents;
      setupKnown = true;
    }

    const production = productVersions.find((v) => v.is_current_production) ?? null;
    const staging = productVersions.find((v) => v.is_current_staging) ?? null;

    // Soonest dated release first; an undated one only if nothing is dated.
    const dated = productReleases
      .filter((r) => r.target_date)
      .sort((a, b) => a.target_date!.localeCompare(b.target_date!));
    const nextRelease = dated[0] ?? productReleases[0] ?? null;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      internalName: product.internal_name,
      description: product.description,
      logoUrl: product.logo_url,
      productType: product.product_type,
      productTypeLabel: PRODUCT_TYPE_LABELS[product.product_type] ?? product.product_type,
      industry: product.industry,
      status: product.status,
      statusLabel: LIFECYCLE_LABELS[product.status] ?? product.status,
      health,
      owner: product.owner,
      technicalOwner: product.technical_owner,
      salesOwner: product.sales_owner,
      clientCount: liveClients.length,
      billingClientCount: billing.length,
      clients: liveClients.map((c) => ({
        id: c.customer_id,
        name: clientName(one<CustomerLite>(c.customers)),
      })),
      currentVersion: production?.version ?? null,
      stagingVersion: staging?.version ?? null,
      planCount: productPlans.filter((p) => p.status !== "retired").length,
      appCount: productApps.length,
      featureCount: (featuresBy.get(product.id) ?? []).length,
      mrrCents: mrrKnown ? mrr : null,
      setupRevenueCents: setupKnown ? setup : null,
      openIssues: issues.open,
      criticalIssues: issues.critical,
      nextRelease: nextRelease
        ? {
            id: nextRelease.id,
            name: nextRelease.name,
            targetDate: nextRelease.target_date,
            status: nextRelease.status,
          }
        : null,
      isArchived: product.is_archived,
      launchDate: product.launch_date,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  });

  // ── Tabs ───────────────────────────────────────────────────────────
  const active = rowsAll.filter((r) => !r.isArchived);

  const tabCounts: Record<SoftwareFilters["tab"], number> = {
    all: active.length,
    live: active.filter((r) => r.status === "live").length,
    development: active.filter((r) => DEVELOPMENT_TAB.includes(r.status)).length,
    beta: active.filter((r) => r.status === "beta").length,
    testing: active.filter((r) => r.status === "testing").length,
    archived: rowsAll.filter((r) => r.isArchived).length,
  };

  const inTab = (r: SoftwareRow): boolean => {
    switch (filters.tab) {
      case "live": return !r.isArchived && r.status === "live";
      case "development": return !r.isArchived && DEVELOPMENT_TAB.includes(r.status);
      case "beta": return !r.isArchived && r.status === "beta";
      case "testing": return !r.isArchived && r.status === "testing";
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
          r.name, r.slug, r.internalName, r.description, r.industry,
          r.owner, r.technicalOwner, r.salesOwner, r.currentVersion,
          ...r.clients.map((c) => c.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filters.type && r.productType !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.industry && r.industry !== filters.industry) return false;
      if (filters.health && r.health.state !== filters.health) return false;
      if (filters.owner && r.owner !== filters.owner && r.technicalOwner !== filters.owner) return false;
      if (filters.client && !r.clients.some((c) => c.id === filters.client)) return false;
      return true;
    })
    .sort(sorter(filters.sort));

  // ── KPIs ───────────────────────────────────────────────────────────
  // A client on two products is ONE SaaS client. Counting the assignment
  // rows instead would inflate the header the moment anything cross-sells.
  const saasClients = new Set<string>();
  for (const row of active) {
    for (const client of row.clients) saasClients.add(client.id);
  }

  let mrrTotal = 0;
  let mrrKnown = false;
  for (const row of active) {
    if (row.mrrCents === null) continue;
    mrrTotal += row.mrrCents;
    mrrKnown = true;
  }

  const activeIds = new Set(active.map((r) => r.id));
  const activeVersions = versions.filter(
    (v) => activeIds.has(v.software_id) && (v.is_current_production || v.is_current_staging)
  ).length;

  const kpis = {
    activeProducts: active.filter((r) => r.status !== "deprecated").length,
    totalProducts: rowsAll.length,
    saasClients: saasClients.size,
    mrrCents: mrrKnown ? mrrTotal : null,
    inDevelopment: active.filter((r) => IN_DEVELOPMENT.includes(r.status)).length,
    activeVersions,
    needingAttention: active.filter((r) => needsAttention(r.health.state)).length,
  };

  // ── Panels ─────────────────────────────────────────────────────────
  const byStatus = (Object.keys(LIFECYCLE_LABELS) as LifecycleStatus[])
    .map((status) => ({
      status,
      label: LIFECYCLE_LABELS[status],
      count: rowsAll.filter((r) => (status === "archived" ? r.isArchived : !r.isArchived && r.status === status)).length,
    }))
    .filter((s) => s.count > 0);

  const healthBreakdown = (["critical", "warning", "unknown", "healthy"] as HealthState[])
    .map((state) => ({
      state,
      label: HEALTH_LABELS[state],
      count: active.filter((r) => r.health.state === state).length,
    }))
    .filter((h) => h.count > 0);

  const alerts: SoftwareAlert[] = active
    .flatMap((r) =>
      r.health.reasons
        .filter((reason) => reason.severity !== "info")
        .map((reason, index) => ({
          id: `${r.id}:${index}`,
          softwareId: r.id,
          softwareName: r.name,
          severity: reason.severity,
          title: reason.label,
          detail: reason.detail,
          href: `/admin/software/${r.id}${reason.tab ? `?tab=${reason.tab}` : ""}`,
        }))
    )
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1))
    .slice(0, 8);

  // Top performing is ordered by real recurring revenue. A product with no
  // billing recorded is not "worst" — it is unranked, and is left out
  // rather than being shown at the bottom with a zero next to it.
  const topPerforming = active
    .filter((r) => r.mrrCents !== null)
    .sort((a, b) => (b.mrrCents ?? 0) - (a.mrrCents ?? 0))
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      statusLabel: r.statusLabel,
      clientCount: r.clientCount,
      mrrCents: r.mrrCents,
      health: r.health.state,
      healthLabel: r.health.label,
    }));

  // ── Revenue overview ───────────────────────────────────────────────
  const revenue = buildRevenueOverview(
    clients.filter((c) => activeIds.has(c.software_id)),
    filters.months,
    kpis.mrrCents
  );

  const industries = [...new Set(active.map((r) => r.industry).filter((v): v is string => Boolean(v)))].sort();
  const owners = [
    ...new Set(
      active.flatMap((r) => [r.owner, r.technicalOwner]).filter((v): v is string => Boolean(v))
    ),
  ].sort();
  const clientChoices = [
    ...new Map(active.flatMap((r) => r.clients).map((c) => [c.id, c] as const)).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    revenue,
    kpis,
    tabCounts,
    rows,
    alerts,
    byStatus,
    healthBreakdown,
    topPerforming,
    industries,
    owners,
    clients: clientChoices,
    empty: rowsAll.length === 0,
  };
}

/**
 * The software products one client is on.
 *
 * Exported for the Client record so that screen never has to know how a
 * product is shaped. Deliberately small: the six things a client card wants.
 */
export async function softwareForClient(
  sb: SupabaseClient,
  customerId: string
): Promise<
  {
    id: string;
    name: string;
    planName: string | null;
    status: ClientStatus;
    monthlyCents: number | null;
    version: string | null;
  }[]
> {
  type Row = {
    software_id: string;
    status: ClientStatus;
    monthly_price_snapshot_cents: number | null;
    software_products: { id: string; name: string; is_archived: boolean } | { id: string; name: string; is_archived: boolean }[] | null;
    software_plans: { name: string } | { name: string }[] | null;
    software_versions: { version: string } | { version: string }[] | null;
  };

  const rows = await sb
    .from("software_clients")
    .select(
      "software_id, status, monthly_price_snapshot_cents, software_products(id, name, is_archived), software_plans(name), software_versions(version)"
    )
    .eq("customer_id", customerId)
    .then((r) => unwrap<Row[]>(r, "client software"));

  return rows
    .map((row) => {
      const product = one(row.software_products);
      if (!product || product.is_archived) return null;
      return {
        id: product.id,
        name: product.name,
        planName: one(row.software_plans)?.name ?? null,
        status: row.status,
        monthlyCents: row.monthly_price_snapshot_cents,
        version: one(row.software_versions)?.version ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
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

function clientName(customer: CustomerLite | null): string {
  return customer?.business_name || customer?.name || "Client";
}

/**
 * Rebuild the last N months of recurring revenue from subscription dates.
 *
 * A client counts towards a month when their start date is on or before the
 * last day of it and they had not ended by then. That is the whole rule, and
 * it is applied to real rows — nothing here smooths, projects or fills a gap.
 * A client with no start date or no agreed price simply is not in the series,
 * which is why `basis` exists: a chart drawn from nothing must say so rather
 * than render a confident flat line at zero.
 */
function buildRevenueOverview(
  clients: ClientRaw[],
  windowMonths: number,
  currentMrr: number | null
): RevenueOverview {
  const usable = clients.filter((c) => c.start_date && c.monthly_price_snapshot_cents !== null);

  const now = new Date();
  const months: { label: string; mrrCents: number; clients: number }[] = [];

  for (let back = windowMonths - 1; back >= 0; back -= 1) {
    // Last instant of that month, so a subscription starting mid-month counts
    // for the month it started in.
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
    const endIso = end.toISOString().slice(0, 10);

    let mrr = 0;
    let count = 0;
    for (const client of usable) {
      if (client.start_date > endIso) continue;
      if (client.end_date && client.end_date <= endIso) continue;
      // A canceled client with no end date cannot be placed in time, so it
      // is left out of history rather than guessed at.
      if (client.status === "canceled" && !client.end_date) continue;
      mrr += client.monthly_price_snapshot_cents ?? 0;
      count += 1;
    }

    months.push({
      label: end.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" }),
      mrrCents: mrr,
      clients: count,
    });
  }

  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (windowMonths - 1), 1))
    .toISOString()
    .slice(0, 10);

  const newClients = usable.filter((c) => c.start_date >= windowStart).length;
  const canceledClients = usable.filter((c) => c.end_date && c.end_date >= windowStart).length;
  const presentInWindow = usable.filter(
    (c) => c.start_date <= new Date().toISOString().slice(0, 10) && (!c.end_date || c.end_date >= windowStart)
  ).length;

  const first = months[0];
  const last = months[months.length - 1];

  return {
    months,
    mrrCents: currentMrr,
    // A delta needs something to be a delta FROM. Growing from zero is not a
    // percentage, it is a start, and the panel prints it as such.
    mrrDelta: first && last && first.mrrCents > 0 ? (last.mrrCents - first.mrrCents) / first.mrrCents : null,
    clientDelta: first && last && first.clients > 0 ? (last.clients - first.clients) / first.clients : null,
    newClients,
    canceledClients,
    churnRate: presentInWindow > 0 ? canceledClients / presentInWindow : null,
    basis: usable.length > 0 ? "reconstructed" : "none",
  };
}

function sorter(sort: SoftwareFilters["sort"]): (a: SoftwareRow, b: SoftwareRow) => number {
  switch (sort) {
    case "mrr":
      // Unknown sorts last, not as zero: "no billing recorded" and "$0" are
      // different answers and only one of them is a measurement.
      return (a, b) => (b.mrrCents ?? -1) - (a.mrrCents ?? -1) || a.name.localeCompare(b.name);
    case "clients":
      return (a, b) => b.clientCount - a.clientCount || a.name.localeCompare(b.name);
    case "version":
      return (a, b) =>
        versionSortKey(b.currentVersion ?? "").localeCompare(versionSortKey(a.currentVersion ?? "")) ||
        a.name.localeCompare(b.name);
    case "health":
      return (a, b) =>
        HEALTH_RANK[a.health.state] - HEALTH_RANK[b.health.state] || a.name.localeCompare(b.name);
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    default:
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt);
  }
}
