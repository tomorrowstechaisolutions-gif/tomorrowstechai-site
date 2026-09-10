import "server-only";
import {
  CHECK_LABELS,
  HEALTH_LABELS,
  type CheckType,
  type HealthState,
  type IncidentSeverity,
} from "./types";

/**
 * App health.
 *
 * Same posture as website and client health: derived on every read, never
 * stored on the app row, and every verdict carries the sentences that
 * produced it. A dot that says "critical" without being able to say why is
 * decoration.
 *
 * The rule that matters, and the one the spec is emphatic about: MISSING
 * DATA IS NEVER HEALTHY. A category with no recent check is Unknown. An app
 * with no checks at all is Unknown, not green. Every category is Unknown
 * until something actually looked, and the screen prints that word.
 *
 * "Recent" has to mean something, so it does: a check older than
 * STALE_AFTER_HOURS is history, not evidence. Yesterday's success does not
 * entitle the page to claim the app is up now.
 */

export const STALE_AFTER_HOURS = 24;

export type ReasonSeverity = "critical" | "warning" | "info";

export type HealthReason = {
  label: string;
  detail: string;
  severity: ReasonSeverity;
};

export type CategoryStatus = {
  type: CheckType;
  label: string;
  state: HealthState;
  detail: string;
  checkedAt: string | null;
  /** Milliseconds, when the check measured one. */
  responseMs: number | null;
};

export type AppHealth = {
  state: HealthState;
  label: string;
  reasons: HealthReason[];
  categories: CategoryStatus[];
  /** True when at least one category has a recent check behind it. */
  observed: boolean;
  /** The most recent check of any kind, stale or not. */
  lastCheckedAt: string | null;
};

export type HealthCheckInput = {
  checkType: CheckType;
  status: HealthState;
  message: string | null;
  responseTimeMs: number | null;
  checkedAt: string;
};

export type IncidentInput = {
  severity: IncidentSeverity;
  message: string;
  status: string;
  startedAt: string;
};

export type AppHealthInput = {
  lifecycleStatus: string;
  isArchived: boolean;
  checks: HealthCheckInput[];
  incidents: IncidentInput[];
  integrations: { provider: string; status: string; error: string | null; label: string }[];
  /** The most recent PRODUCTION deployment, if one has ever been recorded. */
  lastProductionDeployment: { status: string; at: string } | null;
  /** SSL state of the domains attached to production. */
  domains: { domain: string; sslStatus: string; environment: string; expiresInDays: number | null }[];
  billingStatus: string;
  now?: number;
};

/** Categories an app is scored on. Every one of them starts Unknown. */
const CATEGORIES: CheckType[] = [
  "application", "hosting", "database", "api",
  "domain_ssl", "background_jobs", "integration",
];

const hoursSince = (iso: string, now: number): number =>
  (now - new Date(iso).getTime()) / 3_600_000;

export function scoreApp(input: AppHealthInput): AppHealth {
  const now = input.now ?? Date.now();
  const reasons: HealthReason[] = [];
  const add = (severity: ReasonSeverity, label: string, detail: string) =>
    reasons.push({ severity, label, detail });

  // ── The most recent check per category ───────────────────────────
  const latest = new Map<CheckType, HealthCheckInput>();
  for (const check of input.checks) {
    const held = latest.get(check.checkType);
    if (!held || check.checkedAt > held.checkedAt) latest.set(check.checkType, check);
  }

  const lastCheckedAt = input.checks.reduce<string | null>(
    (newest, c) => (!newest || c.checkedAt > newest ? c.checkedAt : newest),
    null
  );

  const categories: CategoryStatus[] = CATEGORIES.map((type) => {
    const check = latest.get(type);
    if (!check) {
      return {
        type,
        label: CHECK_LABELS[type],
        state: "unknown",
        detail: "Never checked.",
        checkedAt: null,
        responseMs: null,
      };
    }

    const age = hoursSince(check.checkedAt, now);
    if (age > STALE_AFTER_HOURS) {
      return {
        type,
        label: CHECK_LABELS[type],
        state: "unknown",
        detail: `Last checked ${Math.round(age)}h ago — too old to count as current.`,
        checkedAt: check.checkedAt,
        responseMs: check.responseTimeMs,
      };
    }

    return {
      type,
      label: CHECK_LABELS[type],
      state: check.status,
      detail: check.message ?? (check.status === "healthy" ? "Passing." : "No detail recorded."),
      checkedAt: check.checkedAt,
      responseMs: check.responseTimeMs,
    };
  });

  const observed = categories.some((c) => c.state !== "unknown");

  // ── Declared states win over everything ──────────────────────────
  // Somebody set these deliberately. No signal overrides an archived app,
  // and an app that has not been built yet is not a health problem.
  if (input.isArchived || input.lifecycleStatus === "archived") {
    return {
      state: "unknown",
      label: HEALTH_LABELS.unknown,
      reasons: [{ severity: "info", label: "Archived", detail: "This app is no longer monitored." }],
      categories,
      observed,
      lastCheckedAt,
    };
  }

  // ── Real problems ────────────────────────────────────────────────
  for (const category of categories) {
    if (category.state === "critical") {
      add("critical", `${category.label} is failing`, category.detail);
    }
  }

  const openIncidents = input.incidents.filter((i) => i.status !== "resolved");
  for (const incident of openIncidents) {
    if (incident.severity === "critical" || incident.severity === "high") {
      add("critical", `Open ${incident.severity} incident`, incident.message);
    } else {
      add("warning", "Open incident", incident.message);
    }
  }

  if (input.lastProductionDeployment?.status === "failed") {
    add(
      "critical",
      "Last production deployment failed",
      `The most recent production build failed ${relative(input.lastProductionDeployment.at, now)}.`
    );
  }

  for (const domain of input.domains) {
    if (domain.environment !== "production") continue;
    if (domain.sslStatus === "invalid") {
      add("critical", `SSL invalid on ${domain.domain}`, "Visitors will see a security warning.");
    } else if (domain.sslStatus === "expiring") {
      add(
        "warning",
        `SSL expiring on ${domain.domain}`,
        domain.expiresInDays === null
          ? "The certificate is close to expiry."
          : `The certificate expires in ${domain.expiresInDays} ${domain.expiresInDays === 1 ? "day" : "days"}.`
      );
    }
  }

  // ── Worth knowing, not yet an emergency ──────────────────────────
  for (const category of categories) {
    if (category.state === "warning") {
      add("warning", `${category.label} is degraded`, category.detail);
    }
  }

  for (const integration of input.integrations) {
    if (integration.status === "needs_attention") {
      add(
        "warning",
        `${integration.label} needs attention`,
        integration.error ?? "The integration reported a problem."
      );
    } else if (integration.status === "disconnected") {
      add(
        "warning",
        `${integration.label} is disconnected`,
        integration.error ?? "This app depends on it and it is no longer connected."
      );
    }
  }

  if (input.billingStatus === "past_due") {
    add("warning", "Billing is past due", "The subscription behind this app has not been paid.");
  }

  if (input.lastProductionDeployment?.status === "building") {
    add("info", "A production deployment is running", `Started ${relative(input.lastProductionDeployment.at, now)}.`);
  }

  if (input.lifecycleStatus === "paused") {
    add("info", "Paused", "This app is intentionally not being worked on.");
  }

  // ── The verdict ──────────────────────────────────────────────────
  const critical = reasons.filter((r) => r.severity === "critical").length;
  const warning = reasons.filter((r) => r.severity === "warning").length;

  if (critical > 0) {
    return { state: "critical", label: HEALTH_LABELS.critical, reasons, categories, observed, lastCheckedAt };
  }
  if (warning > 0) {
    return { state: "warning", label: HEALTH_LABELS.warning, reasons, categories, observed, lastCheckedAt };
  }

  // Nothing is wrong — but did anything actually look? An app with no
  // recent check has not been found healthy; it has not been examined.
  // This is the branch the whole file exists to protect.
  if (!observed) {
    add(
      "info",
      "No health data",
      "Nothing has checked this app recently, so its state is unknown rather than healthy. Connect a provider or run a check to find out."
    );
    return { state: "unknown", label: HEALTH_LABELS.unknown, reasons, categories, observed, lastCheckedAt };
  }

  return { state: "healthy", label: HEALTH_LABELS.healthy, reasons, categories, observed, lastCheckedAt };
}

/** Health states that belong in the "needs attention" count. */
export function needsAttention(state: HealthState): boolean {
  return state === "critical" || state === "warning";
}

/** Worst-first, so the badge and the KPI agree on which app is worse. */
export const HEALTH_RANK: Record<HealthState, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  healthy: 3,
};

function relative(iso: string, now: number): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}
