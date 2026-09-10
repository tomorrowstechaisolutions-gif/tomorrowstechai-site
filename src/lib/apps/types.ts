/**
 * The Apps vocabulary, in one place.
 *
 * No "server-only" here on purpose: the filter bar, the New App sheet and
 * the settings forms are client components and every one of them needs the
 * same labels. Anything that touches Supabase lives in queries.ts instead.
 */

export type OwnershipType = "internal" | "client" | "joint" | "white_label";

export type PlatformType =
  | "web" | "ios" | "android" | "web_mobile" | "pwa" | "internal_tool" | "api";

export type LifecycleStatus =
  | "planning" | "development" | "qa" | "staging" | "live" | "paused" | "archived";

export type EnvironmentType = "production" | "staging" | "development" | "preview";

/**
 * Four states, and Unknown is a real one.
 *
 * Nothing in this module is allowed to turn missing data into Healthy. An
 * app with no health check has not been found to be fine; it has not been
 * looked at, and the badge says so.
 */
export type HealthState = "healthy" | "warning" | "critical" | "unknown";

export type IntegrationProvider =
  | "vercel" | "supabase" | "github" | "stripe" | "openai" | "resend"
  | "twilio" | "google" | "meta" | "cloudflare" | "sentry" | "uptime" | "other";

export type IntegrationStatus =
  | "connected" | "needs_attention" | "disconnected" | "not_configured";

export type DeploymentStatus =
  | "success" | "building" | "queued" | "failed" | "canceled";

export type BillingType = "none" | "one_time" | "recurring" | "usage_based" | "included";

export type BillingStatus =
  | "not_connected" | "active" | "past_due" | "paused" | "cancelled";

export type SslStatus = "valid" | "expiring" | "invalid" | "unknown";

export type CheckType =
  | "application" | "hosting" | "database" | "api"
  | "domain_ssl" | "background_jobs" | "integration";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export type IncidentStatus = "open" | "monitoring" | "resolved";

/* ── Labels ────────────────────────────────────────────────────────── */

export const OWNERSHIP_LABELS: Record<OwnershipType, string> = {
  internal: "Internal",
  client: "Client",
  joint: "Joint",
  white_label: "White label",
};

export const PLATFORM_LABELS: Record<PlatformType, string> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
  web_mobile: "Web + Mobile",
  pwa: "PWA",
  internal_tool: "Internal tool",
  api: "API / Backend",
};

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  planning: "Planning",
  development: "Development",
  qa: "QA",
  staging: "Staging",
  live: "Live",
  paused: "Paused",
  archived: "Archived",
};

export const ENVIRONMENT_LABELS: Record<EnvironmentType, string> = {
  production: "Production",
  staging: "Staging",
  development: "Development",
  preview: "Preview",
};

export const HEALTH_LABELS: Record<HealthState, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

export const INTEGRATION_LABELS: Record<IntegrationProvider, string> = {
  vercel: "Vercel",
  supabase: "Supabase",
  github: "GitHub",
  stripe: "Stripe",
  openai: "OpenAI",
  resend: "Resend",
  twilio: "Twilio",
  google: "Google",
  meta: "Meta",
  cloudflare: "Cloudflare",
  sentry: "Sentry",
  uptime: "Uptime monitoring",
  other: "Other",
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: "Connected",
  needs_attention: "Needs attention",
  disconnected: "Disconnected",
  not_configured: "Not configured",
};

export const DEPLOYMENT_LABELS: Record<DeploymentStatus, string> = {
  success: "Success",
  building: "Building",
  queued: "Queued",
  failed: "Failed",
  canceled: "Canceled",
};

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  none: "Not billed",
  one_time: "One-time",
  recurring: "Recurring",
  usage_based: "Usage based",
  included: "Included in another service",
};

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  not_connected: "Not connected",
  active: "Active",
  past_due: "Past due",
  paused: "Paused",
  cancelled: "Cancelled",
};

export const CHECK_LABELS: Record<CheckType, string> = {
  application: "Application",
  hosting: "Hosting",
  database: "Database",
  api: "API checks",
  domain_ssl: "Domains / SSL",
  background_jobs: "Background jobs",
  integration: "Integrations",
};

/* ── Tones ─────────────────────────────────────────────────────────── */
/* The chip classes already defined in globals.css — nothing new is added
   to the design system here. */

export const HEALTH_TONE: Record<HealthState, string> = {
  healthy: "t-ok",
  warning: "t-warn",
  critical: "t-risk",
  unknown: "t-muted",
};

export const LIFECYCLE_TONE: Record<LifecycleStatus, string> = {
  planning: "t-muted",
  development: "t-info",
  qa: "t-info",
  staging: "t-warm",
  live: "t-ok",
  paused: "t-muted",
  archived: "t-muted",
};

export const ENVIRONMENT_TONE: Record<EnvironmentType, string> = {
  production: "t-ok",
  staging: "t-warn",
  development: "t-info",
  preview: "t-muted",
};

export const DEPLOYMENT_TONE: Record<DeploymentStatus, string> = {
  success: "t-ok",
  building: "t-info",
  queued: "t-muted",
  failed: "t-risk",
  canceled: "t-muted",
};

export const INTEGRATION_TONE: Record<IntegrationStatus, string> = {
  connected: "t-ok",
  needs_attention: "t-warn",
  disconnected: "t-risk",
  not_configured: "t-muted",
};

export const SSL_TONE: Record<SslStatus, string> = {
  valid: "t-ok",
  expiring: "t-warn",
  invalid: "t-risk",
  unknown: "t-muted",
};

export const SEVERITY_TONE: Record<IncidentSeverity, string> = {
  critical: "t-risk",
  high: "t-risk",
  medium: "t-warn",
  low: "t-muted",
};

/* ── Groupings the screens agree on ────────────────────────────────── */

/** Statuses the "In development" KPI and tab count. */
export const IN_DEVELOPMENT: LifecycleStatus[] = ["planning", "development", "qa", "staging"];

/** Ordered for every select in the app, so the options never disagree. */
export const LIFECYCLE_ORDER: LifecycleStatus[] = [
  "planning", "development", "qa", "staging", "live", "paused", "archived",
];

export const PLATFORM_ORDER: PlatformType[] = [
  "web", "ios", "android", "web_mobile", "pwa", "internal_tool", "api",
];

export const OWNERSHIP_ORDER: OwnershipType[] = ["internal", "client", "joint", "white_label"];

export const HEALTH_ORDER: HealthState[] = ["healthy", "warning", "critical", "unknown"];

export const ENVIRONMENT_ORDER: EnvironmentType[] = [
  "production", "staging", "development", "preview",
];

export const INTEGRATION_ORDER: IntegrationProvider[] = [
  "vercel", "supabase", "github", "stripe", "openai", "resend",
  "twilio", "google", "meta", "cloudflare", "sentry", "uptime", "other",
];

/** Frameworks offered as suggestions. Free text is still accepted. */
export const FRAMEWORK_SUGGESTIONS = [
  "Next.js", "React", "React Native", "Flutter", "Node", "Expo",
  "SvelteKit", "Astro", "Swift", "Kotlin", "Python", "Other",
];

/* ── Small shared helpers ──────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

/** Lowercase, dash-separated, safe in a URL. */
export function slugify(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Bare host: no scheme, no www, no trailing slash, lowercased. */
export function normalizeHost(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  let host = trimmed;
  try {
    host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    host = trimmed.replace(/^https?:\/\//, "").split("/")[0];
  }
  return host.replace(/^www\./, "").replace(/\/$/, "");
}

/** A URL we are willing to put behind an href. Anything else becomes null. */
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

/** github.com/owner/repo → "owner/repo", for display and for the API path. */
export function repoSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}
