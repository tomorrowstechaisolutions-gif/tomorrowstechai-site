import "server-only";

/**
 * Website health.
 *
 * Same posture as client health: derived on every read, never stored, and
 * every verdict carries the sentence that produced it. A dot that says
 * "warning" without being able to say why is decoration.
 *
 * The hard rule here is that health is computed ONLY from facts this system
 * actually holds. Uptime, Lighthouse and deployment success are all real
 * signals — and none of them are connected yet. So a site with no monitoring
 * is not "healthy"; it is UNMONITORED, which is its own state and reads as
 * such on screen. Calling an unwatched site green is the exact lie this
 * whole admin is built to avoid.
 */

export type HealthState =
  | "healthy"
  | "warning"
  | "issue"
  | "offline"
  | "development"
  | "unmonitored"
  | "archived";

export type HealthReason = { label: string; detail: string; severity: "high" | "medium" | "low" };

export type WebsiteHealth = {
  state: HealthState;
  label: string;
  reasons: HealthReason[];
  /** True when the site is live but nothing is watching it. */
  unmonitored: boolean;
};

export type HealthInput = {
  status: string;
  isArchived: boolean;
  /** Integration rows that exist for this site, by provider. */
  integrations: { provider: string; status: string; error: string | null }[];
  /** Days until each renewal. Negative = already past. */
  renewals: { kind: string; daysUntil: number }[];
  /** Most recent production deployment, if any has ever been recorded. */
  lastDeployment: { status: string; daysAgo: number } | null;
  /** Unresolved SEO issues at critical/high severity, when this site has been audited. */
  seoCriticalIssues: number | null;
};

const LABELS: Record<HealthState, string> = {
  healthy: "Healthy",
  warning: "Warning",
  issue: "Issue",
  offline: "Offline",
  development: "In development",
  unmonitored: "Unmonitored",
  archived: "Archived",
};

/** Providers that, when connected, mean somebody would notice this site breaking. */
const WATCHERS = ["uptime", "vercel", "google_analytics"];

export function scoreWebsite(input: HealthInput): WebsiteHealth {
  const reasons: HealthReason[] = [];
  const add = (severity: HealthReason["severity"], label: string, detail: string) =>
    reasons.push({ severity, label, detail });

  // ── States that are declared, not derived ────────────────────────
  // Somebody set these deliberately; no amount of signal overrides them.
  if (input.isArchived || input.status === "archived") {
    return { state: "archived", label: LABELS.archived, reasons, unmonitored: false };
  }

  if (["development", "review", "waiting_on_client"].includes(input.status)) {
    return { state: "development", label: LABELS.development, reasons, unmonitored: false };
  }

  // ── Real problems ────────────────────────────────────────────────
  if (input.status === "issue") {
    add("high", "Marked as having an issue", "Someone flagged this site as broken.");
  }

  const errored = input.integrations.filter((i) => i.status === "error");
  for (const i of errored) {
    add("high", `${providerName(i.provider)} is erroring`, i.error ?? "The integration reported an error.");
  }

  const overdue = input.renewals.filter((r) => r.daysUntil < 0);
  for (const r of overdue) {
    add(
      "high",
      `${r.kind === "ssl" ? "SSL" : title(r.kind)} renewal is overdue`,
      `It was due ${Math.abs(r.daysUntil)} ${Math.abs(r.daysUntil) === 1 ? "day" : "days"} ago.`
    );
  }

  if (input.lastDeployment?.status === "failed") {
    add(
      "high",
      "Last deployment failed",
      `The most recent production build failed ${input.lastDeployment.daysAgo} ${input.lastDeployment.daysAgo === 1 ? "day" : "days"} ago.`
    );
  }

  // ── Things worth knowing that are not yet emergencies ────────────
  const warned = input.integrations.filter((i) => i.status === "warning");
  for (const i of warned) {
    add("medium", `${providerName(i.provider)} needs attention`, i.error ?? "The integration reported a warning.");
  }

  const soon = input.renewals.filter((r) => r.daysUntil >= 0 && r.daysUntil <= 7);
  for (const r of soon) {
    add(
      "medium",
      `${r.kind === "ssl" ? "SSL" : title(r.kind)} renews in ${r.daysUntil} ${r.daysUntil === 1 ? "day" : "days"}`,
      "Confirm the payment method and auto-renew before it lapses."
    );
  }

  if (input.seoCriticalIssues && input.seoCriticalIssues > 0) {
    add(
      "medium",
      `${input.seoCriticalIssues} serious SEO ${input.seoCriticalIssues === 1 ? "issue" : "issues"}`,
      "From the most recent audit of this site."
    );
  }

  if (input.status === "paused") {
    add("low", "Paused", "This site is intentionally not being worked on.");
  }

  if (input.status === "maintenance") {
    add("low", "In maintenance", "Scheduled or in-progress maintenance work.");
  }

  // ── The verdict ──────────────────────────────────────────────────
  const high = reasons.filter((r) => r.severity === "high").length;
  const medium = reasons.filter((r) => r.severity === "medium").length;

  if (input.status === "issue" || high > 0) {
    return {
      state: input.status === "issue" ? "offline" : "issue",
      label: input.status === "issue" ? LABELS.offline : LABELS.issue,
      reasons,
      unmonitored: false,
    };
  }

  // Nothing is wrong — but is anything actually looking? A live site with no
  // uptime check, no deployment feed and no analytics is not known to be
  // healthy. It is unobserved, and saying so is the honest answer.
  const watching = input.integrations.some(
    (i) => WATCHERS.includes(i.provider) && i.status === "connected"
  );

  if (medium > 0) {
    return { state: "warning", label: LABELS.warning, reasons, unmonitored: !watching };
  }

  if (!watching) {
    add(
      "low",
      "Nothing is monitoring this site",
      "No uptime check, deployment feed or analytics is connected, so an outage here would go unnoticed."
    );
    return { state: "unmonitored", label: LABELS.unmonitored, reasons, unmonitored: true };
  }

  return { state: "healthy", label: LABELS.healthy, reasons, unmonitored: false };
}

/** Health states that belong in the "needs attention" count. */
export function needsAttention(state: HealthState): boolean {
  return state === "issue" || state === "offline" || state === "warning";
}

function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function providerName(provider: string): string {
  const names: Record<string, string> = {
    vercel: "Vercel",
    supabase: "Supabase",
    google_analytics: "Google Analytics",
    search_console: "Search Console",
    google_business: "Google Business",
    meta_pixel: "Meta Pixel",
    stripe: "Stripe",
    resend: "Resend",
    uptime: "Uptime monitoring",
    pagespeed: "PageSpeed",
    other: "Integration",
  };
  return names[provider] ?? title(provider);
}
