import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { scoreApp } from "@/lib/apps/health";
import { scoreSoftware, type SoftwareHealth } from "./health";
import {
  BILLABLE_CLIENT_STATUS,
  LIFECYCLE_LABELS,
  PRODUCT_TYPE_LABELS,
  versionSortKey,
  type BillingModel,
  type ClientStatus,
  type FeatureCategory,
  type FeatureStatus,
  type HealthState,
  type Inclusion,
  type LifecycleStatus,
  type LimitType,
  type OnboardingStatus,
  type PlanStatus,
  type ProductType,
  type ReleaseChannel,
  type VersionStatus,
} from "./types";

/**
 * One software product, and everything the detail screen needs.
 *
 * Loaded in one round of parallel queries for the same reason the board is
 * (§44). The tabs that are expensive and rarely opened — the full activity
 * history, every invoice — are NOT loaded here; they belong to their own tab
 * and can fetch when someone actually looks.
 *
 * The revenue rules, again, because this is where they are easiest to get
 * wrong:
 *   · MRR is the sum of the AGREED SNAPSHOTS on software_clients. Never a
 *     plan price. Repricing a plan cannot restate revenue.
 *   · Lifetime revenue is what was actually COLLECTED — amount_paid_cents on
 *     invoices attributed to this product — and is null, not zero, when no
 *     invoice has ever been attributed. "Nothing attributed" and "nothing
 *     earned" are different answers.
 */

const DAY = 86_400_000;

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export type PlanLimit = {
  id: string;
  key: string;
  label: string;
  limitType: LimitType;
  value: number | null;
  unit: string | null;
  sortOrder: number;
};

export type SoftwarePlan = {
  id: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  setupFeeCents: number | null;
  trialDays: number | null;
  status: PlanStatus;
  isDefault: boolean;
  displayOrder: number;
  limits: PlanLimit[];
  /** How many clients are on this plan right now. */
  clientCount: number;
  /** What those clients actually pay, which may differ from the list price. */
  actualMrrCents: number | null;
};

export type SoftwareFeature = {
  id: string;
  name: string;
  category: FeatureCategory;
  description: string | null;
  status: FeatureStatus;
  owner: string | null;
  introducedVersion: string | null;
  sortOrder: number;
  /** planId → inclusion. A MISSING ENTRY MEANS NOT INCLUDED. */
  byPlan: Record<string, { inclusion: Inclusion; note: string | null }>;
};

export type SoftwareVersion = {
  id: string;
  version: string;
  channel: ReleaseChannel;
  status: VersionStatus;
  environment: string | null;
  releaseNotes: string | null;
  isBreaking: boolean;
  isCurrentProduction: boolean;
  isCurrentStaging: boolean;
  releasedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  /** Clients known to be running this version. */
  clientCount: number;
};

export type SoftwareClientRow = {
  id: string;
  customerId: string;
  name: string;
  planId: string | null;
  planName: string | null;
  status: ClientStatus;
  monthlyPriceCents: number | null;
  setupFeeCents: number | null;
  onboardingStatus: OnboardingStatus;
  onboardingDueAt: string | null;
  onboardingOverdue: boolean;
  version: string | null;
  clientServiceId: string | null;
  jobId: string | null;
  startDate: string;
  endDate: string | null;
  trialEndsOn: string | null;
  /** Collected from invoices attributed to this product AND this client. */
  lifetimeRevenueCents: number | null;
};

export type LinkedApp = {
  id: string;
  name: string;
  platformLabel: string;
  statusLabel: string;
  health: HealthState;
  healthLabel: string;
  currentVersion: string | null;
  isArchived: boolean;
};

export type SoftwareRelease = {
  id: string;
  name: string;
  status: string;
  targetDate: string | null;
  releasedAt: string | null;
  owner: string | null;
  versionLabel: string | null;
  blockedReason: string | null;
  releaseNotes: string | null;
};

export type SoftwareDetail = {
  id: string;
  name: string;
  internalName: string | null;
  slug: string;
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

  billingModel: BillingModel;
  defaultMonthlyPriceCents: number | null;
  setupFeeCents: number | null;
  trialAvailable: boolean;
  trialDays: number | null;
  currency: string;
  releaseChannel: ReleaseChannel;

  defaultServiceId: string | null;
  defaultServiceName: string | null;
  defaultTaskTemplateId: string | null;
  defaultTaskTemplateName: string | null;
  defaultIntakeKey: string | null;
  websiteId: string | null;

  launchDate: string | null;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;

  plans: SoftwarePlan[];
  features: SoftwareFeature[];
  versions: SoftwareVersion[];
  clients: SoftwareClientRow[];
  apps: LinkedApp[];
  releases: SoftwareRelease[];

  kpis: {
    activeClients: number;
    mrrCents: number | null;
    currentVersion: string | null;
    stagingVersion: string | null;
    openIssues: number;
    criticalIssues: number;
    nextRelease: { id: string; name: string; targetDate: string | null; status: string } | null;
    lifetimeRevenueCents: number | null;
    setupRevenueCents: number | null;
  };

  recentActivity: {
    id: string;
    kind: string;
    body: string;
    actor: string | null;
    createdAt: string;
  }[];
};

type CustomerLite = { id: string; name: string | null; business_name: string | null };

export async function loadSoftwareDetail(
  sb: SupabaseClient,
  id: string
): Promise<SoftwareDetail | null> {
  const checkWindow = new Date(Date.now() - 3 * DAY).toISOString();

  type ProductRaw = {
    id: string; name: string; internal_name: string | null; slug: string;
    description: string | null; logo_url: string | null;
    product_type: ProductType; industry: string | null; status: LifecycleStatus;
    owner: string | null; technical_owner: string | null; sales_owner: string | null;
    billing_model: BillingModel; default_monthly_price_cents: number | null;
    setup_fee_cents: number | null; trial_available: boolean; trial_days: number | null;
    currency: string; release_channel: ReleaseChannel;
    default_service_id: string | null; default_task_template_id: string | null;
    default_intake_key: string | null; website_id: string | null;
    launch_date: string | null; notes: string | null;
    is_archived: boolean; created_at: string; updated_at: string;
    catalog_items: { id: string; name: string } | { id: string; name: string }[] | null;
    task_templates: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const product = await sb
    .from("software_products")
    .select(
      "id, name, internal_name, slug, description, logo_url, product_type, industry, status, owner, technical_owner, sales_owner, billing_model, default_monthly_price_cents, setup_fee_cents, trial_available, trial_days, currency, release_channel, default_service_id, default_task_template_id, default_intake_key, website_id, launch_date, notes, is_archived, created_at, updated_at, catalog_items(id, name), task_templates(id, name)"
    )
    .eq("id", id)
    .maybeSingle()
    .then((r) => {
      if (r.error) throw new Error(`software product: ${r.error.message}`);
      return r.data as ProductRaw | null;
    });

  if (!product) return null;

  type PlanRaw = {
    id: string; name: string; description: string | null;
    monthly_price_cents: number | null; annual_price_cents: number | null;
    setup_fee_cents: number | null; trial_days: number | null;
    status: PlanStatus; is_default: boolean; display_order: number;
  };
  type LimitRaw = {
    id: string; plan_id: string; limit_key: string; label: string;
    limit_type: LimitType; limit_value: number | null; unit: string | null; sort_order: number;
  };
  type FeatureRaw = {
    id: string; name: string; category: FeatureCategory; description: string | null;
    status: FeatureStatus; owner: string | null; sort_order: number;
    introduced_version_id: string | null;
  };
  type PlanFeatureRaw = { plan_id: string; feature_id: string; inclusion: Inclusion; note: string | null };
  type VersionRaw = {
    id: string; version: string; channel: ReleaseChannel; status: VersionStatus;
    environment: string | null; release_notes: string | null; is_breaking: boolean;
    is_current_production: boolean; is_current_staging: boolean;
    released_at: string | null; created_by: string | null; created_at: string;
  };
  type ClientRaw = {
    id: string; customer_id: string; plan_id: string | null; status: ClientStatus;
    monthly_price_snapshot_cents: number | null; setup_fee_snapshot_cents: number | null;
    onboarding_status: OnboardingStatus; onboarding_due_at: string | null;
    current_version_id: string | null; client_service_id: string | null; job_id: string | null;
    start_date: string; end_date: string | null; trial_ends_on: string | null;
    customers: CustomerLite | CustomerLite[] | null;
  };
  type AppRaw = {
    id: string; name: string; platform_type: string; lifecycle_status: string;
    current_version: string | null; is_archived: boolean; billing_status: string;
  };
  type ReleaseRaw = {
    id: string; name: string; status: string; target_date: string | null;
    released_at: string | null; owner: string | null; blocked_reason: string | null;
    release_notes: string | null; version_id: string | null;
  };
  type InvoiceRaw = { customer_id: string | null; amount_paid_cents: number | null; status: string };
  type EventRaw = { id: string; kind: string; body: string; actor: string | null; created_at: string };
  type TaskRaw = { id: string; priority: string | null };

  const [plans, limits, features, planFeatures, versions, clients, apps, releases, invoices, events, tasks] =
    await Promise.all([
      sb.from("software_plans")
        .select("id, name, description, monthly_price_cents, annual_price_cents, setup_fee_cents, trial_days, status, is_default, display_order")
        .eq("software_id", id).order("display_order").order("name")
        .then((r) => unwrap<PlanRaw[]>(r, "plans")),
      sb.from("software_plan_limits")
        .select("id, plan_id, limit_key, label, limit_type, limit_value, unit, sort_order")
        .then((r) => unwrap<LimitRaw[]>(r, "plan limits")),
      sb.from("software_features")
        .select("id, name, category, description, status, owner, sort_order, introduced_version_id")
        .eq("software_id", id).order("sort_order").order("name")
        .then((r) => unwrap<FeatureRaw[]>(r, "features")),
      sb.from("software_plan_features")
        .select("plan_id, feature_id, inclusion, note")
        .then((r) => unwrap<PlanFeatureRaw[]>(r, "plan features")),
      sb.from("software_versions")
        .select("id, version, channel, status, environment, release_notes, is_breaking, is_current_production, is_current_staging, released_at, created_by, created_at")
        .eq("software_id", id)
        .then((r) => unwrap<VersionRaw[]>(r, "versions")),
      sb.from("software_clients")
        .select("id, customer_id, plan_id, status, monthly_price_snapshot_cents, setup_fee_snapshot_cents, onboarding_status, onboarding_due_at, current_version_id, client_service_id, job_id, start_date, end_date, trial_ends_on, customers(id, name, business_name)")
        .eq("software_id", id)
        .then((r) => unwrap<ClientRaw[]>(r, "clients")),
      sb.from("apps")
        .select("id, name, platform_type, lifecycle_status, current_version, is_archived, billing_status")
        .eq("software_id", id).order("name")
        .then((r) => unwrap<AppRaw[]>(r, "linked apps")),
      sb.from("software_releases")
        .select("id, name, status, target_date, released_at, owner, blocked_reason, release_notes, version_id")
        .eq("software_id", id).order("target_date", { ascending: true, nullsFirst: false })
        .then((r) => unwrap<ReleaseRaw[]>(r, "releases")),
      sb.from("invoices")
        .select("customer_id, amount_paid_cents, status")
        .eq("software_id", id)
        .then((r) => unwrap<InvoiceRaw[]>(r, "invoices")),
      sb.from("software_events")
        .select("id, kind, body, actor, created_at")
        .eq("software_id", id).order("created_at", { ascending: false }).limit(12)
        .then((r) => unwrap<EventRaw[]>(r, "events")),
      sb.from("tasks")
        .select("id, priority")
        .eq("software_id", id).eq("done", false)
        .not("status", "in", "(completed,canceled)")
        .then((r) => unwrap<TaskRaw[]>(r, "open issues")),
    ]);

  const now = Date.now();
  const planIds = new Set(plans.map((p) => p.id));
  const versionById = new Map(versions.map((v) => [v.id, v] as const));

  // ── App health, rolled up (same reduced input the board uses) ─────
  const liveApps = apps.filter((a) => !a.is_archived);
  const appIds = liveApps.map((a) => a.id);

  const [checks, incidents] = appIds.length
    ? await Promise.all([
        sb.from("app_health_checks")
          .select("app_id, check_type, status, message, response_time_ms, checked_at")
          .in("app_id", appIds).gte("checked_at", checkWindow)
          .then((r) => unwrap<{ app_id: string; check_type: string; status: string; message: string | null; response_time_ms: number | null; checked_at: string }[]>(r, "app checks")),
        sb.from("app_incidents")
          .select("app_id, severity, message, status, started_at")
          .in("app_id", appIds).neq("status", "resolved")
          .then((r) => unwrap<{ app_id: string; severity: string; message: string; status: string; started_at: string }[]>(r, "app incidents")),
      ])
    : [[], []];

  const appVerdicts = liveApps.map((app) => {
    const verdict = scoreApp({
      lifecycleStatus: app.lifecycle_status,
      isArchived: app.is_archived,
      checks: checks.filter((c) => c.app_id === app.id).map((c) => ({
        checkType: c.check_type as never,
        status: c.status as HealthState,
        message: c.message,
        responseTimeMs: c.response_time_ms,
        checkedAt: c.checked_at,
      })),
      incidents: incidents.filter((i) => i.app_id === app.id).map((i) => ({
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
      ?? verdict.reasons.find((r) => r.severity === "warning") ?? null;
    return { app, verdict, topReason: worst?.detail ?? null };
  });

  // ── Clients ──────────────────────────────────────────────────────
  const paidByCustomer = new Map<string, number>();
  let lifetimeTotal = 0;
  let lifetimeKnown = false;
  for (const invoice of invoices) {
    const paid = invoice.amount_paid_cents ?? 0;
    if (paid <= 0) continue;
    lifetimeTotal += paid;
    lifetimeKnown = true;
    if (invoice.customer_id) {
      paidByCustomer.set(invoice.customer_id, (paidByCustomer.get(invoice.customer_id) ?? 0) + paid);
    }
  }

  const planNameById = new Map(plans.map((p) => [p.id, p.name] as const));

  const clientRows: SoftwareClientRow[] = clients
    .map((c) => {
      const customer = one<CustomerLite>(c.customers);
      const overdue = Boolean(
        c.onboarding_status !== "complete" &&
        c.status !== "canceled" &&
        c.onboarding_due_at &&
        new Date(c.onboarding_due_at).getTime() < now
      );
      return {
        id: c.id,
        customerId: c.customer_id,
        name: customer?.business_name || customer?.name || "Client",
        planId: c.plan_id,
        planName: c.plan_id ? planNameById.get(c.plan_id) ?? null : null,
        status: c.status,
        monthlyPriceCents: c.monthly_price_snapshot_cents,
        setupFeeCents: c.setup_fee_snapshot_cents,
        onboardingStatus: c.onboarding_status,
        onboardingDueAt: c.onboarding_due_at,
        onboardingOverdue: overdue,
        version: c.current_version_id ? versionById.get(c.current_version_id)?.version ?? null : null,
        clientServiceId: c.client_service_id,
        jobId: c.job_id,
        startDate: c.start_date,
        endDate: c.end_date,
        trialEndsOn: c.trial_ends_on,
        lifetimeRevenueCents: paidByCustomer.get(c.customer_id) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const liveClients = clientRows.filter((c) => c.status !== "canceled");
  const billing = clientRows.filter((c) => (BILLABLE_CLIENT_STATUS as string[]).includes(c.status));

  let mrr = 0;
  let mrrKnown = false;
  for (const c of billing) {
    if (c.monthlyPriceCents === null) continue;
    mrr += c.monthlyPriceCents;
    mrrKnown = true;
  }

  let setup = 0;
  let setupKnown = false;
  for (const c of liveClients) {
    if (c.setupFeeCents === null) continue;
    setup += c.setupFeeCents;
    setupKnown = true;
  }

  // ── Plans, with what is actually paid on each ────────────────────
  const limitsByPlan = new Map<string, LimitRaw[]>();
  for (const limit of limits) {
    if (!planIds.has(limit.plan_id)) continue;
    const held = limitsByPlan.get(limit.plan_id);
    if (held) held.push(limit);
    else limitsByPlan.set(limit.plan_id, [limit]);
  }

  const planRows: SoftwarePlan[] = plans.map((plan) => {
    const on = clientRows.filter((c) => c.planId === plan.id && c.status !== "canceled");
    const paying = on.filter(
      (c) => (BILLABLE_CLIENT_STATUS as string[]).includes(c.status) && c.monthlyPriceCents !== null
    );
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      monthlyPriceCents: plan.monthly_price_cents,
      annualPriceCents: plan.annual_price_cents,
      setupFeeCents: plan.setup_fee_cents,
      trialDays: plan.trial_days,
      status: plan.status,
      isDefault: plan.is_default,
      displayOrder: plan.display_order,
      limits: (limitsByPlan.get(plan.id) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
        .map((l) => ({
          id: l.id,
          key: l.limit_key,
          label: l.label,
          limitType: l.limit_type,
          value: l.limit_value,
          unit: l.unit,
          sortOrder: l.sort_order,
        })),
      clientCount: on.length,
      actualMrrCents: paying.length
        ? paying.reduce((sum, c) => sum + (c.monthlyPriceCents ?? 0), 0)
        : null,
    };
  });

  // ── Feature matrix ───────────────────────────────────────────────
  // A MISSING plan_feature row means NOT INCLUDED. Nothing here invents a
  // default of "included", so adding a feature never silently grants it to
  // every plan.
  const featureRows: SoftwareFeature[] = features.map((feature) => {
    const byPlan: SoftwareFeature["byPlan"] = {};
    for (const link of planFeatures) {
      if (link.feature_id !== feature.id || !planIds.has(link.plan_id)) continue;
      byPlan[link.plan_id] = { inclusion: link.inclusion, note: link.note };
    }
    return {
      id: feature.id,
      name: feature.name,
      category: feature.category,
      description: feature.description,
      status: feature.status,
      owner: feature.owner,
      introducedVersion: feature.introduced_version_id
        ? versionById.get(feature.introduced_version_id)?.version ?? null
        : null,
      sortOrder: feature.sort_order,
      byPlan,
    };
  });

  // ── Versions ─────────────────────────────────────────────────────
  const clientsOnVersion = new Map<string, number>();
  for (const c of clients) {
    if (!c.current_version_id || c.status === "canceled") continue;
    clientsOnVersion.set(c.current_version_id, (clientsOnVersion.get(c.current_version_id) ?? 0) + 1);
  }

  const versionRows: SoftwareVersion[] = versions
    .map((v) => ({
      id: v.id,
      version: v.version,
      channel: v.channel,
      status: v.status,
      environment: v.environment,
      releaseNotes: v.release_notes,
      isBreaking: v.is_breaking,
      isCurrentProduction: v.is_current_production,
      isCurrentStaging: v.is_current_staging,
      releasedAt: v.released_at,
      createdBy: v.created_by,
      createdAt: v.created_at,
      clientCount: clientsOnVersion.get(v.id) ?? 0,
    }))
    // Newest first, and "newest" means version order, not insert order —
    // v2.10.1 is after v2.9.0 even though it sorts before it as a string.
    .sort((a, b) => versionSortKey(b.version).localeCompare(versionSortKey(a.version)));

  const production = versionRows.find((v) => v.isCurrentProduction) ?? null;
  const staging = versionRows.find((v) => v.isCurrentStaging) ?? null;

  // ── Releases ─────────────────────────────────────────────────────
  const releaseRows: SoftwareRelease[] = releases.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    targetDate: r.target_date,
    releasedAt: r.released_at,
    owner: r.owner,
    versionLabel: r.version_id ? versionById.get(r.version_id)?.version ?? null : null,
    blockedReason: r.blocked_reason,
    releaseNotes: r.release_notes,
  }));

  const upcoming = releaseRows.filter((r) => r.status !== "released" && r.status !== "canceled");
  const dated = upcoming.filter((r) => r.targetDate).sort((a, b) => a.targetDate!.localeCompare(b.targetDate!));
  const nextRelease = dated[0] ?? upcoming[0] ?? null;

  const criticalIssues = tasks.filter((t) => t.priority === "critical").length;

  // ── Health ───────────────────────────────────────────────────────
  const health = scoreSoftware({
    lifecycleStatus: product.status,
    isArchived: product.is_archived,
    apps: appVerdicts.map(({ app, verdict, topReason }) => ({
      id: app.id,
      name: app.name,
      state: verdict.state,
      observed: verdict.observed,
      isProduction: app.lifecycle_status === "live",
      topReason,
    })),
    blockedReleases: upcoming
      .filter((r) => r.status === "blocked")
      .map((r) => ({ name: r.name, reason: r.blockedReason })),
    overdueReleases: upcoming
      .filter((r) => r.status !== "blocked" && r.targetDate && new Date(r.targetDate).getTime() < now)
      .map((r) => ({
        name: r.name,
        targetDate: r.targetDate!,
        daysLate: Math.max(1, Math.round((now - new Date(r.targetDate!).getTime()) / DAY)),
      })),
    overdueOnboarding: clientRows
      .filter((c) => c.onboardingOverdue)
      .map((c) => ({
        client: c.name,
        daysLate: Math.max(1, Math.round((now - new Date(c.onboardingDueAt!).getTime()) / DAY)),
      })),
    pastDueClients: clientRows.filter((c) => c.status === "past_due").map((c) => ({ client: c.name })),
    criticalIssues,
    totalClients: liveClients.length,
  });

  return {
    id: product.id,
    name: product.name,
    internalName: product.internal_name,
    slug: product.slug,
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
    billingModel: product.billing_model,
    defaultMonthlyPriceCents: product.default_monthly_price_cents,
    setupFeeCents: product.setup_fee_cents,
    trialAvailable: product.trial_available,
    trialDays: product.trial_days,
    currency: product.currency,
    releaseChannel: product.release_channel,
    defaultServiceId: product.default_service_id,
    defaultServiceName: one(product.catalog_items)?.name ?? null,
    defaultTaskTemplateId: product.default_task_template_id,
    defaultTaskTemplateName: one(product.task_templates)?.name ?? null,
    defaultIntakeKey: product.default_intake_key,
    websiteId: product.website_id,
    launchDate: product.launch_date,
    notes: product.notes,
    isArchived: product.is_archived,
    createdAt: product.created_at,
    updatedAt: product.updated_at,

    plans: planRows,
    features: featureRows,
    versions: versionRows,
    clients: clientRows,
    apps: appVerdicts.map(({ app, verdict }) => ({
      id: app.id,
      name: app.name,
      platformLabel: app.platform_type,
      statusLabel: app.lifecycle_status,
      health: verdict.state,
      healthLabel: verdict.label,
      currentVersion: app.current_version,
      isArchived: app.is_archived,
    })),
    releases: releaseRows,

    kpis: {
      activeClients: liveClients.filter((c) => c.status === "active" || c.status === "trial").length,
      mrrCents: mrrKnown ? mrr : null,
      currentVersion: production?.version ?? null,
      stagingVersion: staging?.version ?? null,
      openIssues: tasks.length,
      criticalIssues,
      nextRelease: nextRelease
        ? {
            id: nextRelease.id,
            name: nextRelease.name,
            targetDate: nextRelease.targetDate,
            status: nextRelease.status,
          }
        : null,
      lifetimeRevenueCents: lifetimeKnown ? lifetimeTotal : null,
      setupRevenueCents: setupKnown ? setup : null,
    },

    recentActivity: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      body: e.body,
      actor: e.actor,
      createdAt: e.created_at,
    })),
  };
}

/**
 * The choices every Software form needs, in one query round.
 *
 * Deliberately shared between New Software Product, Add Client and the
 * settings tab so a dropdown can never offer a different set of clients
 * depending on which screen it was opened from.
 */
export type SoftwareChoices = {
  clients: { id: string; name: string }[];
  services: { id: string; name: string }[];
  taskTemplates: { id: string; name: string }[];
  websites: { id: string; name: string }[];
  people: string[];
  /** Apps not yet claimed by any product, offered for linking. */
  unlinkedApps: { id: string; name: string }[];
  projects: { id: string; title: string }[];
};

export async function loadSoftwareChoices(sb: SupabaseClient): Promise<SoftwareChoices> {
  const [customers, services, templates, websites, admins, apps, jobs] = await Promise.all([
    sb.from("customers").select("id, name, business_name, status")
      .neq("status", "churned").order("business_name", { nullsFirst: false })
      .then((r) => unwrap<{ id: string; name: string | null; business_name: string | null }[]>(r, "customers")),
    sb.from("catalog_items").select("id, name, active").eq("active", true).order("name")
      .then((r) => unwrap<{ id: string; name: string }[]>(r, "services")),
    sb.from("task_templates").select("id, name, active").eq("active", true).order("name")
      .then((r) => unwrap<{ id: string; name: string }[]>(r, "task templates")),
    sb.from("websites").select("id, domain, name").order("domain")
      .then((r) => unwrap<{ id: string; domain: string; name: string | null }[]>(r, "websites")),
    sb.from("admin_users").select("email, full_name").order("email")
      .then((r) => unwrap<{ email: string; full_name: string | null }[]>(r, "people")),
    sb.from("apps").select("id, name, software_id, is_archived")
      .is("software_id", null).eq("is_archived", false).order("name")
      .then((r) => unwrap<{ id: string; name: string }[]>(r, "unlinked apps")),
    sb.from("jobs").select("id, title, completed_at").is("completed_at", null).order("title")
      .then((r) => unwrap<{ id: string; title: string }[]>(r, "projects")),
  ]);

  return {
    clients: customers
      .map((c) => ({ id: c.id, name: c.business_name || c.name || "Client" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    services,
    taskTemplates: templates,
    websites: websites.map((w) => ({ id: w.id, name: w.name || w.domain })),
    people: admins.map((a) => a.email),
    unlinkedApps: apps,
    projects: jobs,
  };
}
