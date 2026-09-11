import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { OBSERVATION_WINDOW_DAYS, scoreSolution, type AiHealth } from "./health";
import { loadProviders, type ProviderRow } from "./providers";
import {
  STATUS_LABELS,
  TARGET_LABELS,
  TYPE_LABELS,
  margin,
  safeUrl,
  WINDOW_DAYS,
  type BillingType,
  type DeploymentTarget,
  type SolutionStatus,
  type SolutionType,
  type Window,
} from "./types";

/**
 * One AI solution, everything about it.
 *
 * Split into a core loader plus one loader per tab, for the same reason
 * every other detail screen here is: opening Overview should not pay for
 * ninety days of usage rows, and a failing Costs query must not blank the
 * header.
 *
 * Nothing in this file calls a provider. Live provider work happens on the
 * Test button and in the nightly job, which write their answers into these
 * tables — so the screen is always fast and can always say when it last
 * learned anything.
 */

const DAY = 86_400_000;

export type PromptVersion = {
  id: string;
  version: number;
  systemPrompt: string;
  persona: string | null;
  tone: string | null;
  purpose: string | null;
  responseRules: string | null;
  escalationRules: string | null;
  fallbackBehavior: string | null;
  safetyRules: string | null;
  temperature: number | null;
  maxOutputTokens: number | null;
  status: "draft" | "active" | "retired";
  changeNotes: string | null;
  createdBy: string | null;
  createdAt: string;
  activatedAt: string | null;
};

export type KnowledgeSource = {
  id: string;
  name: string;
  sourceType: string;
  location: string | null;
  content: string | null;
  status: string;
  documentCount: number | null;
  chunkCount: number | null;
  sizeBytes: number | null;
  embeddingProvider: string | null;
  refreshDays: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  owner: string | null;
  /** Derived: past its refresh window. */
  stale: boolean;
};

export type SolutionIntegration = {
  id: string;
  provider: string;
  label: string | null;
  status: string;
  environment: string;
  accountRef: string | null;
  isRequired: boolean;
  lastCheckedAt: string | null;
  error: string | null;
};

export type ToolGrant = {
  id: string;
  tool: string;
  allowed: boolean;
  requiresApproval: boolean;
  notes: string | null;
  grantedBy: string | null;
  grantedAt: string | null;
};

export type Deployment = {
  id: string;
  name: string;
  customerId: string | null;
  clientName: string | null;
  environment: string;
  deploymentUrl: string | null;
  status: string;
  monthlyPriceCents: number | null;
  promptOverride: string | null;
  brandVoice: string | null;
  lastActiveAt: string | null;
  appId: string | null;
  websiteId: string | null;
};

export type SolutionDetail = {
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
  service: { id: string; name: string; fromCents: number; billing: string } | null;
  app: { id: string; name: string } | null;
  website: { id: string; name: string; domain: string } | null;
  clientServiceId: string | null;

  owner: string | null;
  createdBy: string | null;

  providerKey: string | null;
  providerName: string | null;
  providerStatus: string | null;
  model: string | null;
  fallbackProviderKey: string | null;
  fallbackModel: string | null;
  modelDeprecatedOn: string | null;
  temperature: number | null;
  maxOutputTokens: number | null;

  target: DeploymentTarget;
  targetLabel: string;
  deploymentUrl: string | null;
  sourcePath: string | null;

  promptEditable: boolean;
  promptLockedReason: string | null;
  activeVersion: PromptVersion | null;
  versionCount: number;

  monthlyPriceCents: number | null;
  setupFeeCents: number | null;
  usageMarkupPct: number | null;
  billingType: BillingType;

  monthlyCostWarningMicroUsd: number | null;
  dailySpendLimitMicroUsd: number | null;
  monthlyTokenWarning: number | null;
  errorRateWarningPct: number | null;

  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;

  knowledge: KnowledgeSource[];
  integrations: SolutionIntegration[];
  tools: ToolGrant[];
  deployments: Deployment[];
  openAlerts: { id: string; severity: string; title: string; detail: string | null; createdAt: string }[];

  health: AiHealth;

  /** Last 30 days. */
  calls: number;
  conversations: number;
  totalTokens: number;
  costMicroUsd: number | null;
  costPartial: boolean;
  successRate: number | null;
  avgLatencyMs: number | null;
  monthlyRevenueCents: number | null;
  marginShare: number | null;
  openTasks: number;
};

type Embedded<T> = T | T[] | null;
const one = <T,>(v: Embedded<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function loadSolution(sb: SupabaseClient, id: string): Promise<SolutionDetail | null> {
  const { data, error } = await sb
    .from("ai_solutions")
    .select(
      `*,
       customers(id, name, business_name),
       catalog_items(id, name, from_cents, billing),
       apps(id, name),
       websites(id, name, domain)`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`solution: ${error.message}`);
  if (!data) return null;

  const s = data as Record<string, unknown> & {
    customers: Embedded<{ id: string; name: string | null; business_name: string | null }>;
    catalog_items: Embedded<{ id: string; name: string; from_cents: number; billing: string }>;
    apps: Embedded<{ id: string; name: string }>;
    websites: Embedded<{ id: string; name: string; domain: string }>;
  };

  const monthFrom = new Date(Date.now() - 30 * DAY).toISOString();
  const healthFrom = new Date(Date.now() - OBSERVATION_WINDOW_DAYS * DAY).toISOString();

  const [versions, knowledge, integrations, tools, deployments, alerts, usage, tasks, providers, models] =
    await Promise.all([
      sb.from("ai_solution_versions").select("*").eq("solution_id", id)
        .order("version", { ascending: false }).then((r) => unwrap(r, "versions")),
      sb.from("ai_knowledge_sources").select("*").eq("solution_id", id)
        .order("name").then((r) => unwrap(r, "knowledge")),
      sb.from("ai_integrations").select("*").eq("solution_id", id)
        .order("provider").then((r) => unwrap(r, "integrations")),
      sb.from("ai_solution_tools").select("*").eq("solution_id", id)
        .order("tool").then((r) => unwrap(r, "tools")),
      sb.from("ai_deployments").select("*, customers(id, name, business_name)").eq("solution_id", id)
        .order("name").then((r) => unwrap(r, "deployments")),
      sb.from("ai_alerts").select("id, severity, title, detail, created_at, status")
        .eq("solution_id", id).neq("status", "resolved")
        .order("created_at", { ascending: false }).then((r) => unwrap(r, "alerts")),
      sb.from("ai_usage_events")
        .select("conversation_id, status, occurred_at, total_tokens, cost_micro_usd, latency_ms")
        .eq("solution_id", id).gte("occurred_at", monthFrom)
        .order("occurred_at", { ascending: false }).limit(10000)
        .then((r) => unwrap(r, "usage")),
      sb.from("tasks").select("id").eq("ai_solution_id", id).eq("done", false)
        .not("status", "in", "(completed,canceled)").then((r) => unwrap(r, "tasks")),
      loadProviders(),
      sb.from("ai_models").select("provider_key, model, deprecated_on").then((r) => unwrap(r, "models")),
    ]);

  const versionRows = (versions as Record<string, never>[]).map(mapVersion);
  const activeVersion = versionRows.find((v) => v.status === "active") ?? null;

  const now = Date.now();
  const knowledgeRows: KnowledgeSource[] = (knowledge as Record<string, never>[]).map((raw) => {
    const k = raw as unknown as Record<string, string | number | null>;
    const lastSyncedAt = (k.last_synced_at as string | null) ?? null;
    const refreshDays = (k.refresh_days as number | null) ?? null;
    return {
      id: k.id as string,
      name: k.name as string,
      sourceType: k.source_type as string,
      location: (k.location as string | null) ?? null,
      content: (k.content as string | null) ?? null,
      status: k.status as string,
      documentCount: (k.document_count as number | null) ?? null,
      chunkCount: (k.chunk_count as number | null) ?? null,
      sizeBytes: (k.size_bytes as number | null) ?? null,
      embeddingProvider: (k.embedding_provider as string | null) ?? null,
      refreshDays,
      lastSyncedAt,
      lastError: (k.last_error as string | null) ?? null,
      owner: (k.owner as string | null) ?? null,
      stale: Boolean(
        refreshDays && lastSyncedAt &&
        (now - new Date(lastSyncedAt).getTime()) / DAY > refreshDays
      ),
    };
  });

  const integrationRows: SolutionIntegration[] = (integrations as Record<string, never>[]).map((raw) => {
    const i = raw as unknown as Record<string, string | boolean | null>;
    return {
      id: i.id as string,
      provider: i.provider as string,
      label: (i.label as string | null) ?? null,
      status: i.status as string,
      environment: (i.environment as string) ?? "all",
      accountRef: (i.account_ref as string | null) ?? null,
      isRequired: Boolean(i.is_required),
      lastCheckedAt: (i.last_checked_at as string | null) ?? null,
      error: (i.error as string | null) ?? null,
    };
  });

  const toolRows: ToolGrant[] = (tools as Record<string, never>[]).map((raw) => {
    const t = raw as unknown as Record<string, string | boolean | null>;
    return {
      id: t.id as string,
      tool: t.tool as string,
      allowed: Boolean(t.allowed),
      requiresApproval: Boolean(t.requires_approval),
      notes: (t.notes as string | null) ?? null,
      grantedBy: (t.granted_by as string | null) ?? null,
      grantedAt: (t.granted_at as string | null) ?? null,
    };
  });

  const deploymentRows: Deployment[] = (deployments as (Record<string, never> & {
    customers: Embedded<{ id: string; name: string | null; business_name: string | null }>;
  })[]).map((raw) => {
    const d = raw as unknown as Record<string, string | number | boolean | null>;
    const customer = one(raw.customers);
    return {
      id: d.id as string,
      name: d.name as string,
      customerId: (d.customer_id as string | null) ?? null,
      clientName: customer ? customer.business_name || customer.name || "Client" : null,
      environment: (d.environment as string) ?? "production",
      deploymentUrl: safeUrl(d.deployment_url as string | null),
      status: (d.status as string) ?? "active",
      monthlyPriceCents: (d.monthly_price_cents as number | null) ?? null,
      promptOverride: (d.prompt_override as string | null) ?? null,
      brandVoice: (d.brand_voice as string | null) ?? null,
      lastActiveAt: (d.last_active_at as string | null) ?? null,
      appId: (d.app_id as string | null) ?? null,
      websiteId: (d.website_id as string | null) ?? null,
    };
  });

  const usageRows = usage as {
    conversation_id: string | null; status: string; occurred_at: string;
    total_tokens: number; cost_micro_usd: number | null; latency_ms: number | null;
  }[];

  const priced = usageRows.filter((u) => u.cost_micro_usd !== null);
  const costMicroUsd = priced.length ? priced.reduce((sum, u) => sum + (u.cost_micro_usd ?? 0), 0) : null;
  const latencies = usageRows.map((u) => u.latency_ms).filter((v): v is number => v !== null);
  const successes = usageRows.filter((u) => u.status === "success").length;

  const providerRows = providers as ProviderRow[];
  const provider = s.provider_key ? providerRows.find((p) => p.key === s.provider_key) ?? null : null;

  const deprecated = (models as { provider_key: string; model: string; deprecated_on: string | null }[])
    .find((m) => m.provider_key === s.provider_key && m.model === s.model)?.deprecated_on ?? null;

  const alertRows = (alerts as { id: string; severity: string; title: string; detail: string | null; created_at: string }[]);

  const health = scoreSolution({
    status: s.status as string,
    isArchived: s.is_archived as boolean,
    calls: usageRows
      .filter((u) => u.occurred_at >= healthFrom)
      .map((u) => ({ status: u.status, occurredAt: u.occurred_at })),
    provider: provider ? { key: provider.key, name: provider.name, status: provider.status } : null,
    integrations: integrationRows.map((i) => ({
      provider: i.provider,
      label: i.label || i.provider,
      status: i.status,
      required: i.isRequired,
    })),
    knowledge: knowledgeRows.map((k) => ({
      name: k.name, status: k.status, lastSyncedAt: k.lastSyncedAt, refreshDays: k.refreshDays,
    })),
    openAlerts: alertRows.map((a) => ({ severity: a.severity, title: a.title, detail: a.detail })),
    modelDeprecatedOn: deprecated,
    errorRateWarningPct: (s.error_rate_warning_pct as number | null) ?? null,
    costThisWindowMicroUsd: costMicroUsd,
    monthlyCostWarningMicroUsd: (s.monthly_cost_warning_micro_usd as number | null) ?? null,
    now,
  });

  const customer = one(s.customers);
  const service = one(s.catalog_items);
  const app = one(s.apps);
  const website = one(s.websites);

  const monthlyRevenueCents =
    (s.billing_type as string) === "recurring" ? ((s.monthly_price_cents as number | null) ?? null) : null;

  return {
    id: s.id as string,
    name: s.name as string,
    slug: s.slug as string,
    internalName: (s.internal_name as string | null) ?? null,
    description: (s.description as string | null) ?? null,
    purpose: (s.purpose as string | null) ?? null,
    coverImageUrl: safeUrl(s.cover_image_url as string | null),
    tags: (s.tags as string[] | null) ?? [],
    type: s.solution_type as SolutionType,
    typeLabel: TYPE_LABELS[s.solution_type as SolutionType] ?? String(s.solution_type),
    status: s.status as SolutionStatus,
    statusLabel: STATUS_LABELS[s.status as SolutionStatus] ?? String(s.status),
    client: customer ? { id: customer.id, name: customer.business_name || customer.name || "Client" } : null,
    service: service
      ? { id: service.id, name: service.name, fromCents: service.from_cents, billing: service.billing }
      : null,
    app: app ? { id: app.id, name: app.name } : null,
    website: website ? { id: website.id, name: website.name, domain: website.domain } : null,
    clientServiceId: (s.client_service_id as string | null) ?? null,
    owner: (s.owner as string | null) ?? null,
    createdBy: (s.created_by as string | null) ?? null,
    providerKey: (s.provider_key as string | null) ?? null,
    providerName: provider?.name ?? null,
    providerStatus: provider?.status ?? null,
    model: (s.model as string | null) ?? null,
    fallbackProviderKey: (s.fallback_provider_key as string | null) ?? null,
    fallbackModel: (s.fallback_model as string | null) ?? null,
    modelDeprecatedOn: deprecated,
    temperature: (s.temperature as number | null) ?? null,
    maxOutputTokens: (s.max_output_tokens as number | null) ?? null,
    target: s.deployment_target as DeploymentTarget,
    targetLabel: TARGET_LABELS[s.deployment_target as DeploymentTarget] ?? String(s.deployment_target),
    deploymentUrl: safeUrl(s.deployment_url as string | null),
    sourcePath: (s.source_path as string | null) ?? null,
    promptEditable: Boolean(s.prompt_editable),
    promptLockedReason: (s.prompt_locked_reason as string | null) ?? null,
    activeVersion,
    versionCount: versionRows.length,
    monthlyPriceCents: (s.monthly_price_cents as number | null) ?? null,
    setupFeeCents: (s.setup_fee_cents as number | null) ?? null,
    usageMarkupPct: (s.usage_markup_pct as number | null) ?? null,
    billingType: s.billing_type as BillingType,
    monthlyCostWarningMicroUsd: (s.monthly_cost_warning_micro_usd as number | null) ?? null,
    dailySpendLimitMicroUsd: (s.daily_spend_limit_micro_usd as number | null) ?? null,
    monthlyTokenWarning: (s.monthly_token_warning as number | null) ?? null,
    errorRateWarningPct: (s.error_rate_warning_pct as number | null) ?? null,
    notes: (s.notes as string | null) ?? null,
    isArchived: s.is_archived as boolean,
    createdAt: s.created_at as string,
    updatedAt: s.updated_at as string,
    knowledge: knowledgeRows,
    integrations: integrationRows,
    tools: toolRows,
    deployments: deploymentRows,
    openAlerts: alertRows.map((a) => ({
      id: a.id, severity: a.severity, title: a.title, detail: a.detail, createdAt: a.created_at,
    })),
    health,
    calls: usageRows.length,
    conversations: new Set(
      usageRows.map((u) => u.conversation_id).filter((v): v is string => Boolean(v))
    ).size,
    totalTokens: usageRows.reduce((sum, u) => sum + (u.total_tokens ?? 0), 0),
    costMicroUsd,
    costPartial: priced.length > 0 && priced.length < usageRows.length,
    successRate: usageRows.length ? successes / usageRows.length : null,
    avgLatencyMs: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null,
    monthlyRevenueCents,
    marginShare: margin(monthlyRevenueCents, costMicroUsd),
    openTasks: (tasks as { id: string }[]).length,
  };
}

function mapVersion(raw: Record<string, never>): PromptVersion {
  const v = raw as unknown as Record<string, string | number | null>;
  return {
    id: v.id as string,
    version: v.version as number,
    systemPrompt: v.system_prompt as string,
    persona: (v.persona as string | null) ?? null,
    tone: (v.tone as string | null) ?? null,
    purpose: (v.purpose as string | null) ?? null,
    responseRules: (v.response_rules as string | null) ?? null,
    escalationRules: (v.escalation_rules as string | null) ?? null,
    fallbackBehavior: (v.fallback_behavior as string | null) ?? null,
    safetyRules: (v.safety_rules as string | null) ?? null,
    temperature: (v.temperature as number | null) ?? null,
    maxOutputTokens: (v.max_output_tokens as number | null) ?? null,
    status: v.status as "draft" | "active" | "retired",
    changeNotes: (v.change_notes as string | null) ?? null,
    createdBy: (v.created_by as string | null) ?? null,
    createdAt: v.created_at as string,
    activatedAt: (v.activated_at as string | null) ?? null,
  };
}

/* ── Tab loaders ───────────────────────────────────────────────────── */

export async function loadVersions(sb: SupabaseClient, solutionId: string): Promise<PromptVersion[]> {
  const rows = await sb
    .from("ai_solution_versions")
    .select("*")
    .eq("solution_id", solutionId)
    .order("version", { ascending: false })
    .then((r) => unwrap(r, "versions"));
  return (rows as Record<string, never>[]).map(mapVersion);
}

export type UsageSeriesPoint = {
  date: string;
  calls: number;
  conversations: number;
  tokens: number;
  costMicroUsd: number | null;
  failures: number;
};

export type UsageDetail = {
  window: Window;
  points: UsageSeriesPoint[];
  totals: {
    calls: number;
    conversations: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    toolCalls: number;
    automationRuns: number;
    costMicroUsd: number | null;
    costPartial: boolean;
    avgLatencyMs: number | null;
  };
  byModel: { model: string; calls: number; tokens: number; costMicroUsd: number | null }[];
  recent: {
    id: string;
    occurredAt: string;
    eventType: string;
    model: string | null;
    clientName: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    costMicroUsd: number | null;
    latencyMs: number | null;
    status: string;
    error: string | null;
    source: string;
    requestRef: string | null;
  }[];
  empty: boolean;
};

export async function loadUsage(
  sb: SupabaseClient,
  solutionId: string,
  window: Window
): Promise<UsageDetail> {
  const days = WINDOW_DAYS[window];
  const from = new Date(Date.now() - days * DAY).toISOString();

  const rows = (await sb
    .from("ai_usage_events")
    .select("id, occurred_at, event_type, model, input_tokens, output_tokens, total_tokens, cost_micro_usd, latency_ms, status, error, source, request_ref, conversation_id, customers(business_name, name)")
    .eq("solution_id", solutionId)
    .gte("occurred_at", from)
    .order("occurred_at", { ascending: false })
    .limit(5000)
    .then((r) => unwrap(r, "usage detail"))) as (Record<string, never> & {
      customers: Embedded<{ business_name: string | null; name: string | null }>;
    })[];

  type Row = {
    id: string; occurred_at: string; event_type: string; model: string | null;
    input_tokens: number | null; output_tokens: number | null; total_tokens: number;
    cost_micro_usd: number | null; latency_ms: number | null; status: string;
    error: string | null; source: string; request_ref: string | null; conversation_id: string | null;
  };

  const typed = rows as unknown as (Row & { customers: Embedded<{ business_name: string | null; name: string | null }> })[];

  const byDay = new Map<string, UsageSeriesPoint & { conversationIds: Set<string> }>();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(Date.now() - index * DAY).toISOString().slice(0, 10);
    byDay.set(date, {
      date, calls: 0, conversations: 0, tokens: 0, costMicroUsd: null, failures: 0,
      conversationIds: new Set<string>(),
    });
  }

  for (const row of typed) {
    const date = row.occurred_at.slice(0, 10);
    const point = byDay.get(date);
    if (!point) continue;
    point.calls += 1;
    point.tokens += row.total_tokens ?? 0;
    if (row.status !== "success") point.failures += 1;
    if (row.cost_micro_usd !== null) {
      point.costMicroUsd = (point.costMicroUsd ?? 0) + row.cost_micro_usd;
    }
    if (row.conversation_id) point.conversationIds.add(row.conversation_id);
  }

  const points = [...byDay.values()].map(({ conversationIds, ...rest }) => ({
    ...rest,
    conversations: conversationIds.size,
  }));

  const priced = typed.filter((r) => r.cost_micro_usd !== null);
  const latencies = typed.map((r) => r.latency_ms).filter((v): v is number => v !== null);

  const models = new Map<string, { calls: number; tokens: number; cost: number | null }>();
  for (const row of typed) {
    const key = row.model ?? "unknown";
    const held = models.get(key) ?? { calls: 0, tokens: 0, cost: null };
    held.calls += 1;
    held.tokens += row.total_tokens ?? 0;
    if (row.cost_micro_usd !== null) held.cost = (held.cost ?? 0) + row.cost_micro_usd;
    models.set(key, held);
  }

  return {
    window,
    points,
    totals: {
      calls: typed.length,
      conversations: new Set(typed.map((r) => r.conversation_id).filter(Boolean)).size,
      inputTokens: typed.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0),
      outputTokens: typed.reduce((sum, r) => sum + (r.output_tokens ?? 0), 0),
      totalTokens: typed.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
      toolCalls: typed.filter((r) => r.event_type === "tool_call").length,
      automationRuns: typed.filter((r) => r.event_type === "run").length,
      costMicroUsd: priced.length ? priced.reduce((sum, r) => sum + (r.cost_micro_usd ?? 0), 0) : null,
      costPartial: priced.length > 0 && priced.length < typed.length,
      avgLatencyMs: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
    },
    byModel: [...models.entries()]
      .map(([model, v]) => ({ model, calls: v.calls, tokens: v.tokens, costMicroUsd: v.cost }))
      .sort((a, b) => b.calls - a.calls),
    recent: typed.slice(0, 60).map((r) => {
      const customer = one(r.customers);
      return {
        id: r.id,
        occurredAt: r.occurred_at,
        eventType: r.event_type,
        model: r.model,
        clientName: customer ? customer.business_name || customer.name : null,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        costMicroUsd: r.cost_micro_usd,
        latencyMs: r.latency_ms,
        status: r.status,
        error: r.error,
        source: r.source,
        requestRef: r.request_ref,
      };
    }),
    empty: typed.length === 0,
  };
}

export type ConversationRow = {
  id: string;
  externalRef: string | null;
  clientName: string | null;
  status: string;
  messageCount: number;
  leadGenerated: boolean;
  escalated: boolean;
  startedAt: string;
  lastActivityAt: string;
};

export async function loadConversations(
  sb: SupabaseClient,
  solutionId: string,
  limit = 50
): Promise<ConversationRow[]> {
  const rows = (await sb
    .from("ai_conversations")
    .select("id, external_ref, status, message_count, lead_generated, escalated, started_at, last_activity_at, customers(business_name, name)")
    .eq("solution_id", solutionId)
    .order("last_activity_at", { ascending: false })
    .limit(limit)
    .then((r) => unwrap(r, "conversations"))) as (Record<string, never> & {
      customers: Embedded<{ business_name: string | null; name: string | null }>;
    })[];

  return rows.map((raw) => {
    const c = raw as unknown as Record<string, string | number | boolean | null>;
    const customer = one(raw.customers);
    return {
      id: c.id as string,
      externalRef: (c.external_ref as string | null) ?? null,
      clientName: customer ? customer.business_name || customer.name : null,
      status: c.status as string,
      messageCount: (c.message_count as number) ?? 0,
      leadGenerated: Boolean(c.lead_generated),
      escalated: Boolean(c.escalated),
      startedAt: c.started_at as string,
      lastActivityAt: c.last_activity_at as string,
    };
  });
}

export type SolutionEvent = {
  id: string;
  kind: string;
  body: string;
  actor: string | null;
  at: string;
};

export async function loadSolutionEvents(
  sb: SupabaseClient,
  solutionId: string,
  limit = 40
): Promise<SolutionEvent[]> {
  const rows = await sb
    .from("ai_events")
    .select("id, kind, body, actor, created_at")
    .eq("solution_id", solutionId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .then((r) => unwrap(r, "solution events"));

  return (rows as { id: string; kind: string; body: string; actor: string | null; created_at: string }[])
    .map((e) => ({ id: e.id, kind: e.kind, body: e.body, actor: e.actor, at: e.created_at }));
}

export type SolutionTask = {
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

/**
 * Work linked to this solution.
 *
 * These are ordinary rows in `tasks` — the same board, the same statuses,
 * the same assignees. An AI solution having problems produces normal work,
 * not work that lives in a second place nobody looks at.
 */
export async function loadSolutionTasks(
  sb: SupabaseClient,
  solutionId: string
): Promise<SolutionTask[]> {
  const rows = await sb
    .from("tasks")
    .select("id, title, type, priority, status, owner, due_at, done, job_id, customer_id")
    .eq("ai_solution_id", solutionId)
    .eq("is_template", false)
    .order("done", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100)
    .then((r) => unwrap(r, "solution tasks"));

  type Raw = {
    id: string; title: string; type: string; priority: string; status: string;
    owner: string | null; due_at: string | null; done: boolean;
    job_id: string | null; customer_id: string | null;
  };

  return (rows as Raw[]).map((t) => ({
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

export type RunRow = {
  id: string;
  occurredAt: string;
  eventType: string;
  status: string;
  error: string | null;
  latencyMs: number | null;
  source: string;
  requestRef: string | null;
  clientName: string | null;
};

export type RunsDetail = {
  window: Window;
  runs: RunRow[];
  totals: { runs: number; failed: number; toolCalls: number; avgLatencyMs: number | null };
  /** Distinct request refs seen — the closest thing to a trigger inventory. */
  triggers: { ref: string; runs: number; failed: number; lastAt: string }[];
};

/**
 * Automation runs.
 *
 * There is no scheduler table here on purpose: the runs recorded are the
 * runs that actually happened, written by the code that ran them. A
 * schedule that exists only as a row nobody executes is worse than no
 * schedule at all, so this tab reports history and says plainly that
 * triggers live in the calling code.
 */
export async function loadRuns(
  sb: SupabaseClient,
  solutionId: string,
  window: Window
): Promise<RunsDetail> {
  const from = new Date(Date.now() - WINDOW_DAYS[window] * DAY).toISOString();

  const rows = (await sb
    .from("ai_usage_events")
    .select("id, occurred_at, event_type, status, error, latency_ms, source, request_ref, customers(business_name, name)")
    .eq("solution_id", solutionId)
    .in("event_type", ["run", "tool_call"])
    .gte("occurred_at", from)
    .order("occurred_at", { ascending: false })
    .limit(500)
    .then((r) => unwrap(r, "runs"))) as (Record<string, never> & {
      customers: Embedded<{ business_name: string | null; name: string | null }>;
    })[];

  type Raw = {
    id: string; occurred_at: string; event_type: string; status: string;
    error: string | null; latency_ms: number | null; source: string; request_ref: string | null;
  };

  const typed = rows as unknown as (Raw & {
    customers: Embedded<{ business_name: string | null; name: string | null }>;
  })[];

  const runs: RunRow[] = typed.map((r) => {
    const customer = one(r.customers);
    return {
      id: r.id,
      occurredAt: r.occurred_at,
      eventType: r.event_type,
      status: r.status,
      error: r.error,
      latencyMs: r.latency_ms,
      source: r.source,
      requestRef: r.request_ref,
      clientName: customer ? customer.business_name || customer.name : null,
    };
  });

  const latencies = runs.map((r) => r.latencyMs).filter((v): v is number => v !== null);

  const byRef = new Map<string, { runs: number; failed: number; lastAt: string }>();
  for (const run of runs) {
    if (!run.requestRef) continue;
    const held = byRef.get(run.requestRef) ?? { runs: 0, failed: 0, lastAt: run.occurredAt };
    held.runs += 1;
    if (run.status !== "success") held.failed += 1;
    if (run.occurredAt > held.lastAt) held.lastAt = run.occurredAt;
    byRef.set(run.requestRef, held);
  }

  return {
    window,
    runs: runs.slice(0, 80),
    totals: {
      runs: runs.filter((r) => r.eventType === "run").length,
      failed: runs.filter((r) => r.status !== "success").length,
      toolCalls: runs.filter((r) => r.eventType === "tool_call").length,
      avgLatencyMs: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
    },
    triggers: [...byRef.entries()]
      .map(([ref, v]) => ({ ref, ...v }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 20),
  };
}

/** Everything the forms need to fill their selects, in one call. */
export async function loadAiChoices(sb: SupabaseClient) {
  const [clients, services, apps, websites, people, providers] = await Promise.all([
    sb.from("customers").select("id, name, business_name").order("business_name").limit(500)
      .then((r) => unwrap(r, "clients")),
    sb.from("catalog_items").select("id, name").eq("active", true).order("name").limit(500)
      .then((r) => unwrap(r, "services")),
    sb.from("apps").select("id, name").eq("is_archived", false).order("name").limit(500)
      .then((r) => unwrap(r, "apps")),
    sb.from("websites").select("id, name, domain").eq("is_archived", false).order("name").limit(500)
      .then((r) => unwrap(r, "websites")),
    sb.from("admin_users").select("email, full_name").order("full_name")
      .then((r) => unwrap(r, "people")),
    loadProviders(),
  ]);

  return {
    clients: (clients as { id: string; name: string | null; business_name: string | null }[]).map((c) => ({
      id: c.id,
      name: c.business_name || c.name || "Client",
    })),
    services: services as { id: string; name: string }[],
    apps: apps as { id: string; name: string }[],
    websites: websites as { id: string; name: string; domain: string }[],
    people: (people as { email: string; full_name: string | null }[]).map((p) => ({
      email: p.email,
      name: p.full_name || p.email,
    })),
    providers: (providers as ProviderRow[]).map((p) => ({
      key: p.key,
      name: p.name,
      status: p.status,
      models: p.models.filter((m) => m.active).map((m) => ({
        model: m.model,
        label: m.displayName || m.model,
        hasRate: m.inputRate !== null && m.outputRate !== null,
      })),
    })),
  };
}
