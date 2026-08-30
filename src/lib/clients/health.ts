import "server-only";

/**
 * Client health.
 *
 * Not stored — computed from facts that already exist, every time it is
 * shown. A stored score is a number that was true once, and the moment an
 * invoice is paid or a project ships it becomes a lie that nothing corrects.
 *
 * It starts at 100 and only ever subtracts, for one reason: every point taken
 * off has a sentence attached naming what took it. A score you cannot explain
 * to the client whose account it describes is not worth showing, so the UI
 * shows the reasons alongside the number.
 *
 * Nothing in here is a guess about sentiment. Late money, late delivery,
 * silence and a low rating the client actually gave — that is the whole list.
 */

export type HealthReason = { label: string; points: number };

export type ClientHealth = {
  score: number;
  band: "excellent" | "good" | "average" | "poor";
  bandLabel: string;
  reasons: HealthReason[];
  /** True when nothing has gone wrong AND nothing has been measured either. */
  untested: boolean;
};

export type HealthInput = {
  status: "active" | "paused" | "churned";
  /** Invoices still unpaid, with how long they have been out and whether the link died. */
  openInvoices: { daysOut: number; expired: boolean }[];
  /** Projects not yet complete, with days past their promised date (negative = still in time). */
  projects: { daysLate: number }[];
  /** Days since anything at all happened on this account. Null = nothing ever has. */
  daysSinceActivity: number | null;
  /** Most recent rating the client gave, 1-5. Null = never asked. */
  latestRating: number | null;
};

const BANDS = [
  { min: 80, band: "excellent" as const, label: "Excellent" },
  { min: 60, band: "good" as const, label: "Good" },
  { min: 40, band: "average" as const, label: "Average" },
  { min: 0, band: "poor" as const, label: "Poor" },
];

export function scoreClient(input: HealthInput): ClientHealth {
  const reasons: HealthReason[] = [];
  const take = (points: number, label: string) => {
    if (points > 0) reasons.push({ label, points: -points });
  };

  // ── Money they owe ───────────────────────────────────────────────
  const expired = input.openInvoices.filter((i) => i.expired).length;
  const stale = input.openInvoices.filter((i) => !i.expired && i.daysOut >= 7).length;

  if (expired > 0) {
    take(
      Math.min(expired * 20, 30),
      `${expired} checkout link${expired === 1 ? " has" : "s have"} expired unpaid`
    );
  }
  if (stale > 0) {
    take(
      Math.min(stale * 15, 30),
      `${stale} invoice${stale === 1 ? "" : "s"} unpaid for over a week`
    );
  }

  // ── Work we owe them ─────────────────────────────────────────────
  const late = input.projects.filter((p) => p.daysLate > 0);
  if (late.length > 0) {
    const worst = Math.max(...late.map((p) => p.daysLate));
    take(
      Math.min(late.length * 20, 30),
      `${late.length} project${late.length === 1 ? " is" : "s are"} past the promised date` +
        (worst >= 7 ? ` (worst by ${worst} days)` : "")
    );
  }

  // ── The subscription ─────────────────────────────────────────────
  if (input.status === "paused") {
    take(25, "Subscription payment is failing");
  } else if (input.status === "churned") {
    take(60, "Cancelled");
  }

  // ── Silence ──────────────────────────────────────────────────────
  // Only counts against an account once there has been something to be
  // silent about. A client won yesterday is not being neglected.
  if (input.daysSinceActivity !== null) {
    if (input.daysSinceActivity >= 90) {
      take(20, `No contact in ${input.daysSinceActivity} days`);
    } else if (input.daysSinceActivity >= 60) {
      take(12, `No contact in ${input.daysSinceActivity} days`);
    } else if (input.daysSinceActivity >= 30) {
      take(6, `No contact in ${input.daysSinceActivity} days`);
    }
  }

  // ── What they told us ────────────────────────────────────────────
  if (input.latestRating !== null) {
    if (input.latestRating <= 2) take(30, `Rated ${input.latestRating} out of 5`);
    else if (input.latestRating === 3) take(12, "Rated 3 out of 5");
  }

  // `points` are already negative, so this adds the deductions.
  const deducted = reasons.reduce((total, r) => total + r.points, 0);
  const score = Math.max(0, Math.min(100, 100 + deducted));
  const band = BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];

  return {
    score,
    band: band.band,
    bandLabel: band.label,
    reasons,
    // A perfect score on an account nobody has asked and nothing has tested
    // is worth marking as such, so it isn't read as proof they are happy.
    untested:
      reasons.length === 0 &&
      input.latestRating === null &&
      input.openInvoices.length === 0 &&
      input.projects.length === 0,
  };
}

export const HEALTH_BANDS = BANDS;
