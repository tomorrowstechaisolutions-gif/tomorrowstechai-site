import "server-only";
import { HEALTH_LABELS, type HealthState, type LifecycleStatus } from "./types";

/**
 * Software product health.
 *
 * Same posture as app, website and client health: derived on every read,
 * never stored on the product row, and every verdict carries the sentences
 * that produced it. A dot that says "critical" without being able to say why
 * is decoration.
 *
 * WHERE IT COMES FROM. A product is not a thing that can be pinged — its
 * APPS are. So this file does not re-implement app health; it AGGREGATES the
 * verdicts lib/apps/health already produced, and adds the four signals that
 * are the product's own rather than any one app's:
 *
 *   · a release that is blocked, or overdue and not shipped
 *   · a client whose onboarding is overdue
 *   · a client whose billing has failed
 *   · a critical issue open against the product
 *
 * THE RULE THIS FILE EXISTS TO PROTECT: missing data is never Healthy. A
 * product whose apps have never been checked has not been found to be fine;
 * nothing has looked at it. A product with NO apps linked at all is Unknown,
 * not green — there is nothing to be healthy about yet.
 */

export type ReasonSeverity = "critical" | "warning" | "info";

export type HealthReason = {
  label: string;
  detail: string;
  severity: ReasonSeverity;
  /** Which tab of the detail page answers this. */
  tab?: string;
};

export type SoftwareHealth = {
  state: HealthState;
  label: string;
  reasons: HealthReason[];
  /** True when at least one linked app has a real, recent health verdict. */
  observed: boolean;
  /** How many linked apps are in each state. */
  appStates: Record<HealthState, number>;
};

/** One linked app's already-computed verdict. */
export type LinkedAppHealth = {
  id: string;
  name: string;
  state: HealthState;
  /** Whether anything actually checked it recently. */
  observed: boolean;
  /** Live apps carry more weight than one still in planning. */
  isProduction: boolean;
  topReason: string | null;
};

export type SoftwareHealthInput = {
  lifecycleStatus: LifecycleStatus;
  isArchived: boolean;
  apps: LinkedAppHealth[];
  /** Releases that are blocked or past their target date and not shipped. */
  blockedReleases: { name: string; reason: string | null }[];
  overdueReleases: { name: string; targetDate: string; daysLate: number }[];
  /** Clients whose onboarding passed its due date and is not complete. */
  overdueOnboarding: { client: string; daysLate: number }[];
  /** Clients in past_due. */
  pastDueClients: { client: string }[];
  /** Open tasks against this product with priority = critical. */
  criticalIssues: number;
  /** Total non-canceled clients, so "past due" can be read as a share. */
  totalClients: number;
};

export function scoreSoftware(input: SoftwareHealthInput): SoftwareHealth {
  const reasons: HealthReason[] = [];
  const add = (severity: ReasonSeverity, label: string, detail: string, tab?: string) =>
    reasons.push({ severity, label, detail, tab });

  const appStates: Record<HealthState, number> = {
    healthy: 0, warning: 0, critical: 0, unknown: 0,
  };
  for (const app of input.apps) appStates[app.state] += 1;

  const observed = input.apps.some((app) => app.observed);

  // ── Declared states win over everything ──────────────────────────
  // Somebody set these deliberately. No signal overrides an archived
  // product, and one that has not been built yet is not a health problem.
  if (input.isArchived || input.lifecycleStatus === "archived") {
    return {
      state: "unknown",
      label: HEALTH_LABELS.unknown,
      reasons: [{ severity: "info", label: "Archived", detail: "This product is no longer monitored." }],
      observed,
      appStates,
    };
  }

  // ── Critical ─────────────────────────────────────────────────────
  for (const app of input.apps) {
    if (app.state !== "critical") continue;
    add(
      "critical",
      `${app.name} is critical`,
      app.topReason ?? "The app behind this product is reporting a critical failure.",
      "apps"
    );
  }

  if (input.criticalIssues > 0) {
    add(
      "critical",
      input.criticalIssues === 1 ? "A critical issue is open" : `${input.criticalIssues} critical issues are open`,
      "Unresolved work marked critical against this product.",
      "issues"
    );
  }

  for (const release of input.blockedReleases) {
    add(
      "critical",
      `${release.name} is blocked`,
      release.reason ?? "The release is blocked and no reason was recorded.",
      "releases"
    );
  }

  // ── Warning ──────────────────────────────────────────────────────
  for (const app of input.apps) {
    if (app.state !== "warning") continue;
    add("warning", `${app.name} is degraded`, app.topReason ?? "The app reported a warning.", "apps");
  }

  for (const release of input.overdueReleases) {
    add(
      "warning",
      `${release.name} is overdue`,
      `Target date was ${release.daysLate} ${release.daysLate === 1 ? "day" : "days"} ago and it has not shipped.`,
      "releases"
    );
  }

  for (const onboarding of input.overdueOnboarding) {
    add(
      "warning",
      `${onboarding.client} onboarding is overdue`,
      `${onboarding.daysLate} ${onboarding.daysLate === 1 ? "day" : "days"} past the date it was due to be live.`,
      "clients"
    );
  }

  if (input.pastDueClients.length > 0) {
    const names = input.pastDueClients.map((c) => c.client).join(", ");
    // Concentration matters: one past-due client out of twenty is a chase,
    // half the book is a different problem, and the sentence says which.
    const share = input.totalClients > 0
      ? Math.round((input.pastDueClients.length / input.totalClients) * 100)
      : 0;
    add(
      "warning",
      input.pastDueClients.length === 1
        ? "A subscription payment has failed"
        : `${input.pastDueClients.length} subscription payments have failed`,
      input.totalClients > 0 && share >= 25
        ? `${names} — that is ${share}% of this product's clients.`
        : names,
      "clients"
    );
  }

  // ── Worth knowing ────────────────────────────────────────────────
  if (input.lifecycleStatus === "paused") {
    add("info", "Paused", "This product is intentionally not being worked on.");
  }
  if (input.lifecycleStatus === "deprecated") {
    add("info", "Deprecated", "This product is being wound down. Existing clients still count.");
  }

  const unknownApps = appStates.unknown;
  if (unknownApps > 0) {
    add(
      "info",
      unknownApps === 1 ? "One app has no health data" : `${unknownApps} apps have no health data`,
      "Nothing has checked them recently, so their state is Unknown rather than healthy.",
      "apps"
    );
  }

  // ── The verdict ──────────────────────────────────────────────────
  const critical = reasons.filter((r) => r.severity === "critical").length;
  const warning = reasons.filter((r) => r.severity === "warning").length;

  if (critical > 0) {
    return { state: "critical", label: HEALTH_LABELS.critical, reasons, observed, appStates };
  }
  if (warning > 0) {
    return { state: "warning", label: HEALTH_LABELS.warning, reasons, observed, appStates };
  }

  // Nothing is wrong — but did anything actually look? This is the branch
  // the whole file exists to protect.
  if (input.apps.length === 0) {
    add(
      "info",
      "No apps linked",
      "This product has no applications linked to it yet, so there is nothing to measure. Link the apps it is built from and their health rolls up here.",
      "apps"
    );
    return { state: "unknown", label: HEALTH_LABELS.unknown, reasons, observed, appStates };
  }

  if (!observed) {
    add(
      "info",
      "No health data",
      "Nothing has checked this product's apps recently, so its state is unknown rather than healthy. Run the checks from the Apps screen to find out.",
      "apps"
    );
    return { state: "unknown", label: HEALTH_LABELS.unknown, reasons, observed, appStates };
  }

  return { state: "healthy", label: HEALTH_LABELS.healthy, reasons, observed, appStates };
}

/** Health states that belong in the "needs attention" count. */
export function needsAttention(state: HealthState): boolean {
  return state === "critical" || state === "warning";
}

/** Worst-first, so the badge and the KPI agree on which product is worse. */
export const HEALTH_RANK: Record<HealthState, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  healthy: 3,
};
