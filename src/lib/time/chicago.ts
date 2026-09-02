/**
 * The business clock.
 *
 * Deliberately NOT marked server-only: the calendar's grid, its toolbar and
 * its date navigation all run in the browser and need exactly these two
 * answers — what day is it in Chicago, and when does a given Chicago day
 * start. A second implementation for the client is how a calendar and a
 * dashboard end up disagreeing about when Sunday begins.
 *
 * Central is UTC-5 in daylight time and UTC-6 in standard time, so every
 * conversion measures the offset for the date in question rather than
 * assuming one. src/lib/dashboard/period.ts re-exports these, so the existing
 * server-side callers are unchanged.
 */

export const BUSINESS_TZ = "America/Chicago";

/** Minutes the zone is ahead of UTC at a given instant (negative for Chicago). */
export function offsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000;
}

/** The UTC instant of 00:00 local on a YYYY-MM-DD. */
export function zonedMidnightUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);

  // Two passes: the first guess can land on the wrong side of a DST change,
  // in which case the offset it measured is the wrong one.
  const first = offsetMinutes(new Date(guess));
  let ts = guess - first * 60000;
  const second = offsetMinutes(new Date(ts));
  if (second !== first) ts = guess - second * 60000;

  return new Date(ts);
}

/** YYYY-MM-DD for an instant, in Chicago. */
export function chicagoDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
