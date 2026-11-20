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

/**
 * The UTC instant of a wall-clock time on a Chicago YYYY-MM-DD.
 *
 * This is the one place a Chicago date and time become an instant. Writing
 * `${date}T17:00:00-05:00` by hand is right for half the year and an hour
 * wrong for the other half; so is adding 5 to the hour, and so is
 * setHours(17) on a server whose own clock is UTC.
 */
export function chicagoInstant(isoDate: string, hours = 0, minutes = 0, seconds = 0): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hours, minutes, seconds);

  // Two passes: the first guess can land on the wrong side of a DST change,
  // in which case the offset it measured is the wrong one.
  const first = offsetMinutes(new Date(guess));
  let ts = guess - first * 60000;
  const second = offsetMinutes(new Date(ts));
  if (second !== first) ts = guess - second * 60000;

  return new Date(ts);
}

/** The UTC instant of 00:00 local on a YYYY-MM-DD. */
export function zonedMidnightUtc(isoDate: string): Date {
  return chicagoInstant(isoDate);
}

/** A YYYY-MM-DD moved by whole calendar days. Pure date maths, no clock. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The first instant AFTER a Chicago day: midnight at the start of the next
 * one. "Due on the 25th" and "valid until the 25th" both run to here, and
 * `at < chicagoDayEnd(day)` is the test for "still on that day".
 */
export function chicagoDayEnd(isoDate: string): Date {
  return chicagoInstant(addDays(isoDate, 1));
}

/**
 * The current instant, in epoch milliseconds.
 *
 * Server components read the clock through this, once per request, and hand
 * the number down as a prop — so nothing below them calls Date.now() while
 * rendering.
 */
export function nowMs(): number {
  return Date.now();
}

/** YYYY-MM-DD in Chicago, `days` days after `from` (epoch ms, default now). */
export function chicagoDateInDays(days: number, from: number = nowMs()): string {
  return chicagoDate(new Date(from + days * 86_400_000));
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
