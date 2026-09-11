import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { HEALTH_RANK, needsAttention, OBSERVATION_WINDOW_DAYS, scoreSolution, type AiHealth } from "./health";
import { loadProviders, type ProviderRow } from "./providers";
import {
  AGENT_TYPES,
  AUTOMATION_TYPES,
  CHATBOT_TYPES,
  HEALTH_LABELS,
  STATUS_LABELS,
  TARGET_LABELS,
  TYPE_LABELS,
  margin,
  safeUrl,
  WINDOW_DAYS,
  type DeploymentTarget,
  type HealthState,
  type SolutionStatus,
  type SolutionType,
  type Window,
} from "./types";

/**
 * Everything the AI Solutions screen shows, in one round of queries.
 *
 * Two rules from the brief run through this file:
 *
 * §42 — the page must not call a provider on load. Provider status here is
 * read from the row a check last wrote. A vendor outage can make the Test
 * button slow and nothing else.
 *
 * §2/§34 — no fabricated numbers. Cost is null unless a rate was set when
 * the call happened; margin is null unless both sides are known; health is
 * Unknown unless there were recent calls to judge. Every one of those
 * renders as a word, never as a zero.
 */

const DAY = 86_400_000;

export type SolutionRow = {
  id: string;
  name: string;
  slug: string;
  internalName: string | null;
  description: string | null;
  purpose: string | null;
  coverImageUrl: string | null;
  tags: string[];

  type: SolutionType;
  typeLabel: string;
  status: SolutionStatus;
  statusLabel: string;

  client: { id: string; name: string } | null;
  /** Distinct clients across this solution's deployments. */
  clientCount: number;
  deploymentCount: number;

  providerKey: string | null;
  providerName: string | null;
  model: string | null;

  target: DeploymentTarget;
  targetLabel: string;
  deploymentUrl: string | null;
  sourcePath: string | null;

  health: AiHealth;

  /** Window totals. Null means nothing measured it, never zero. */
  calls: number;
  conversations: number;
  totalTokens: number;
  costMicroUsd: number | null;
  /** True when some calls in the window had no rate to price them. */
  costPartial: boolean;
  avgLatencyMs: number | null;
  successRate: number | null;

  monthlyRevenueCents: number | null;
  revenueSource: "client_service" | "contract" | null;
  marginShare: number | null;

  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
};

export type AiFilters = {
  q?: string;
  tab: "all" | "chatbots" | "agents" | "automations" | "templates" | "archived";
  client?: string;
  type?: string;
  status?: string;
  provider?: string;
  health?: string;
  sort: "updated" | "revenue" | "cost" | "margin" | "usage" | "performance" | "name";
  view: "table" | "cards";
  window: Window;
};

export type AttentionItem = {
  id: string;
  solutionId: string;
  solutionName: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
};

export type ActivityItem = {
  id: string;
  at: string;
  event: string;
  solutionId: string | null;
  solutionName: string | null;
  clientName: string | null;
  actor: string | null;
};

export type UsageOverview = {
  window: Window;
  conversations: number;
  calls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number | null;
  costPartial: boolean;
  automationRuns: number;
  /** True when nothing at all has been recorded in the window. */
  empty: boolean;
};

export type TopPerformer = {
  id: string;
  name: string;
  clientName: string | null;
  status: SolutionStatus;
  statusLabel: string;
  conversations: number;
  leads: number | null;
  conversionRate: number | null;
  successfulRuns: number;
  successRate: number | null;
} | null;

export type AiBoard = {
  kpis: {
    activeSolutions: number;
    clientSystems: number;
    monthlyRevenueCents: number | null;
    monthlyCostMicroUsd: number | null;
    monthlyCostPartial: boolean;
    grossMargin: number | null;
    needingAttention: number;
  };
  tabCounts: Record<AiFilters["tab"], number>;
  rows: SolutionRow[];
  attention: AttentionItem[];
  activity: ActivityItem[];
  usage: UsageOverview;
  topPerformer: TopPerformer;
  providers: ProviderRow[];
  /** Calls and priced cost per provider over the last 30 days. */
  providerUsage: Record<string, { calls: number; costMicroUsd: number | null }>;
  clients: { id: string; name: string }[];
  healthBreakdown: { state: HealthState; label: string; count: number }[];
  /** No solutions at all — distinct from "nothing matches the filter". */
  empty: boolean;
  /** No provider has a working connection. Drives the second empty state. */
  noProviderConnected: boolean;
  templateCount: number;
};

type Embedded<T> = T | T[] | null;
const one = <T,>(v: Embedded<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type CustomerLite = { id: string; name: string | null; business_name: string | null };

type SolutionRaw = {
  id: string; name: string; slug: string; internal_name: string | null;
  description: string | null; purpose: string | null; tags: string[] | null;
  cover_image_url: string | null;
  solution_type: SolutionType; status: SolutionStatus;
  customer_id: string | null; service_id: string | null; client_service_id: string | null;
  app_id: string | null; website_id: string | null;
  provider_key: string | null; model: string | null;
  deployment_target: DeploymentTarget; deployment_url: string | null; source_path: string | null;
  monthly_price_cents: number | null; billing_type: string;
  error_rate_warning_pct: number | null; monthly_cost_warning_micro_usd: number | null;
  is_archived: boolean; created_at: string; updated_at: string;
  customers: Embedded<CustomerLite>;
};

type UsageRaw = {
  solution_id: string; conversation_id: string | null; event_type: string; provider_key: string | null;
  input_tokens: number | null; output_tokens: number | null; total_tokens: number;
  cost_micro_usd: number | null; latency_ms: number | null;
  status: string; occurred_at: string;
};

export async function loadAiBoard(sb: SupabaseClient, filters: AiFilters): Promise<AiBoard> {
  const windowDays = WINDOW_DAYS[filters.window];
  const windowFrom = new Date(Date.now() - windowDays * DAY).toISOString();
  // Health judges a fixed recent window regardless of what the usage panel
  // is showing, so switching the date selector cannot change a verdict.
  const healthFrom = new Date(Date.now() - OBSERVATION_WINDOW_DAYS * DAY).toISOString();
  const from = windowFrom < healthFrom ? windowFrom : healthFrom;

  const [
    solutions, usage, integrations, knowledge, alerts, deployments,
    clientServices, events, models, templates, providers,
  ] = await Promise.all([
    sb
      .from("ai_solutions")
      .select(
        `id, name, slug, internal_name, description, purpose, tags, solution_type, status,
         customer_id, service_id, client_service_id, app_id, website_id, cover_image_url,
         provider_key, model, deployment_target, deployment_url, source_path,
         monthly_price_cents, billing_type, error_rate_warning_pct,
         monthly_cost_warning_micro_usd, is_archived, created_at, updated_at,
         customers(id, name, business_name)`
      )
      .order("name")
      .then((r) => unwrap(r, "solutions")),
    sb
      .from("ai_usage_events")
      .select("solution_id, conversation_id, event_type, provider_key, input_tokens, output_tokens, total_tokens, cost_micro_usd, latency_ms, status, occurred_at")
      .gte("occurred_at", from)
      .order("occurred_at", { ascending: false })
      .limit(20000)
      .then((r) => unwrap(r, "usage")),
    sb.from("ai_integrations").select("solution_id, provider, label, status, is_required")
      .then((r) => unwrap(r, "integrations")),
    sb.from("ai_knowledge_sources").select("solution_id, name, status, last_synced_at, refresh_days")
      .then((r) => unwrap(r, "knowledge")),
    sb.from("ai_alerts").select("id, solution_id, severity, title, detail, status, created_at")
      .neq("status", "resolved").order("created_at", { ascending: false })
      .then((r) => unwrap(r, "alerts")),
    sb.from("ai_deployments").select("id, solution_id, customer_id, status")
      .then((r) => unwrap(r, "deployments")),
    sb.from("client_services").select("id, sale_price_cents, billing_type, interval_months, status")
      .eq("status", "active").then((r) => unwrap(r, "client services")),
    sb.from("ai_events").select("id, solution_id, kind, body, actor, created_at")
      .order("created_at", { ascending: false }).limit(20)
      .then((r) => unwrap(r, "events")),
    sb.from("ai_models").select("provider_key, model, deprecated_on")
      .then((r) => unwrap(r, "models")),
    sb.from("ai_templates").select("id").eq("active", true).then((r) => unwrap(r, "templates")),
    loadProviders(),
  ]);

  const raw = solutions as SolutionRaw[];
  const usageRows = usage as UsageRaw[];
  const providerRows = providers as ProviderRow[];

  const providerByKey = new Map(providerRows.map((p) => [p.key, p] as const));

  const deprecatedByModel = new Map(
    (models as { provider_key: string; model: string; deprecated_on: string | null }[])
      .map((m) => [`${m.provider_key}:${m.model}`, m.deprecated_on] as const)
  );

  const group = <T,>(rows: T[], key: (row: T) => string): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      const held = map.get(k);
      if (held) held.push(row);
      else map.set(k, [row]);
    }
    return map;
  };

  const usageBySolution = group(usageRows, (u) => u.solution_id);
  const integrationsBySolution = group(
    integrations as { solution_id: string; provider: string; label: string | null; status: string; is_required: boolean }[],
    (i) => i.solution_id
  );
  const knowledgeBySolution = group(
    knowledge as { solution_id: string; name: string; status: string; last_synced_at: string | null; refresh_days: number | null }[],
    (k) => k.solution_id
  );
  const alertsBySolution = group(
    (alerts as { id: string; solution_id: string | null; severity: string; title: string; detail: string | null }[])
      .filter((a) => a.solution_id) as { id: string; solution_id: string; severity: string; title: string; detail: string | null }[],
    (a) => a.solution_id
  );
  const deploymentsBySolution = group(
    deployments as { id: string; solution_id: string; customer_id: string | null; status: string }[],
    (d) => d.solution_id
  );

  const serviceById = new Map(
    (clientServices as { id: string; sale_price_cents: number; billing_type: string; interval_months: number }[])
      .map((s) => [s.id, s] as const)
  );

  const now = Date.now();
  const windowStart = new Date(Date.now() - windowDays * DAY).toISOString();

  const rowsAll: SolutionRow[] = raw.map((s) => {
    const customer = one<CustomerLite>(s.customers);
    const all = usageBySolution.get(s.id) ?? [];
    const inWindow = all.filter((u) => u.occurred_at >= windowStart);
    const forHealth = all.filter((u) => u.occurred_at >= healthFrom);

    const priced = inWindow.filter((u) => u.cost_micro_usd !== null);
    const costMicroUsd = priced.length > 0
      ? priced.reduce((sum, u) => sum + (u.cost_micro_usd ?? 0), 0)
      : null;
    const costPartial = priced.length > 0 && priced.length < inWindow.length;

    const latencies = inWindow.map((u) => u.latency_ms).filter((v): v is number => v !== null);
    const successes = inWindow.filter((u) => u.status === "success").length;

    const conversations = new Set(
      inWindow.map((u) => u.conversation_id).filter((v): v is string => Boolean(v))
    ).size;

    const solutionAlerts = alertsBySolution.get(s.id) ?? [];
    const solutionIntegrations = integrationsBySolution.get(s.id) ?? [];
    const provider = s.provider_key ? providerByKey.get(s.provider_key) ?? null : null;

    const health = scoreSolution({
      status: s.status,
      isArchived: s.is_archived,
      calls: forHealth.map((u) => ({ status: u.status, occurredAt: u.occurred_at })),
      provider: provider ? { key: provider.key, name: provider.name, status: provider.status } : null,
      integrations: solutionIntegrations.map((i) => ({
        provider: i.provider,
        label: i.label || i.provider,
        status: i.status,
        required: i.is_required,
      })),
      knowledge: (knowledgeBySolution.get(s.id) ?? []).map((k) => ({
        name: k.name,
        status: k.status,
        lastSyncedAt: k.last_synced_at,
        refreshDays: k.refresh_days,
      })),
      openAlerts: solutionAlerts.map((a) => ({ severity: a.severity, title: a.title, detail: a.detail })),
      modelDeprecatedOn: s.provider_key && s.model
        ? deprecatedByModel.get(`${s.provider_key}:${s.model}`) ?? null
        : null,
      errorRateWarningPct: s.error_rate_warning_pct,
      costThisWindowMicroUsd: costMicroUsd,
      monthlyCostWarningMicroUsd: s.monthly_cost_warning_micro_usd,
      now,
    });

    // Revenue: the linked client service wins because that is the row the
    // billing system works from; the agreed monthly price is the fallback.
    const linked = s.client_service_id ? serviceById.get(s.client_service_id) : undefined;
    let monthlyRevenueCents: number | null = null;
    let revenueSource: SolutionRow["revenueSource"] = null;
    if (linked && linked.billing_type === "recurring") {
      monthlyRevenueCents = Math.round(linked.sale_price_cents / Math.max(1, linked.interval_months));
      revenueSource = "client_service";
    } else if (s.billing_type === "recurring" && (s.monthly_price_cents ?? 0) > 0) {
      monthlyRevenueCents = s.monthly_price_cents;
      revenueSource = "contract";
    }

    const solutionDeployments = deploymentsBySolution.get(s.id) ?? [];
    const clientIds = new Set(
      [s.customer_id, ...solutionDeployments.map((d) => d.customer_id)].filter(
        (v): v is string => Boolean(v)
      )
    );

    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      internalName: s.internal_name,
      description: s.description,
      purpose: s.purpose,
      coverImageUrl: safeUrl(s.cover_image_url),
      tags: s.tags ?? [],
      type: s.solution_type,
      typeLabel: TYPE_LABELS[s.solution_type] ?? s.solution_type,
      status: s.status,
      statusLabel: STATUS_LABELS[s.status] ?? s.status,
      client: customer
        ? { id: customer.id, name: customer.business_name || customer.name || "Client" }
        : null,
      clientCount: clientIds.size,
      deploymentCount: solutionDeployments.length,
      providerKey: s.provider_key,
      providerName: provider?.name ?? null,
      model: s.model,
      target: s.deployment_target,
      targetLabel: TARGET_LABELS[s.deployment_target] ?? s.deployment_target,
      deploymentUrl: safeUrl(s.deployment_url),
      sourcePath: s.source_path,
      health,
      calls: inWindow.length,
      conversations,
      totalTokens: inWindow.reduce((sum, u) => sum + (u.total_tokens ?? 0), 0),
      costMicroUsd,
      costPartial,
      avgLatencyMs: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
      successRate: inWindow.length ? successes / inWindow.length : null,
      monthlyRevenueCents,
      revenueSource,
      marginShare: margin(monthlyRevenueCents, costMicroUsd),
      isArchived: s.is_archived,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      lastActivityAt: health.lastActivityAt,
    };
  });

  // ── Tabs ───────────────────────────────────────────────────────────
  const active = rowsAll.filter((r) => !r.isArchived);
  const inTypeSet = (r: SolutionRow, set: SolutionType[]) => set.includes(r.type);

  const tabCounts: Record<AiFilters["tab"], number> = {
    all: active.length,
    chatbots: active.filter((r) => inTypeSet(r, CHATBOT_TYPES)).length,
    agents: active.filter((r) => inTypeSet(r, AGENT_TYPES)).length,
    automations: active.filter((r) => inTypeSet(r, AUTOMATION_TYPES)).length,
    templates: (templates as { id: string }[]).length,
    archived: rowsAll.filter((r) => r.isArchived).length,
  };

  const inTab = (r: SolutionRow): boolean => {
    switch (filters.tab) {
      case "chatbots": return !r.isArchived && inTypeSet(r, CHATBOT_TYPES);
      case "agents": return !r.isArchived && inTypeSet(r, AGENT_TYPES);
      case "automations": return !r.isArchived && inTypeSet(r, AUTOMATION_TYPES);
      case "archived": return r.isArchived;
      case "templates": return false;
      default: return !r.isArchived;
    }
  };

  const needle = filters.q?.toLowerCase().trim();

  const rows = rowsAll
    .filter((r) => {
      if (!inTab(r)) return false;
      if (needle) {
        const hay = [r.name, r.slug, r.internalName, r.client?.name, r.model, r.providerName, ...r.tags]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filters.client && r.client?.id !== filters.client) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.provider && r.providerKey !== filters.provider) return false;
      if (filters.health && r.health.state !== filters.health) return false;
      return true;
    })
    .sort(sorter(filters.sort));

  // ── KPIs ───────────────────────────────────────────────────────────
  const monthFrom = new Date(Date.now() - 30 * DAY).toISOString();
  const monthUsage = usageRows.filter((u) => u.occurred_at >= monthFrom);
  const monthPriced = monthUsage.filter((u) => u.cost_micro_usd !== null);
  const monthlyCostMicroUsd = monthPriced.length
    ? monthPriced.reduce((sum, u) => sum + (u.cost_micro_usd ?? 0), 0)
    : null;

  // Each client service counted once, so a shared retainer cannot inflate.
  const countedServices = new Set<string>();
  let revenueTotal = 0;
  let revenueKnown = false;
  for (const row of active) {
    if (row.monthlyRevenueCents === null) continue;
    const source = raw.find((s) => s.id === row.id)?.client_service_id;
    if (row.revenueSource === "client_service" && source) {
      if (countedServices.has(source)) continue;
      countedServices.add(source);
    }
    revenueTotal += row.monthlyRevenueCents;
    revenueKnown = true;
  }
  const monthlyRevenueCents = revenueKnown ? revenueTotal : null;

  const clientSystems = new Set(
    active.flatMap((r) => {
      const ids = r.client ? [r.client.id] : [];
      const fromDeployments = (deploymentsBySolution.get(r.id) ?? [])
        .map((d) => d.customer_id)
        .filter((v): v is string => Boolean(v));
      return [...ids, ...fromDeployments];
    })
  );

  const kpis = {
    activeSolutions: active.filter((r) => r.status === "active").length,
    clientSystems: clientSystems.size,
    monthlyRevenueCents,
    monthlyCostMicroUsd,
    monthlyCostPartial: monthPriced.length > 0 && monthPriced.length < monthUsage.length,
    grossMargin: margin(monthlyRevenueCents, monthlyCostMicroUsd),
    needingAttention: active.filter((r) => needsAttention(r.health.state)).length,
  };

  // ── Needs Attention ────────────────────────────────────────────────
  const attention: AttentionItem[] = active
    .flatMap((r) =>
      r.health.reasons
        .filter((reason) => reason.severity !== "info")
        .map((reason, index) => ({
          id: `${r.id}:${index}`,
          solutionId: r.id,
          solutionName: r.name,
          severity: reason.severity as "critical" | "warning",
          title: reason.label,
          detail: reason.detail,
        }))
    )
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1))
    .slice(0, 12);

  // ── Usage overview for the selected window ─────────────────────────
  const windowUsage = usageRows.filter((u) => u.occurred_at >= windowStart);
  const windowPriced = windowUsage.filter((u) => u.cost_micro_usd !== null);
  const usageOverview: UsageOverview = {
    window: filters.window,
    conversations: new Set(
      windowUsage.map((u) => u.conversation_id).filter((v): v is string => Boolean(v))
    ).size,
    calls: windowUsage.length,
    totalTokens: windowUsage.reduce((sum, u) => sum + (u.total_tokens ?? 0), 0),
    inputTokens: windowUsage.reduce((sum, u) => sum + (u.input_tokens ?? 0), 0),
    outputTokens: windowUsage.reduce((sum, u) => sum + (u.output_tokens ?? 0), 0),
    costMicroUsd: windowPriced.length
      ? windowPriced.reduce((sum, u) => sum + (u.cost_micro_usd ?? 0), 0)
      : null,
    costPartial: windowPriced.length > 0 && windowPriced.length < windowUsage.length,
    automationRuns: windowUsage.filter((u) => u.event_type === "run").length,
    empty: windowUsage.length === 0,
  };

  // ── Top performer ──────────────────────────────────────────────────
  // Ranked by successful calls, because that is the only performance
  // number this system actually measures. Leads and conversion appear only
  // where a conversation was linked to a lead; otherwise they are null and
  // the panel says the metric is not tracked yet.
  const ranked = active
    .filter((r) => r.calls > 0)
    .sort((a, b) => b.calls * (b.successRate ?? 0) - a.calls * (a.successRate ?? 0));
  const best = ranked[0] ?? null;

  const topPerformer: TopPerformer = best
    ? {
        id: best.id,
        name: best.name,
        clientName: best.client?.name ?? null,
        status: best.status,
        statusLabel: best.statusLabel,
        conversations: best.conversations,
        leads: null,
        conversionRate: null,
        successfulRuns: Math.round(best.calls * (best.successRate ?? 0)),
        successRate: best.successRate,
      }
    : null;

  // ── Recent activity ────────────────────────────────────────────────
  const nameById = new Map(rowsAll.map((r) => [r.id, r] as const));
  const activity: ActivityItem[] = (
    events as { id: string; solution_id: string | null; kind: string; body: string; actor: string | null; created_at: string }[]
  ).map((e) => {
    const solution = e.solution_id ? nameById.get(e.solution_id) ?? null : null;
    return {
      id: `ev:${e.id}`,
      at: e.created_at,
      event: e.body,
      solutionId: e.solution_id,
      solutionName: solution?.name ?? null,
      clientName: solution?.client?.name ?? null,
      actor: e.actor,
    };
  });

  // Failures are activity too, and on a screen whose job is to surface
  // trouble they should not wait for somebody to write an event row.
  for (const failure of usageRows.filter((u) => u.status !== "success").slice(0, 10)) {
    const solution = nameById.get(failure.solution_id) ?? null;
    activity.push({
      id: `err:${failure.solution_id}:${failure.occurred_at}`,
      at: failure.occurred_at,
      event: `Call failed — ${failure.status.replace(/_/g, " ")}`,
      solutionId: failure.solution_id,
      solutionName: solution?.name ?? null,
      clientName: solution?.client?.name ?? null,
      actor: "System",
    });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  const providerUsage: Record<string, { calls: number; costMicroUsd: number | null }> = {};
  for (const provider of providerRows) {
    const rows = monthUsage.filter((u) => (u as UsageRaw & { provider_key?: string }).provider_key === provider.key);
    const pricedRows = rows.filter((u) => u.cost_micro_usd !== null);
    providerUsage[provider.key] = {
      calls: rows.length,
      costMicroUsd: pricedRows.length
        ? pricedRows.reduce((sum, u) => sum + (u.cost_micro_usd ?? 0), 0)
        : null,
    };
  }

  const healthBreakdown = (["critical", "warning", "unknown", "healthy"] as HealthState[])
    .map((state) => ({
      state,
      label: HEALTH_LABELS[state],
      count: active.filter((r) => r.health.state === state).length,
    }))
    .filter((h) => h.count > 0);

  const clients = [
    ...new Map(active.filter((r) => r.client).map((r) => [r.client!.id, r.client!] as const)).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    kpis,
    tabCounts,
    rows,
    attention,
    activity: activity.slice(0, 12),
    usage: usageOverview,
    topPerformer,
    providers: providerRows,
    providerUsage,
    clients,
    healthBreakdown,
    empty: rowsAll.length === 0,
    noProviderConnected: !providerRows.some((p) => p.status === "operational"),
    templateCount: (templates as { id: string }[]).length,
  };
}

function sorter(sort: AiFilters["sort"]): (a: SolutionRow, b: SolutionRow) => number {
  switch (sort) {
    case "revenue":
      return (a, b) => (b.monthlyRevenueCents ?? -1) - (a.monthlyRevenueCents ?? -1) || a.name.localeCompare(b.name);
    case "cost":
      return (a, b) => (b.costMicroUsd ?? -1) - (a.costMicroUsd ?? -1) || a.name.localeCompare(b.name);
    case "margin":
      return (a, b) => (b.marginShare ?? -1) - (a.marginShare ?? -1) || a.name.localeCompare(b.name);
    case "usage":
      return (a, b) => b.calls - a.calls || a.name.localeCompare(b.name);
    case "performance":
      return (a, b) =>
        HEALTH_RANK[a.health.state] - HEALTH_RANK[b.health.state] ||
        (b.successRate ?? -1) - (a.successRate ?? -1) ||
        a.name.localeCompare(b.name);
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    default:
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt);
  }
}

/** The templates list, for the AI Templates dialog. */
export async function loadTemplates(sb: SupabaseClient) {
  const rows = await sb
    .from("ai_templates")
    .select("id, key, name, description, solution_type, provider_key, model, default_tools, knowledge_requirements, active")
    .eq("active", true)
    .order("sort_order")
    .then((r) => unwrap(r, "templates"));

  return (rows as {
    id: string; key: string; name: string; description: string | null;
    solution_type: SolutionType; provider_key: string | null; model: string | null;
    default_tools: string[]; knowledge_requirements: string[];
  }[]).map((t) => ({
    ...t,
    typeLabel: TYPE_LABELS[t.solution_type] ?? t.solution_type,
  }));
}

/** The AI solutions belonging to one client — for the Client record. */
export async function aiSolutionsForClient(sb: SupabaseClient, customerId: string) {
  const rows = await sb
    .from("ai_solutions")
    .select("id, name, solution_type, status, monthly_price_cents, billing_type")
    .eq("customer_id", customerId)
    .eq("is_archived", false)
    .order("name")
    .then((r) => unwrap(r, "client ai solutions"));

  return (rows as {
    id: string; name: string; solution_type: SolutionType; status: SolutionStatus;
    monthly_price_cents: number | null; billing_type: string;
  }[]).map((s) => ({
    id: s.id,
    name: s.name,
    typeLabel: TYPE_LABELS[s.solution_type] ?? s.solution_type,
    status: s.status,
    statusLabel: STATUS_LABELS[s.status] ?? s.status,
    monthlyCents: s.billing_type === "recurring" ? s.monthly_price_cents : null,
  }));
}
