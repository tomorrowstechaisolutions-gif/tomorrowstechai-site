/**
 * Date-range handling for the campaign dashboard.
 *
 * Everything is resolved in America/Chicago, the business's timezone. Ad spend
 * rows are plain dates, leads are timestamps — comparing them in UTC would put
 * evening leads on the wrong day and quietly skew cost-per-lead.
 */

export const RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "custom", label: "Custom" },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"];

const TZ = "America/Chicago";

/** YYYY-MM-DD for a moment, in the business timezone. */
export function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function shiftDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export type ResolvedRange = {
  key: RangeKey;
  /** Inclusive YYYY-MM-DD bounds, used for campaign_spend.date. */
  fromDate: string;
  toDate: string;
  /** Half-open timestamp bounds, used for leads/revenue created_at. */
  fromTs: string;
  toTs: string;
  label: string;
};

export function resolveRange(
  key: string | undefined,
  from?: string,
  to?: string
): ResolvedRange {
  const today = localDate(new Date());
  const valid = RANGE_PRESETS.some((p) => p.key === key);
  const rangeKey = (valid ? key : "30d") as RangeKey;

  let fromDate = today;
  let toDate = today;

  switch (rangeKey) {
    case "today":
      break;
    case "yesterday":
      fromDate = shiftDays(today, -1);
      toDate = fromDate;
      break;
    case "7d":
      fromDate = shiftDays(today, -6);
      break;
    case "30d":
      fromDate = shiftDays(today, -29);
      break;
    case "custom": {
      const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
      fromDate = isDate(from) ? from! : shiftDays(today, -29);
      toDate = isDate(to) ? to! : today;
      if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
      break;
    }
  }

  // Chicago is UTC-6 (CST) or UTC-5 (CDT). Widening the timestamp window by a
  // day on each side and filtering exactly in SQL would be heavier than this
  // is worth; the ±1 day pad is trimmed in-process by comparing local dates.
  const fromTs = `${shiftDays(fromDate, -1)}T00:00:00.000Z`;
  const toTs = `${shiftDays(toDate, 2)}T00:00:00.000Z`;

  const label =
    RANGE_PRESETS.find((p) => p.key === rangeKey)?.label ??
    `${fromDate} → ${toDate}`;

  return { key: rangeKey, fromDate, toDate, fromTs, toTs, label };
}

/** True when a timestamp falls inside the range, judged in Chicago time. */
export function inRange(timestamp: string, range: ResolvedRange): boolean {
  const d = localDate(new Date(timestamp));
  return d >= range.fromDate && d <= range.toDate;
}

/** Rough device class from a user agent — enough to split mobile from desktop,
 *  which is the only cut that matters for Meta traffic. */
export function deviceFromUserAgent(ua: string | null): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|iphone|android/.test(s)) return "mobile";
  return "desktop";
}
