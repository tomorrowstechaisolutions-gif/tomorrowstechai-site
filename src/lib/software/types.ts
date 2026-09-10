/**
 * The Software vocabulary, in one place.
 *
 * No "server-only" here on purpose: the filter bar, the New Software Product
 * sheet and the plan editor are client components and every one of them needs
 * the same labels. Anything that touches Supabase lives in queries.ts.
 *
 * These strings are the SAME strings the database check constraints allow. If
 * a value can be written it has a label here, and if it has a label here it
 * can be written — a screen must never render a raw enum because someone
 * added a status in SQL and forgot the other half.
 */

export type ProductType =
  | "saas_platform" | "industry_saas" | "custom_software" | "internal_tool"
  | "white_label" | "client_portal" | "fleet_saas" | "ai_saas"
  | "crm_platform" | "operations_platform" | "other";

/** Lifecycle: a decision somebody made. Distinct from health, below. */
export type LifecycleStatus =
  | "planning" | "development" | "testing" | "beta" | "live"
  | "maintenance" | "paused" | "deprecated" | "archived";

/**
 * Four states, and Unknown is a real one.
 *
 * Nothing in this module may turn missing data into Healthy. A product whose
 * apps have never been checked has not been found to be fine; nothing has
 * looked at it, and the badge says so.
 */
export type HealthState = "healthy" | "warning" | "critical" | "unknown";

export type BillingModel =
  | "subscription" | "one_time" | "subscription_setup" | "usage_based" | "custom";

export type ReleaseChannel = "stable" | "beta" | "alpha" | "canary" | "internal";

export type VersionStatus =
  | "draft" | "development" | "testing" | "staging"
  | "release_candidate" | "production" | "deprecated";

export type PlanStatus = "draft" | "active" | "grandfathered" | "retired";

export type LimitType = "numeric" | "unlimited" | "not_included";

export type FeatureCategory =
  | "crm" | "scheduling" | "billing" | "ai" | "mobile" | "inventory"
  | "fleet" | "marketing" | "reporting" | "automation" | "admin"
  | "security" | "integrations" | "support" | "other";

export type FeatureStatus =
  | "planned" | "in_development" | "testing" | "live" | "deprecated";

export type Inclusion = "included" | "limited" | "not_included";

export type ReleaseStatus =
  | "planned" | "in_development" | "code_complete" | "testing"
  | "ready" | "released" | "blocked" | "canceled";

export type RoadmapStatus =
  | "idea" | "planned" | "approved" | "in_development"
  | "testing" | "ready" | "released" | "deferred";

export type Priority = "critical" | "high" | "medium" | "low";

export type ClientStatus =
  | "active" | "trial" | "onboarding" | "paused" | "past_due" | "canceled";

export type OnboardingStatus = "not_started" | "in_progress" | "blocked" | "complete";

export type RequestStatus =
  | "new" | "reviewing" | "accepted" | "planned" | "shipped" | "declined";

/* ── Labels ────────────────────────────────────────────────────────── */

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  saas_platform: "SaaS Platform",
  industry_saas: "Industry SaaS",
  custom_software: "Custom Software",
  internal_tool: "Internal Tool",
  white_label: "White Label Platform",
  client_portal: "Client Portal Platform",
  fleet_saas: "Fleet SaaS",
  ai_saas: "AI SaaS",
  crm_platform: "CRM Platform",
  operations_platform: "Operations Platform",
  other: "Other",
};

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  planning: "Planning",
  development: "Development",
  testing: "Testing",
  beta: "Beta",
  live: "Live",
  maintenance: "Maintenance",
  paused: "Paused",
  deprecated: "Deprecated",
  archived: "Archived",
};

export const HEALTH_LABELS: Record<HealthState, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

export const BILLING_MODEL_LABELS: Record<BillingModel, string> = {
  subscription: "Subscription",
  one_time: "One-Time License",
  subscription_setup: "Subscription + Setup Fee",
  usage_based: "Usage-Based",
  custom: "Custom",
};

export const CHANNEL_LABELS: Record<ReleaseChannel, string> = {
  stable: "Stable",
  beta: "Beta",
  alpha: "Alpha",
  canary: "Canary",
  internal: "Internal",
};

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  draft: "Draft",
  development: "Development",
  testing: "Testing",
  staging: "Staging",
  release_candidate: "Release Candidate",
  production: "Production",
  deprecated: "Deprecated",
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  // Nobody may buy it any more, but clients are still on it. Deleting the
  // plan would orphan them, so this is the state that keeps them legible.
  grandfathered: "Grandfathered",
  retired: "Retired",
};

export const FEATURE_CATEGORY_LABELS: Record<FeatureCategory, string> = {
  crm: "CRM",
  scheduling: "Scheduling",
  billing: "Billing",
  ai: "AI",
  mobile: "Mobile",
  inventory: "Inventory",
  fleet: "Fleet",
  marketing: "Marketing",
  reporting: "Reporting",
  automation: "Automation",
  admin: "Admin",
  security: "Security",
  integrations: "Integrations",
  support: "Support",
  other: "Other",
};

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  planned: "Planned",
  in_development: "In Development",
  testing: "Testing",
  live: "Live",
  deprecated: "Deprecated",
};

export const INCLUSION_LABELS: Record<Inclusion, string> = {
  included: "Yes",
  limited: "Limited",
  not_included: "No",
};

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  planned: "Planned",
  in_development: "In Development",
  code_complete: "Code Complete",
  testing: "Testing",
  ready: "Ready",
  released: "Released",
  blocked: "Blocked",
  canceled: "Canceled",
};

export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  idea: "Ideas",
  planned: "Planned",
  approved: "Approved",
  in_development: "In Development",
  testing: "Testing",
  ready: "Ready",
  released: "Released",
  deferred: "Deferred",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Active",
  trial: "Trial",
  onboarding: "Onboarding",
  paused: "Paused",
  past_due: "Past Due",
  canceled: "Canceled",
};

export const ONBOARDING_LABELS: Record<OnboardingStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  complete: "Complete",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  accepted: "Accepted",
  planned: "Planned",
  shipped: "Shipped",
  declined: "Declined",
};

export const LIMIT_TYPE_LABELS: Record<LimitType, string> = {
  numeric: "Limit",
  unlimited: "Unlimited",
  not_included: "Not included",
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
  testing: "t-warm",
  beta: "t-info",
  live: "t-ok",
  maintenance: "t-warm",
  paused: "t-muted",
  deprecated: "t-muted",
  archived: "t-muted",
};

export const VERSION_STATUS_TONE: Record<VersionStatus, string> = {
  draft: "t-muted",
  development: "t-info",
  testing: "t-warm",
  staging: "t-warm",
  release_candidate: "t-info",
  production: "t-ok",
  deprecated: "t-muted",
};

export const PLAN_STATUS_TONE: Record<PlanStatus, string> = {
  draft: "t-muted",
  active: "t-ok",
  grandfathered: "t-warm",
  retired: "t-muted",
};

export const RELEASE_STATUS_TONE: Record<ReleaseStatus, string> = {
  planned: "t-muted",
  in_development: "t-info",
  code_complete: "t-info",
  testing: "t-warm",
  ready: "t-ok",
  released: "t-ok",
  blocked: "t-risk",
  canceled: "t-muted",
};

export const CLIENT_STATUS_TONE: Record<ClientStatus, string> = {
  active: "t-ok",
  trial: "t-info",
  onboarding: "t-warm",
  paused: "t-muted",
  past_due: "t-risk",
  canceled: "t-muted",
};

export const ONBOARDING_TONE: Record<OnboardingStatus, string> = {
  not_started: "t-muted",
  in_progress: "t-info",
  blocked: "t-risk",
  complete: "t-ok",
};

export const PRIORITY_TONE: Record<Priority, string> = {
  critical: "t-risk",
  high: "t-risk",
  medium: "t-warn",
  low: "t-muted",
};

export const FEATURE_STATUS_TONE: Record<FeatureStatus, string> = {
  planned: "t-muted",
  in_development: "t-info",
  testing: "t-warm",
  live: "t-ok",
  deprecated: "t-muted",
};

export const INCLUSION_TONE: Record<Inclusion, string> = {
  included: "t-ok",
  limited: "t-warn",
  not_included: "t-muted",
};

/* ── Groupings the screens agree on ────────────────────────────────── */

/**
 * Statuses the "In Development" KPI counts: §2 asks for "development,
 * testing, beta, or pre-launch", which is all four pre-live states.
 */
export const IN_DEVELOPMENT: LifecycleStatus[] = [
  "planning", "development", "testing", "beta",
];

/**
 * The narrower set behind the "In Development" TAB.
 *
 * Beta and Testing have tabs of their own (§4), so the development tab must
 * not also contain them or the tab counts overlap and stop adding up to the
 * total — which is the fastest way to make someone distrust the header.
 */
export const DEVELOPMENT_TAB: LifecycleStatus[] = ["planning", "development"];

/** Client statuses that count towards "SaaS Clients" and MRR. */
export const BILLABLE_CLIENT_STATUS: ClientStatus[] = ["active", "past_due"];

/** Ordered for every select in the app, so no two disagree. */
export const LIFECYCLE_ORDER: LifecycleStatus[] = [
  "planning", "development", "testing", "beta", "live",
  "maintenance", "paused", "deprecated", "archived",
];

export const PRODUCT_TYPE_ORDER: ProductType[] = [
  "saas_platform", "industry_saas", "custom_software", "internal_tool",
  "white_label", "client_portal", "fleet_saas", "ai_saas",
  "crm_platform", "operations_platform", "other",
];

export const HEALTH_ORDER: HealthState[] = ["healthy", "warning", "critical", "unknown"];

export const BILLING_MODEL_ORDER: BillingModel[] = [
  "subscription", "subscription_setup", "one_time", "usage_based", "custom",
];

export const CHANNEL_ORDER: ReleaseChannel[] = [
  "stable", "beta", "alpha", "canary", "internal",
];

export const VERSION_STATUS_ORDER: VersionStatus[] = [
  "draft", "development", "testing", "staging",
  "release_candidate", "production", "deprecated",
];

export const PLAN_STATUS_ORDER: PlanStatus[] = [
  "draft", "active", "grandfathered", "retired",
];

export const FEATURE_CATEGORY_ORDER: FeatureCategory[] = [
  "crm", "scheduling", "billing", "ai", "mobile", "inventory", "fleet",
  "marketing", "reporting", "automation", "admin", "security",
  "integrations", "support", "other",
];

export const FEATURE_STATUS_ORDER: FeatureStatus[] = [
  "planned", "in_development", "testing", "live", "deprecated",
];

export const CLIENT_STATUS_ORDER: ClientStatus[] = [
  "active", "trial", "onboarding", "paused", "past_due", "canceled",
];

export const ONBOARDING_ORDER: OnboardingStatus[] = [
  "not_started", "in_progress", "blocked", "complete",
];

/** The lanes on the roadmap board, in order. §24. */
export const ROADMAP_BOARD_ORDER: RoadmapStatus[] = [
  "idea", "planned", "in_development", "testing", "released",
];

/**
 * Usage limits offered as suggestions when adding one to a plan.
 *
 * SUGGESTIONS, not a schema. The limits live as rows in
 * software_plan_limits precisely so a fleet product can limit vehicles and a
 * pool product can limit technicians without a migration. Free text is
 * accepted and is the normal case for anything not on this list.
 */
export const LIMIT_SUGGESTIONS: { key: string; label: string; unit?: string }[] = [
  { key: "users", label: "Users" },
  { key: "technicians", label: "Technicians" },
  { key: "locations", label: "Locations" },
  { key: "clients", label: "Clients" },
  { key: "projects", label: "Projects" },
  { key: "storage", label: "Storage", unit: "GB" },
  { key: "ai_usage", label: "AI usage", unit: "credits/mo" },
  { key: "messages", label: "Messages", unit: "/mo" },
  { key: "api_calls", label: "API calls", unit: "/mo" },
  { key: "products", label: "Products" },
];

/** Industries offered as suggestions. Free text is still accepted. */
export const INDUSTRY_SUGGESTIONS = [
  "Pool Service", "Telecom", "Fleet & Logistics", "Automotive",
  "Construction", "Field Service", "Veterinary", "Professional Services",
  "Real Estate", "Retail", "Hospitality", "Healthcare", "Other",
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

/**
 * How a usage limit reads in a table cell.
 *
 * "Unlimited" and "—" are different answers and the matrix has to be able to
 * tell them apart: one is a promise, the other is an absence.
 */
export function limitLabel(
  limitType: LimitType,
  value: number | null,
  unit: string | null
): string {
  if (limitType === "unlimited") return "Unlimited";
  if (limitType === "not_included") return "Not included";
  if (value === null) return "—";
  return unit ? `${value.toLocaleString("en-US")} ${unit}` : value.toLocaleString("en-US");
}

/**
 * Normalises a version string for sorting: "v2.10.1" sorts after "v2.9.0".
 *
 * Plain string comparison gets this wrong, and getting it wrong means the
 * Versions tab shows the wrong release at the top. Non-numeric tails
 * ("2.5.0-rc1") sort before the clean release of the same numbers, which is
 * the order they actually happened in.
 */
export function versionSortKey(version: string): string {
  const cleaned = version.trim().replace(/^v/i, "");
  const [numeric, ...rest] = cleaned.split(/[-+]/);
  const padded = numeric
    .split(".")
    .map((part) => part.replace(/\D/g, "").padStart(6, "0"))
    .join(".");
  // A pre-release tail must sort BEFORE the plain version, so the clean
  // release gets a high sentinel and anything tagged keeps its own text.
  return `${padded}|${rest.length ? rest.join("-") : "~"}`;
}
