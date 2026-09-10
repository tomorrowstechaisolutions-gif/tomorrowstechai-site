import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { scoreApp, type AppHealth } from "./health";
import {
  ENVIRONMENT_LABELS,
  INTEGRATION_LABELS,
  LIFECYCLE_LABELS,
  OWNERSHIP_LABELS,
  PLATFORM_LABELS,
  repoSlug,
  safeUrl,
  type BillingStatus,
  type BillingType,
  type EnvironmentType,
  type HealthState,
  type IntegrationProvider,
  type IntegrationStatus,
  type LifecycleStatus,
  type OwnershipType,
  type PlatformType,
} from "./types";

/**
 * One app, everything about it.
 *
 * Split into a core loader plus one loader per tab, for the same reason the
 * dashboard splits into panels: opening Overview should not pay for the
 * deployment history, and a failure loading the revenue tab must not blank
 * the header. Each tab loader is called only by the tab that needs it.
 *
 * No provider APIs are called from here either. Everything below reads this
 * database. Live provider reads happen in the sync and check jobs, which
 * write their results into these tables — so the screen is always fast and
 * always able to say when it last learned anything.
 */

const DAY = 86_400_000;

export type AppEnvironment = {
  id: string;
  name: string;
  type: EnvironmentType;
  typeLabel: string;
  isProduction: boolean;
  url: string | null;
  apiBaseUrl: string | null;
  branch: string | null;
  hostingProvider: string | null;
  hostingProjectId: string | null;
  hostingTeamId: string | null;
  databaseProvider: string | null;
  databaseProjectId: string | null;
  databaseRegion: string | null;
  currentVersion: string | null;
  healthStatus: HealthState;
  lastCheckedAt: string | null;
  lastDeployedAt: string | null;
};

export type AppIntegration = {
  id: string;
  provider: IntegrationProvider;
  providerLabel: string;
  label: string | null;
  status: IntegrationStatus;
  environment: string;
  accountRef: string | null;
  owner: string | null;
  lastCheckedAt: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
};

export type AppDomain = {
  id: string;
  domain: string;
  environment: string;
  environmentId: string | null;
  provider: string | null;
  isPrimary: boolean;
  redirectTo: string | null;
  sslStatus: string;
  sslExpiresAt: string | null;
  verified: boolean | null;
  verificationNote: string | null;
  expiresAt: string | null;
  lastCheckedAt: string | null;
  websiteId: string | null;
};

export type AppDeployment = {
  id: string;
  provider: string;
  externalId: string | null;
  environment: string;
  status: string;
  version: string | null;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitUrl: string | null;
  deploymentUrl: string | null;
  logsUrl: string | null;
  triggeredBy: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
};

export type AppIncident = {
  id: string;
  severity: string;
  incidentType: string;
  message: string;
  detail: string | null;
  status: string;
  startedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  durationMs: number | null;
};

export type AppDetail = {
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
  notes: string | null;

  repoProvider: string | null;
  repoUrl: string | null;
  repoSlug: string | null;
  repoExternalId: string | null;
  defaultBranch: string | null;
  productionBranch: string | null;

  setupFeeCents: number | null;
  monthlyFeeCents: number | null;
  billingType: BillingType;
  billingStatus: BillingStatus;
  subscriptionId: string | null;

  client: { id: string; name: string; status: string } | null;
  project: { id: string; title: string; stage: string; dueAt: string | null } | null;
  service: { id: string; name: string; billing: string; fromCents: number } | null;
  clientServiceId: string | null;

  isArchived: boolean;
  createdAt: string;
  updatedAt: string;

  environments: AppEnvironment[];
  production: AppEnvironment | null;
  staging: AppEnvironment | null;
  domains: AppDomain[];
  integrations: AppIntegration[];
  recentDeployments: AppDeployment[];
  lastProductionDeployment: AppDeployment | null;
  openIncidents: AppIncident[];

  health: AppHealth;

  openTasks: number;
  criticalTasks: number;

  productionUrl: string | null;
  stagingUrl: string | null;
};

type Embedded<T> = T | T[] | null;
const one = <T,>(v: Embedded<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function loadApp(sb: SupabaseClient, id: string): Promise<AppDetail | null> {
  const { data, error } = await sb
    .from("apps")
    .select(
      `id, name, slug, internal_name, description, logo_url, customer_id, job_id, service_id,
       client_service_id, ownership_type, platform_type, lifecycle_status, framework,
       current_version, technical_owner, business_owner, notes, repo_provider, repo_url,
       repo_external_id, default_branch, production_branch, setup_fee_cents, monthly_fee_cents,
       billing_type, billing_status, subscription_id, is_archived, created_at, updated_at,
       customers(id, name, business_name, status),
       jobs(id, title, stage, due_at),
       catalog_items(id, name, billing, from_cents)`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`app: ${error.message}`);
  if (!data) return null;

  const app = data as Record<string, unknown> & {
    customers: Embedded<{ id: string; name: string | null; business_name: string | null; status: string }>;
    jobs: Embedded<{ id: string; title: string; stage: string; due_at: string | null }>;
    catalog_items: Embedded<{ id: string; name: string; billing: string; from_cents: number }>;
  };

  const [environments, domains, integrations, deployments, incidents, checks, tasks] =
    await Promise.all([
      sb
        .from("app_environments")
        .select("*")
        .eq("app_id", id)
        .order("is_production", { ascending: false })
        .order("name")
        .then((r) => unwrap(r, "environments")),
      sb
        .from("app_domains")
        .select("*")
        .eq("app_id", id)
        .order("is_primary", { ascending: false })
        .order("domain")
        .then((r) => unwrap(r, "domains")),
      sb
        .from("app_integrations")
        .select("*")
        .eq("app_id", id)
        .order("provider")
        .then((r) => unwrap(r, "integrations")),
      sb
        .from("app_deployments")
        .select("*")
        .eq("app_id", id)
        .order("started_at", { ascending: false })
        .limit(12)
        .then((r) => unwrap(r, "deployments")),
      sb
        .from("app_incidents")
        .select("*")
        .eq("app_id", id)
        .neq("status", "resolved")
        .order("started_at", { ascending: false })
        .then((r) => unwrap(r, "incidents")),
      sb
        .from("app_health_checks")
        .select("app_id, check_type, status, message, response_time_ms, checked_at")
        .eq("app_id", id)
        .gte("checked_at", new Date(Date.now() - 3 * DAY).toISOString())
        .order("checked_at", { ascending: false })
        .limit(200)
        .then((r) => unwrap(r, "health checks")),
      sb
        .from("tasks")
        .select("id, priority")
        .eq("app_id", id)
        .eq("done", false)
        .not("status", "in", "(completed,canceled)")
        .then((r) => unwrap(r, "tasks")),
    ]);

  const envs: AppEnvironment[] = (environments as Record<string, never>[]).map(mapEnvironment);
  const domainRows: AppDomain[] = (domains as Record<string, never>[]).map(mapDomain);
  const integrationRows: AppIntegration[] = (integrations as Record<string, never>[]).map(mapIntegration);
  const deploymentRows: AppDeployment[] = (deployments as Record<string, never>[]).map(mapDeployment);
  const incidentRows: AppIncident[] = (incidents as Record<string, never>[]).map(mapIncident);

  const production = envs.find((e) => e.isProduction) ?? envs.find((e) => e.type === "production") ?? null;
  const staging = envs.find((e) => e.type === "staging") ?? null;
  const lastProduction = deploymentRows.find((d) => d.environment === "production") ?? null;
  const primaryDomain =
    domainRows.find((d) => d.isPrimary && d.environment === "production") ??
    domainRows.find((d) => d.environment === "production") ??
    null;

  const now = Date.now();
  const health = scoreApp({
    lifecycleStatus: app.lifecycle_status as string,
    isArchived: app.is_archived as boolean,
    checks: (checks as { check_type: string; status: string; message: string | null; response_time_ms: number | null; checked_at: string }[]).map(
      (c) => ({
        checkType: c.check_type as never,
        status: c.status as HealthState,
        message: c.message,
        responseTimeMs: c.response_time_ms,
        checkedAt: c.checked_at,
      })
    ),
    incidents: incidentRows.map((i) => ({
      severity: i.severity as never,
      message: i.message,
      status: i.status,
      startedAt: i.startedAt,
    })),
    integrations: integrationRows.map((i) => ({
      provider: i.provider,
      status: i.status,
      error: i.error,
      label: i.label || i.providerLabel,
    })),
    lastProductionDeployment: lastProduction
      ? { status: lastProduction.status, at: lastProduction.startedAt }
      : null,
    domains: domainRows.map((d) => ({
      domain: d.domain,
      sslStatus: d.sslStatus,
      environment: d.environment,
      expiresInDays: d.sslExpiresAt
        ? Math.round((new Date(d.sslExpiresAt).getTime() - now) / DAY)
        : null,
    })),
    billingStatus: app.billing_status as string,
    now,
  });

  const customer = one(app.customers);
  const job = one(app.jobs);
  const service = one(app.catalog_items);
  const openTasks = tasks as { id: string; priority: string }[];

  return {
    id: app.id as string,
    name: app.name as string,
    slug: app.slug as string,
    internalName: (app.internal_name as string | null) ?? null,
    description: (app.description as string | null) ?? null,
    logoUrl: safeUrl(app.logo_url as string | null),
    ownership: app.ownership_type as OwnershipType,
    ownershipLabel: OWNERSHIP_LABELS[app.ownership_type as OwnershipType],
    platform: app.platform_type as PlatformType,
    platformLabel: PLATFORM_LABELS[app.platform_type as PlatformType],
    status: app.lifecycle_status as LifecycleStatus,
    statusLabel: LIFECYCLE_LABELS[app.lifecycle_status as LifecycleStatus],
    framework: (app.framework as string | null) ?? null,
    currentVersion: (app.current_version as string | null) ?? null,
    technicalOwner: (app.technical_owner as string | null) ?? null,
    businessOwner: (app.business_owner as string | null) ?? null,
    notes: (app.notes as string | null) ?? null,
    repoProvider: (app.repo_provider as string | null) ?? null,
    repoUrl: safeUrl(app.repo_url as string | null),
    repoSlug: repoSlug(app.repo_url as string | null),
    repoExternalId: (app.repo_external_id as string | null) ?? null,
    defaultBranch: (app.default_branch as string | null) ?? null,
    productionBranch: (app.production_branch as string | null) ?? null,
    setupFeeCents: (app.setup_fee_cents as number | null) ?? null,
    monthlyFeeCents: (app.monthly_fee_cents as number | null) ?? null,
    billingType: app.billing_type as BillingType,
    billingStatus: app.billing_status as BillingStatus,
    subscriptionId: (app.subscription_id as string | null) ?? null,
    client: customer
      ? {
          id: customer.id,
          name: customer.business_name || customer.name || "Client",
          status: customer.status,
        }
      : null,
    project: job ? { id: job.id, title: job.title, stage: job.stage, dueAt: job.due_at } : null,
    service: service
      ? { id: service.id, name: service.name, billing: service.billing, fromCents: service.from_cents }
      : null,
    clientServiceId: (app.client_service_id as string | null) ?? null,
    isArchived: app.is_archived as boolean,
    createdAt: app.created_at as string,
    updatedAt: app.updated_at as string,
    environments: envs,
    production,
    staging,
    domains: domainRows,
    integrations: integrationRows,
    recentDeployments: deploymentRows,
    lastProductionDeployment: lastProduction,
    openIncidents: incidentRows,
    health,
    openTasks: openTasks.length,
    criticalTasks: openTasks.filter((t) => t.priority === "critical").length,
    productionUrl:
      production?.url ?? (primaryDomain ? `https://${primaryDomain.domain}` : null),
    stagingUrl: staging?.url ?? null,
  };
}

/* ── Tab loaders ───────────────────────────────────────────────────── */

export async function loadDeployments(
  sb: SupabaseClient,
  appId: string,
  page = 1,
  perPage = 25
): Promise<{ rows: AppDeployment[]; total: number }> {
  const from = (page - 1) * perPage;
  const { data, error, count } = await sb
    .from("app_deployments")
    .select("*", { count: "exact" })
    .eq("app_id", appId)
    .order("started_at", { ascending: false })
    .range(from, from + perPage - 1);
  if (error) throw new Error(`deployments: ${error.message}`);
  return { rows: (data ?? []).map(mapDeployment), total: count ?? 0 };
}

export async function loadHealthHistory(
  sb: SupabaseClient,
  appId: string
): Promise<{
  incidents: AppIncident[];
  checks: {
    id: string;
    checkType: string;
    target: string | null;
    status: string;
    message: string | null;
    responseTimeMs: number | null;
    checkedAt: string;
  }[];
}> {
  const [incidents, checks] = await Promise.all([
    sb
      .from("app_incidents")
      .select("*")
      .eq("app_id", appId)
      .order("started_at", { ascending: false })
      .limit(40)
      .then((r) => unwrap(r, "incident history")),
    sb
      .from("app_health_checks")
      .select("id, check_type, target, status, message, response_time_ms, checked_at")
      .eq("app_id", appId)
      .order("checked_at", { ascending: false })
      .limit(40)
      .then((r) => unwrap(r, "check history")),
  ]);

  return {
    incidents: (incidents as Record<string, never>[]).map(mapIncident),
    checks: (checks as {
      id: string; check_type: string; target: string | null; status: string;
      message: string | null; response_time_ms: number | null; checked_at: string;
    }[]).map((c) => ({
      id: c.id,
      checkType: c.check_type,
      target: c.target,
      status: c.status,
      message: c.message,
      responseTimeMs: c.response_time_ms,
      checkedAt: c.checked_at,
    })),
  };
}

export type AppRevenue = {
  /** Monthly recurring, and the basis it was derived from. */
  mrrCents: number | null;
  mrrBasis: "client_service" | "contract" | null;
  setupCents: number | null;
  /** Everything actually collected against the linked invoices. */
  lifetimeCents: number;
  outstandingCents: number;
  /** How the invoices below were found — an explicit link, or a fallback. */
  basis: "linked" | "client_and_service" | "client" | "none";
  clientService: {
    id: string;
    status: string;
    salePriceCents: number;
    billingType: string;
    intervalMonths: number;
    nextBillingDate: string | null;
    subscriptionId: string | null;
  } | null;
  invoices: {
    id: string;
    number: string | null;
    title: string | null;
    status: string;
    totalCents: number;
    recurringCents: number;
    paidCents: number;
    issueDate: string | null;
    paidAt: string | null;
    linked: boolean;
  }[];
  payments: {
    id: string;
    invoiceId: string;
    amountCents: number;
    method: string | null;
    reference: string | null;
    paidOn: string | null;
  }[];
};

/**
 * Revenue for one app, read entirely out of the existing billing system.
 *
 * No separate billing engine, no stored totals. There are three ways an
 * invoice can belong to an app and the screen says which one it used:
 *   linked              — invoices.app_id points here. Unambiguous.
 *   client_and_service  — same client, and a line item for this app's
 *                         service. Good, but a guess.
 *   client              — same client only. Shown, clearly labelled as the
 *                         client's invoices rather than the app's.
 */
export async function loadAppRevenue(
  sb: SupabaseClient,
  app: Pick<AppDetail, "id" | "client" | "service" | "clientServiceId" | "monthlyFeeCents" | "setupFeeCents" | "billingType" | "billingStatus">
): Promise<AppRevenue> {
  const [linkedInvoices, clientService] = await Promise.all([
    sb
      .from("invoices")
      .select(
        "id, invoice_number, title, status, total_cents, recurring_cents, amount_paid_cents, issue_date, paid_at, customer_id, invoice_items(service_id)"
      )
      .eq("app_id", app.id)
      .order("issue_date", { ascending: false })
      .limit(50)
      .then((r) => unwrap(r, "app invoices")),
    app.clientServiceId
      ? sb
          .from("client_services")
          .select("id, status, sale_price_cents, billing_type, interval_months, next_billing_date, subscription_id")
          .eq("id", app.clientServiceId)
          .maybeSingle()
          .then((r) => (r.error ? null : r.data))
      : Promise.resolve(null),
  ]);

  type InvoiceRaw = {
    id: string;
    invoice_number: string | null;
    title: string | null;
    status: string;
    total_cents: number | null;
    recurring_cents: number | null;
    amount_paid_cents: number | null;
    issue_date: string | null;
    paid_at: string | null;
    customer_id: string | null;
    invoice_items: { service_id: string | null }[] | null;
  };

  let rows = linkedInvoices as InvoiceRaw[];
  let basis: AppRevenue["basis"] = rows.length > 0 ? "linked" : "none";
  let linkedIds = new Set(rows.map((r) => r.id));

  // Nothing explicitly linked — fall back to the client, narrowing by the
  // service when this app was sold as one.
  if (rows.length === 0 && app.client) {
    const fallback = (await sb
      .from("invoices")
      .select(
        "id, invoice_number, title, status, total_cents, recurring_cents, amount_paid_cents, issue_date, paid_at, customer_id, invoice_items(service_id)"
      )
      .eq("customer_id", app.client.id)
      .order("issue_date", { ascending: false })
      .limit(50)
      .then((r) => unwrap(r, "client invoices"))) as InvoiceRaw[];

    if (app.service) {
      const matching = fallback.filter((i) =>
        (i.invoice_items ?? []).some((item) => item.service_id === app.service!.id)
      );
      if (matching.length > 0) {
        rows = matching;
        basis = "client_and_service";
      } else {
        rows = fallback;
        basis = "client";
      }
    } else {
      rows = fallback;
      basis = fallback.length > 0 ? "client" : "none";
    }
    linkedIds = new Set();
  }

  const payments = rows.length
    ? ((await sb
        .from("invoice_payments")
        .select("id, invoice_id, amount_cents, method, reference, paid_on")
        .in("invoice_id", rows.map((r) => r.id))
        .order("paid_on", { ascending: false })
        .limit(50)
        .then((r) => unwrap(r, "payments"))) as {
        id: string; invoice_id: string; amount_cents: number;
        method: string | null; reference: string | null; paid_on: string | null;
      }[])
    : [];

  const invoices = rows.map((i) => ({
    id: i.id,
    number: i.invoice_number,
    title: i.title,
    status: i.status,
    totalCents: i.total_cents ?? 0,
    recurringCents: i.recurring_cents ?? 0,
    paidCents: i.amount_paid_cents ?? 0,
    issueDate: i.issue_date,
    paidAt: i.paid_at,
    linked: linkedIds.has(i.id),
  }));

  const lifetimeCents = invoices.reduce((total, i) => total + i.paidCents, 0);
  const outstandingCents = invoices
    .filter((i) => !["void", "draft", "refunded"].includes(i.status))
    .reduce((total, i) => total + Math.max(0, i.totalCents - i.paidCents), 0);

  const service = clientService as AppRevenue["clientService"];

  let mrrCents: number | null = null;
  let mrrBasis: AppRevenue["mrrBasis"] = null;
  if (service && service.status === "active" && service.billingType === "recurring") {
    mrrCents = Math.round(service.salePriceCents / Math.max(1, service.intervalMonths));
    mrrBasis = "client_service";
  } else if (
    app.billingType === "recurring" &&
    app.billingStatus === "active" &&
    (app.monthlyFeeCents ?? 0) > 0
  ) {
    mrrCents = app.monthlyFeeCents;
    mrrBasis = "contract";
  }

  return {
    mrrCents,
    mrrBasis,
    setupCents: app.setupFeeCents,
    lifetimeCents,
    outstandingCents,
    basis,
    clientService: service,
    invoices,
    payments: payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoice_id,
      amountCents: p.amount_cents,
      method: p.method,
      reference: p.reference,
      paidOn: p.paid_on,
    })),
  };
}

export type AppTask = {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  owner: string | null;
  dueAt: string | null;
  done: boolean;
  jobId: string | null;
  customerId: string | null;
};

export async function loadAppTasks(sb: SupabaseClient, appId: string): Promise<AppTask[]> {
  const rows = await sb
    .from("tasks")
    .select("id, title, type, priority, status, owner, due_at, done, job_id, customer_id")
    .eq("app_id", appId)
    .eq("is_template", false)
    .order("done", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100)
    .then((r) => unwrap(r, "app tasks"));

  type TaskRaw = {
    id: string; title: string; type: string; priority: string; status: string;
    owner: string | null; due_at: string | null; done: boolean;
    job_id: string | null; customer_id: string | null;
  };

  return (rows as TaskRaw[]).map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    priority: t.priority,
    status: t.status,
    owner: t.owner,
    dueAt: t.due_at,
    done: t.done,
    jobId: t.job_id,
    customerId: t.customer_id,
  }));
}

export type AppActivityItem = {
  id: string;
  kind: string;
  body: string;
  actor: string | null;
  at: string;
};

/**
 * The app's timeline.
 *
 * app_events is the audit trail this module writes. Deployments and
 * incidents are folded in from their own tables rather than duplicated into
 * events, so the timeline cannot disagree with the tab that lists them.
 */
export async function loadAppActivity(
  sb: SupabaseClient,
  appId: string,
  limit = 40
): Promise<AppActivityItem[]> {
  const [events, deployments, incidents] = await Promise.all([
    sb
      .from("app_events")
      .select("id, kind, body, actor, created_at")
      .eq("app_id", appId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .then((r) => unwrap(r, "app events")),
    sb
      .from("app_deployments")
      .select("id, environment, status, branch, started_at, triggered_by")
      .eq("app_id", appId)
      .order("started_at", { ascending: false })
      .limit(limit)
      .then((r) => unwrap(r, "deployment events")),
    sb
      .from("app_incidents")
      .select("id, severity, message, status, started_at, resolved_at, resolved_by")
      .eq("app_id", appId)
      .order("started_at", { ascending: false })
      .limit(limit)
      .then((r) => unwrap(r, "incident events")),
  ]);

  const items: AppActivityItem[] = [];

  for (const e of events as { id: string; kind: string; body: string; actor: string | null; created_at: string }[]) {
    items.push({ id: `ev:${e.id}`, kind: e.kind, body: e.body, actor: e.actor, at: e.created_at });
  }

  for (const d of deployments as {
    id: string; environment: string; status: string; branch: string | null;
    started_at: string; triggered_by: string | null;
  }[]) {
    items.push({
      id: `dp:${d.id}`,
      kind: "deployment",
      body: `${titleCase(d.environment)} deployment ${d.status}${d.branch ? ` on ${d.branch}` : ""}`,
      actor: d.triggered_by,
      at: d.started_at,
    });
  }

  for (const i of incidents as {
    id: string; severity: string; message: string; status: string;
    started_at: string; resolved_at: string | null; resolved_by: string | null;
  }[]) {
    items.push({
      id: `in:${i.id}`,
      kind: "incident",
      body: `${titleCase(i.severity)} incident opened — ${i.message}`,
      actor: null,
      at: i.started_at,
    });
    if (i.resolved_at) {
      items.push({
        id: `in:${i.id}:resolved`,
        kind: "incident",
        body: `Incident resolved — ${i.message}`,
        actor: i.resolved_by,
        at: i.resolved_at,
      });
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/**
 * Everything the Settings tab needs to fill its selects, in one call.
 */
export async function loadAppChoices(sb: SupabaseClient): Promise<{
  clients: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  services: { id: string; name: string }[];
  people: { email: string; name: string }[];
}> {
  const [clients, projects, services, people] = await Promise.all([
    sb.from("customers").select("id, name, business_name").order("business_name").limit(500)
      .then((r) => unwrap(r, "clients")),
    sb.from("jobs").select("id, title").is("completed_at", null).order("title").limit(500)
      .then((r) => unwrap(r, "projects")),
    sb.from("catalog_items").select("id, name").eq("active", true).order("name").limit(500)
      .then((r) => unwrap(r, "services")),
    sb.from("admin_users").select("email, full_name").order("full_name")
      .then((r) => unwrap(r, "people")),
  ]);

  return {
    clients: (clients as { id: string; name: string | null; business_name: string | null }[]).map((c) => ({
      id: c.id,
      name: c.business_name || c.name || "Client",
    })),
    projects: projects as { id: string; title: string }[],
    services: services as { id: string; name: string }[],
    people: (people as { email: string; full_name: string | null }[]).map((p) => ({
      email: p.email,
      name: p.full_name || p.email,
    })),
  };
}

/* ── Row mappers ───────────────────────────────────────────────────── */

function mapEnvironment(row: Record<string, never>): AppEnvironment {
  const r = row as unknown as Record<string, string | boolean | null>;
  const type = (r.environment_type as EnvironmentType) ?? "development";
  return {
    id: r.id as string,
    name: r.name as string,
    type,
    typeLabel: ENVIRONMENT_LABELS[type] ?? String(type),
    isProduction: Boolean(r.is_production),
    url: safeUrl(r.url as string | null),
    apiBaseUrl: safeUrl(r.api_base_url as string | null),
    branch: (r.branch as string | null) ?? null,
    hostingProvider: (r.hosting_provider as string | null) ?? null,
    hostingProjectId: (r.hosting_project_id as string | null) ?? null,
    hostingTeamId: (r.hosting_team_id as string | null) ?? null,
    databaseProvider: (r.database_provider as string | null) ?? null,
    databaseProjectId: (r.database_project_id as string | null) ?? null,
    databaseRegion: (r.database_region as string | null) ?? null,
    currentVersion: (r.current_version as string | null) ?? null,
    healthStatus: (r.health_status as HealthState) ?? "unknown",
    lastCheckedAt: (r.last_checked_at as string | null) ?? null,
    lastDeployedAt: (r.last_deployed_at as string | null) ?? null,
  };
}

function mapDomain(row: Record<string, never>): AppDomain {
  const r = row as unknown as Record<string, string | boolean | null>;
  return {
    id: r.id as string,
    domain: r.domain as string,
    environment: (r.environment as string) ?? "production",
    environmentId: (r.environment_id as string | null) ?? null,
    provider: (r.provider as string | null) ?? null,
    isPrimary: Boolean(r.is_primary),
    redirectTo: (r.redirect_to as string | null) ?? null,
    sslStatus: (r.ssl_status as string) ?? "unknown",
    sslExpiresAt: (r.ssl_expires_at as string | null) ?? null,
    verified: r.verified === null || r.verified === undefined ? null : Boolean(r.verified),
    verificationNote: (r.verification_note as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    lastCheckedAt: (r.last_checked_at as string | null) ?? null,
    websiteId: (r.website_id as string | null) ?? null,
  };
}

function mapIntegration(row: Record<string, never>): AppIntegration {
  const r = row as unknown as Record<string, unknown>;
  const provider = r.provider as IntegrationProvider;
  return {
    id: r.id as string,
    provider,
    providerLabel: INTEGRATION_LABELS[provider] ?? String(provider),
    label: (r.label as string | null) ?? null,
    status: r.status as IntegrationStatus,
    environment: (r.environment as string) ?? "all",
    accountRef: (r.account_ref as string | null) ?? null,
    owner: (r.owner as string | null) ?? null,
    lastCheckedAt: (r.last_checked_at as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    // Descriptive facts only. Nothing writes a secret here, and the forms
    // that could are server actions with a fixed field list.
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  };
}

function mapDeployment(row: Record<string, never>): AppDeployment {
  const r = row as unknown as Record<string, string | number | null>;
  return {
    id: r.id as string,
    provider: (r.provider as string) ?? "vercel",
    externalId: (r.external_deployment_id as string | null) ?? null,
    environment: (r.environment as string) ?? "production",
    status: r.status as string,
    version: (r.version as string | null) ?? null,
    branch: (r.branch as string | null) ?? null,
    commitSha: (r.commit_sha as string | null) ?? null,
    commitMessage: (r.commit_message as string | null) ?? null,
    commitUrl: safeUrl(r.commit_url as string | null),
    deploymentUrl: safeUrl(r.deployment_url as string | null),
    logsUrl: safeUrl(r.logs_url as string | null),
    triggeredBy: (r.triggered_by as string | null) ?? null,
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
    durationMs: (r.duration_ms as number | null) ?? null,
  };
}

function mapIncident(row: Record<string, never>): AppIncident {
  const r = row as unknown as Record<string, string | null>;
  const started = r.started_at as string;
  const resolved = (r.resolved_at as string | null) ?? null;
  return {
    id: r.id as string,
    severity: (r.severity as string) ?? "medium",
    incidentType: (r.incident_type as string) ?? "other",
    message: r.message as string,
    detail: (r.detail as string | null) ?? null,
    status: (r.status as string) ?? "open",
    startedAt: started,
    resolvedAt: resolved,
    resolvedBy: (r.resolved_by as string | null) ?? null,
    durationMs: resolved ? new Date(resolved).getTime() - new Date(started).getTime() : null,
  };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
