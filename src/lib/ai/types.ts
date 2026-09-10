/**
 * The AI Solutions vocabulary, in one place.
 *
 * No "server-only" here: the filter bar, the New Solution sheet and the
 * prompt editor are client components and all of them need these labels.
 * Anything that touches Supabase or a provider key lives elsewhere.
 */

export type SolutionType =
  | "chatbot" | "agent" | "automation" | "internal_assistant"
  | "content_ai" | "sales_ai" | "support_ai" | "workflow_agent" | "custom";

export type SolutionStatus =
  | "draft" | "testing" | "active" | "paused" | "error" | "archived";

/** Four states, and Unknown is a real one. Missing data is never Healthy. */
export type HealthState = "healthy" | "warning" | "critical" | "unknown";

export type ProviderStatus =
  | "operational" | "warning" | "disconnected" | "not_configured" | "unknown";

export type IntegrationStatus =
  | "connected" | "warning" | "disconnected" | "not_configured";

export type KnowledgeStatus =
  | "current" | "needs_sync" | "syncing" | "error" | "disabled" | "not_synced";

export type KnowledgeSourceType =
  | "document" | "website" | "faq" | "database" | "catalog"
  | "policy" | "manual_text" | "vector_store" | "api" | "other";

export type DeploymentTarget =
  | "website" | "app" | "client_portal" | "internal_admin"
  | "api" | "widget" | "other";

export type BillingType = "none" | "one_time" | "recurring" | "usage_based" | "included";

export type UsageStatus = "success" | "error" | "rate_limited" | "timeout" | "refused";

export type AlertSeverity = "critical" | "warning" | "info";

export type ToolKey =
  | "crm_read" | "crm_write" | "client_data_read" | "search_knowledge"
  | "send_email" | "send_sms" | "create_meeting" | "create_task"
  | "generate_proposal" | "generate_invoice" | "create_content"
  | "publish_social" | "billing_read" | "billing_write"
  | "notify_admin" | "route_ticket" | "web_search" | "other";

/* ── Labels ────────────────────────────────────────────────────────── */

export const TYPE_LABELS: Record<SolutionType, string> = {
  chatbot: "Chatbot",
  agent: "AI Agent",
  automation: "Automation",
  internal_assistant: "Internal Assistant",
  content_ai: "Content AI",
  sales_ai: "Sales AI",
  support_ai: "Support AI",
  workflow_agent: "Workflow Agent",
  custom: "Custom",
};

export const STATUS_LABELS: Record<SolutionStatus, string> = {
  draft: "Draft",
  testing: "Testing",
  active: "Active",
  paused: "Paused",
  error: "Error",
  archived: "Archived",
};

export const HEALTH_LABELS: Record<HealthState, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  operational: "Operational",
  warning: "Warning",
  disconnected: "Disconnected",
  not_configured: "Not configured",
  unknown: "Unknown",
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: "Connected",
  warning: "Warning",
  disconnected: "Disconnected",
  not_configured: "Not configured",
};

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  current: "Current",
  needs_sync: "Needs sync",
  syncing: "Syncing",
  error: "Error",
  disabled: "Disabled",
  not_synced: "Never synced",
};

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  document: "Uploaded document",
  website: "Website pages",
  faq: "FAQ",
  database: "Database records",
  catalog: "Product catalog",
  policy: "Client policies",
  manual_text: "Manual text",
  vector_store: "Vector store",
  api: "API source",
  other: "Other",
};

export const TARGET_LABELS: Record<DeploymentTarget, string> = {
  website: "Website",
  app: "App",
  client_portal: "Client portal",
  internal_admin: "Internal admin",
  api: "API",
  widget: "Embedded widget",
  other: "Other",
};

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  none: "Not billed",
  one_time: "One-time",
  recurring: "Recurring",
  usage_based: "Usage based",
  included: "Included in another service",
};

export const TOOL_LABELS: Record<ToolKey, string> = {
  crm_read: "CRM read",
  crm_write: "CRM write",
  client_data_read: "Access client data",
  search_knowledge: "Search knowledge",
  send_email: "Send email",
  send_sms: "Send SMS",
  create_meeting: "Create meeting",
  create_task: "Create task",
  generate_proposal: "Generate proposal",
  generate_invoice: "Generate invoice",
  create_content: "Create content",
  publish_social: "Publish social",
  billing_read: "Billing read",
  billing_write: "Billing write",
  notify_admin: "Notify admin",
  route_ticket: "Route support ticket",
  web_search: "Web search",
  other: "Other",
};

/** Tools that change something. Shown differently, and default to approval. */
export const WRITE_TOOLS: ToolKey[] = [
  "crm_write", "send_email", "send_sms", "create_meeting", "create_task",
  "generate_proposal", "generate_invoice", "create_content", "publish_social",
  "billing_write", "route_ticket",
];

/* ── Tones — existing chip classes only, nothing new invented ─────── */

export const HEALTH_TONE: Record<HealthState, string> = {
  healthy: "t-ok",
  warning: "t-warn",
  critical: "t-risk",
  unknown: "t-muted",
};

export const STATUS_TONE: Record<SolutionStatus, string> = {
  draft: "t-muted",
  testing: "t-warn",
  active: "t-ok",
  paused: "t-muted",
  error: "t-risk",
  archived: "t-muted",
};

export const PROVIDER_TONE: Record<ProviderStatus, string> = {
  operational: "t-ok",
  warning: "t-warn",
  disconnected: "t-risk",
  not_configured: "t-muted",
  unknown: "t-muted",
};

export const INTEGRATION_TONE: Record<IntegrationStatus, string> = {
  connected: "t-ok",
  warning: "t-warn",
  disconnected: "t-risk",
  not_configured: "t-muted",
};

export const KNOWLEDGE_TONE: Record<KnowledgeStatus, string> = {
  current: "t-ok",
  needs_sync: "t-warn",
  syncing: "t-info",
  error: "t-risk",
  disabled: "t-muted",
  not_synced: "t-muted",
};

export const SEVERITY_TONE: Record<AlertSeverity, string> = {
  critical: "t-risk",
  warning: "t-warn",
  info: "t-info",
};

export const USAGE_TONE: Record<UsageStatus, string> = {
  success: "t-ok",
  error: "t-risk",
  rate_limited: "t-warn",
  timeout: "t-warn",
  refused: "t-muted",
};

/* ── Orders, so no two selects disagree ────────────────────────────── */

export const TYPE_ORDER: SolutionType[] = [
  "chatbot", "agent", "automation", "internal_assistant",
  "content_ai", "sales_ai", "support_ai", "workflow_agent", "custom",
];

export const STATUS_ORDER: SolutionStatus[] = [
  "draft", "testing", "active", "paused", "error", "archived",
];

export const HEALTH_ORDER: HealthState[] = ["healthy", "warning", "critical", "unknown"];

export const TARGET_ORDER: DeploymentTarget[] = [
  "website", "app", "client_portal", "internal_admin", "api", "widget", "other",
];

export const TOOL_ORDER: ToolKey[] = [
  "search_knowledge", "crm_read", "client_data_read", "billing_read", "web_search",
  "create_task", "create_meeting", "notify_admin", "route_ticket",
  "create_content", "publish_social", "generate_proposal", "generate_invoice",
  "send_email", "send_sms", "crm_write", "billing_write", "other",
];

export const KNOWLEDGE_TYPE_ORDER: KnowledgeSourceType[] = [
  "document", "website", "faq", "database", "catalog",
  "policy", "manual_text", "vector_store", "api", "other",
];

/** Which tab a solution type belongs under on the main page. */
export const CHATBOT_TYPES: SolutionType[] = ["chatbot", "sales_ai", "support_ai"];
export const AGENT_TYPES: SolutionType[] = ["agent", "internal_assistant", "content_ai"];
export const AUTOMATION_TYPES: SolutionType[] = ["automation", "workflow_agent"];

/* ── Money and tokens ──────────────────────────────────────────────── */

/**
 * Costs are held in MICRO-DOLLARS, not cents.
 *
 * A single Haiku reply can cost a twentieth of a cent. Rounded to cents it
 * is zero, and a month of "zero" is how a cost screen quietly becomes
 * decoration. Micro-dollars keep the small numbers real and are converted
 * only for display.
 */
export const MICRO_PER_DOLLAR = 1_000_000;

const DASH = "—";

export function microUsd(micro: number | null | undefined, opts?: { precise?: boolean }): string {
  if (micro === null || micro === undefined || !Number.isFinite(micro)) return DASH;
  const dollars = micro / MICRO_PER_DOLLAR;
  if (dollars === 0) return "$0.00";
  if (opts?.precise || Math.abs(dollars) < 0.01) {
    return `$${dollars.toFixed(Math.abs(dollars) < 0.001 ? 5 : 4)}`;
  }
  if (Math.abs(dollars) < 1000) {
    return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  return `$${(dollars / 1000).toFixed(1)}k`;
}

/** 18,400,000 → 18.4M. Tokens are never money, so never a $ sign. */
export function tokens(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Margin as a share, or null when either side is unknown. */
export function margin(revenueCents: number | null, costMicroUsd: number | null): number | null {
  if (revenueCents === null || costMicroUsd === null) return null;
  if (revenueCents <= 0) return null;
  const revenueMicro = revenueCents * 10_000; // cents → micro-dollars
  return (revenueMicro - costMicroUsd) / revenueMicro;
}

/* ── Small shared helpers ──────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export function slugify(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Windows the usage and cost screens agree on. */
export type Window = "7d" | "30d" | "90d";
export const WINDOW_DAYS: Record<Window, number> = { "7d": 7, "30d": 30, "90d": 90 };
export const WINDOW_LABELS: Record<Window, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};
