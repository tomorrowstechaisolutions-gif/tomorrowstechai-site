/**
 * How many days of daily social posts are left, and when to tell John.
 * The arithmetic only; runway.ts reads the database and sends the alert.
 */

/** John is told once as the days left fall to each of these. */
export const RUNWAY_THRESHOLDS = [14, 7, 1] as const;

const DAY_MS = 86_400_000;

/** The Central calendar day of an instant, as a day number (days since 1970). */
function centralDay(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.round(Date.UTC(n("year"), n("month") - 1, n("day")) / DAY_MS);
}

/**
 * Whole Central calendar days from today to the last scheduled post.
 * 0 when that post is today, already past, or there is none.
 */
export function daysOfRunway(scheduledAt: string[], now: Date): number {
  const times = scheduledAt.map((s) => new Date(s).getTime()).filter((t) => Number.isFinite(t));
  if (!times.length) return 0;
  return Math.max(0, centralDay(new Date(Math.max(...times))) - centralDay(now));
}

/** Which alert a count of days belongs to: 14 covers 14 down to 8, 7 covers 7 down to 2, 1 covers the last two days. */
export function runwayBand(days: number): (typeof RUNWAY_THRESHOLDS)[number] | null {
  if (days <= 1) return 1;
  if (days <= 7) return 7;
  if (days <= 14) return 14;
  return null;
}

/** How far back an earlier alert for the same band still counts as "already told". */
const LOOKBACK_DAYS: Record<number, number> = { 14: 7, 7: 7, 1: 3 };

function summaryFor(days: number): string {
  if (days <= 0) return "The last daily social post goes out today. Nothing is scheduled after it.";
  if (days === 1) return "The last daily social post goes out tomorrow. Nothing is scheduled after it.";
  return `Daily social posts run out in ${days} days. Time to build the next batch.`;
}

/** The band an alert that was sent earlier belonged to, read back from its wording. */
function bandOfSummary(summary: string | null): number | null {
  const m = /run out in (\d+) days/.exec(summary ?? "");
  if (m) return runwayBand(Number(m[1]));
  return /goes out (tomorrow|today)/.test(summary ?? "") ? 1 : null;
}

/**
 * The alert to send now, or null when nothing needs saying.
 *
 * An alert goes out the first time the count is inside a band, not only on
 * the exact day: if the check missed day 14, day 13 still says so, and if
 * canceling posts drops the count from 15 to 5, the 7-day alert still fires.
 * `recentSent` is the log of alerts already sent, so a band is told once.
 * With nothing scheduled at all there is nothing to count down, so it stays quiet.
 */
export function runwayAlert(
  days: number,
  hasUpcoming: boolean,
  recentSent: { summary: string | null; created_at: string }[],
  now: Date
): { threshold: number; summary: string } | null {
  if (!hasUpcoming) return null;
  const band = runwayBand(days);
  if (band === null) return null;
  const since = now.getTime() - LOOKBACK_DAYS[band] * DAY_MS;
  const told = recentSent.some((r) => bandOfSummary(r.summary) === band && new Date(r.created_at).getTime() >= since);
  return told ? null : { threshold: band, summary: summaryFor(days) };
}
