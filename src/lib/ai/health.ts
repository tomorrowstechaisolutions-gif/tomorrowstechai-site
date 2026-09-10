import "server-only";
import { HEALTH_LABELS, type HealthState, type ProviderStatus } from "./types";

/**
 * AI solution health.
 *
 * Derived on every read, never stored, and every verdict carries the
 * sentences that produced it — same posture as client, website and app
 * health elsewhere in this admin.
 *
 * §34 is explicit and this file is built around it: MISSING DATA IS NOT
 * HEALTHY. A solution nobody has called is Unknown, not green. A provider
 * nobody has checked is Unknown, not operational. The only thing that can
 * produce "healthy" here is a run of recent calls that actually succeeded.
 */

export const OBSERVATION_WINDOW_DAYS = 7;

/** Below this many calls in the window there is not enough to judge. */
const MIN_CALLS_FOR_A_VERDICT = 3;

/** Defaults when a solution has set no threshold of its own. */
export const DEFAULT_ERROR_WARN_PCT = 10;
export const DEFAULT_ERROR_CRITICAL_PCT = 25;

export type ReasonSeverity = "critical" | "warning" | "info";

export type HealthReason = {
  label: string;
  detail: string;
  severity: ReasonSeverity;
};

export type AiHealth = {
  state: HealthState;
  label: string;
  reasons: HealthReason[];
  /** True when there were enough recent calls to judge anything. */
  observed: boolean;
  errorRate: number | null;
  calls: number;
  failures: number;
  lastActivityAt: string | null;
};

export type AiHealthInput = {
  status: string;
  isArchived: boolean;
  /** Calls in the observation window. */
  calls: { status: string; occurredAt: string }[];
  /** The provider this solution routes to, as last checked. */
  provider: { key: string; name: string; status: ProviderStatus } | null;
  integrations: { provider: string; label: string; status: string; required: boolean }[];
  knowledge: {
    name: string;
    status: string;
    lastSyncedAt: string | null;
    refreshDays: number | null;
  }[];
  openAlerts: { severity: string; title: string; detail: string | null }[];
  /** Set when the configured model has an announced end date. */
  modelDeprecatedOn: string | null;
  /** Thresholds from the solution row. Null means not set, not zero. */
  errorRateWarningPct: number | null;
  costThisWindowMicroUsd: number | null;
  monthlyCostWarningMicroUsd: number | null;
  now?: number;
};

const DAY = 86_400_000;

export function scoreSolution(input: AiHealthInput): AiHealth {
  const now = input.now ?? Date.now();
  const reasons: HealthReason[] = [];
  const add = (severity: ReasonSeverity, label: string, detail: string) =>
    reasons.push({ severity, label, detail });

  const calls = input.calls.length;
  const failures = input.calls.filter((c) => c.status !== "success").length;
  const errorRate = calls > 0 ? failures / calls : null;
  const lastActivityAt = input.calls.reduce<string | null>(
    (newest, c) => (!newest || c.occurredAt > newest ? c.occurredAt : newest),
    null
  );

  const base = {
    reasons,
    observed: calls >= MIN_CALLS_FOR_A_VERDICT,
    errorRate,
    calls,
    failures,
    lastActivityAt,
  };

  // ── States somebody declared. No signal overrides these. ─────────
  if (input.isArchived || input.status === "archived") {
    return {
      ...base,
      state: "unknown",
      label: HEALTH_LABELS.unknown,
      reasons: [{ severity: "info", label: "Archived", detail: "This solution is no longer monitored." }],
    };
  }

  if (input.status === "draft") {
    return {
      ...base,
      state: "unknown",
      label: HEALTH_LABELS.unknown,
      reasons: [{ severity: "info", label: "Draft", detail: "Not deployed yet, so there is nothing to measure." }],
    };
  }

  if (input.status === "error") {
    add("critical", "Marked as failing", "Somebody set this solution's status to Error.");
  }

  // ── The provider it depends on ───────────────────────────────────
  if (!input.provider) {
    add(
      "critical",
      "No provider configured",
      "This solution has no AI provider selected, so it cannot run at all."
    );
  } else if (input.provider.status === "disconnected") {
    add("critical", `${input.provider.name} is disconnected`, "The provider rejected the last call.");
  } else if (input.provider.status === "not_configured") {
    add(
      "critical",
      `${input.provider.name} is not configured`,
      "No API key is set on the server for this provider."
    );
  } else if (input.provider.status === "warning") {
    add("warning", `${input.provider.name} reported a problem`, "The last provider check did not come back clean.");
  }

  // ── Integrations it cannot work without ──────────────────────────
  for (const integration of input.integrations) {
    if (integration.status === "disconnected" || integration.status === "not_configured") {
      add(
        integration.required ? "critical" : "warning",
        `${integration.label} is ${integration.status === "disconnected" ? "disconnected" : "not configured"}`,
        integration.required
          ? "This solution is marked as requiring it, so it cannot work without it."
          : "Recorded as a dependency but not connected."
      );
    } else if (integration.status === "warning") {
      add("warning", `${integration.label} needs attention`, "The integration reported a warning.");
    }
  }

  // ── Failure rate ─────────────────────────────────────────────────
  const warnAt = input.errorRateWarningPct ?? DEFAULT_ERROR_WARN_PCT;
  const criticalAt = Math.max(warnAt, DEFAULT_ERROR_CRITICAL_PCT);

  if (calls >= MIN_CALLS_FOR_A_VERDICT && errorRate !== null) {
    const pct = errorRate * 100;
    if (pct >= criticalAt) {
      add(
        "critical",
        `High error rate — ${failures} failed ${failures === 1 ? "call" : "calls"}`,
        `${pct.toFixed(0)}% of the last ${calls} calls failed, against a ${criticalAt}% critical threshold.`
      );
    } else if (pct >= warnAt) {
      add(
        "warning",
        `Elevated error rate — ${failures} failed ${failures === 1 ? "call" : "calls"}`,
        `${pct.toFixed(0)}% of the last ${calls} calls failed, against a ${warnAt}% warning threshold.`
      );
    }
  }

  // ── Stale knowledge ──────────────────────────────────────────────
  for (const source of input.knowledge) {
    if (source.status === "disabled") continue;
    if (source.status === "error") {
      add("warning", `${source.name} failed to sync`, "The last sync of this knowledge source errored.");
      continue;
    }
    if (source.status === "not_synced") {
      add(
        "warning",
        `${source.name} has never synced`,
        "It is configured as a knowledge source but nothing has indexed it, so the solution cannot use it."
      );
      continue;
    }
    if (source.refreshDays && source.lastSyncedAt) {
      const ageDays = Math.floor((now - new Date(source.lastSyncedAt).getTime()) / DAY);
      if (ageDays > source.refreshDays) {
        add(
          "warning",
          `${source.name} is out of date`,
          `Last synced ${ageDays} days ago, against a ${source.refreshDays}-day refresh.`
        );
      }
    }
  }

  // ── Model lifecycle ──────────────────────────────────────────────
  if (input.modelDeprecatedOn) {
    const days = Math.round((new Date(input.modelDeprecatedOn).getTime() - now) / DAY);
    if (days <= 0) {
      add("critical", "Model retired", `The configured model was retired on ${input.modelDeprecatedOn}.`);
    } else {
      add("warning", "Model is being retired", `The configured model is retired on ${input.modelDeprecatedOn}, in ${days} days.`);
    }
  }

  // ── Spend ────────────────────────────────────────────────────────
  if (
    input.monthlyCostWarningMicroUsd !== null &&
    input.costThisWindowMicroUsd !== null &&
    input.costThisWindowMicroUsd > input.monthlyCostWarningMicroUsd
  ) {
    add(
      "warning",
      "Over its cost threshold",
      `Estimated spend has passed the warning threshold set on this solution.`
    );
  }

  // ── Alerts a threshold already raised ────────────────────────────
  for (const alert of input.openAlerts) {
    if (alert.severity === "critical") add("critical", alert.title, alert.detail ?? "An open critical alert.");
    else if (alert.severity === "warning") add("warning", alert.title, alert.detail ?? "An open alert.");
  }

  if (input.status === "paused") {
    add("info", "Paused", "This solution is intentionally not running.");
  }
  if (input.status === "testing") {
    add("info", "In testing", "Not yet in front of anyone.");
  }

  // ── The verdict ──────────────────────────────────────────────────
  const critical = reasons.filter((r) => r.severity === "critical").length;
  const warning = reasons.filter((r) => r.severity === "warning").length;

  if (critical > 0) return { ...base, state: "critical", label: HEALTH_LABELS.critical, reasons };
  if (warning > 0) return { ...base, state: "warning", label: HEALTH_LABELS.warning, reasons };

  // Nothing is wrong — but has it done anything? A solution with no recent
  // calls has not been found healthy; it has not been exercised. This is
  // the branch the whole file exists to protect.
  if (calls < MIN_CALLS_FOR_A_VERDICT) {
    add(
      "info",
      "Not enough recent activity",
      calls === 0
        ? `No calls recorded in the last ${OBSERVATION_WINDOW_DAYS} days, so its state is unknown rather than healthy.`
        : `Only ${calls} ${calls === 1 ? "call" : "calls"} in the last ${OBSERVATION_WINDOW_DAYS} days — too few to call it healthy.`
    );
    return { ...base, state: "unknown", label: HEALTH_LABELS.unknown, reasons };
  }

  // A provider we have never checked cannot vouch for anything either.
  if (input.provider && input.provider.status === "unknown") {
    add(
      "info",
      `${input.provider.name} has not been checked`,
      "Calls are succeeding, but the provider connection itself has not been tested recently."
    );
  }

  return { ...base, state: "healthy", label: HEALTH_LABELS.healthy, reasons };
}

export function needsAttention(state: HealthState): boolean {
  return state === "critical" || state === "warning";
}

/** Worst first, so the badge, the KPI and the sort all agree. */
export const HEALTH_RANK: Record<HealthState, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  healthy: 3,
};
