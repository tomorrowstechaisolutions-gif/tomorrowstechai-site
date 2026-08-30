import "server-only";

/**
 * Month boundaries for the executive KPIs, resolved in America/Chicago.
 *
 * The comparison is month-to-date against the SAME NUMBER OF DAYS of the
 * previous month, not against the whole of last month. On the 3rd, comparing
 * three days of revenue to thirty-one would show a 90% collapse every month
 * and the card would be worse than useless.
 */

const TZ = "America/Chicago";

/** Minutes the zone is ahead of UTC at a given instant (negative for Chicago). */
function offsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
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
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export type Period = {
  label: string;
  /** Inclusive YYYY-MM-DD bounds — for date columns like campaign_spend.date. */
  fromDate: string;
  toDate: string;
  /** Half-open UTC instants — for timestamptz columns. from <= t < to. */
  fromIso: string;
  toIso: string;
  /** Days elapsed, inclusive. Used to prorate month-end projections. */
  days: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function build(label: string, fromDate: string, toDate: string): Period {
  const from = zonedMidnightUtc(fromDate);
  // Half-open: midnight at the START of the day after toDate.
  const [ty, tm, td] = toDate.split("-").map(Number);
  const nextDay = new Date(Date.UTC(ty, tm - 1, td + 1));
  const to = zonedMidnightUtc(
    `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-${pad(nextDay.getUTCDate())}`
  );

  return {
    label,
    fromDate,
    toDate,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    days: Math.round((to.getTime() - from.getTime()) / 86400_000),
  };
}

export type MonthPair = {
  current: Period;
  /** The same slice of the previous month, so the delta is like-for-like. */
  previous: Period;
  /** Whole current month, for the end-of-month projection. */
  daysInCurrentMonth: number;
};

export function monthToDate(now: Date = new Date()): MonthPair {
  const today = chicagoDate(now);
  const [y, m, d] = today.split("-").map(Number);

  const current = build(
    "This month",
    `${y}-${pad(m)}-01`,
    today
  );

  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  // Clamp: comparing 31 March to "31 February" has to land on the 28th/29th.
  const prevD = Math.min(d, daysInMonth(prevY, prevM));

  const previous = build(
    "Same period last month",
    `${prevY}-${pad(prevM)}-01`,
    `${prevY}-${pad(prevM)}-${pad(prevD)}`
  );

  return { current, previous, daysInCurrentMonth: daysInMonth(y, m) };
}

/** Rolling window ending today, e.g. lastNDays(30). */
export function lastNDays(n: number, now: Date = new Date()): Period {
  const today = chicagoDate(now);
  const [y, m, d] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - (n - 1)));
  return build(
    `Last ${n} days`,
    `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`,
    today
  );
}

/** Today only, in Chicago. */
export function todayPeriod(now: Date = new Date()): Period {
  const today = chicagoDate(now);
  return build("Today", today, today);
}

/**
 * Percentage change, or null when there is nothing to compare against.
 * Never Infinity, never a triumphant "+100%" invented out of a zero.
 */
export function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
