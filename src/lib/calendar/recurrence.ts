/**
 * RRULE expansion, kept deliberately small.
 *
 * Handles what the New Event form can build — FREQ, INTERVAL, BYDAY, COUNT,
 * UNTIL for daily, weekly and monthly rules — and ignores the rest of RFC
 * 5545 rather than pretending to implement it. A rule this cannot expand
 * still stores and still exports; it just shows once, on its start date.
 *
 * No dependency: this is date arithmetic, and the alternative was a library
 * the build machine cannot fetch.
 *
 * Occurrences are only ever generated inside the window being viewed, so an
 * event repeating forever costs the same as one repeating for a month.
 */

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MAX_OCCURRENCES = 400;

type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  interval: number;
  byDay: number[];
  count: number | null;
  until: Date | null;
};

function parseRule(rule: string): Rule {
  const parts = new Map<string, string>();
  for (const chunk of rule.split(";")) {
    const [key, value] = chunk.split("=");
    if (key && value) parts.set(key.trim().toUpperCase(), value.trim());
  }

  const freq = parts.get("FREQ")?.toUpperCase();
  const interval = Number.parseInt(parts.get("INTERVAL") ?? "1", 10);
  const count = parts.has("COUNT") ? Number.parseInt(parts.get("COUNT")!, 10) : null;

  const untilRaw = parts.get("UNTIL");
  let until: Date | null = null;
  if (untilRaw) {
    // Both the basic 20260930T170000Z form and a plain ISO string.
    const normalised = /^\d{8}T\d{6}Z$/.test(untilRaw)
      ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}T${untilRaw.slice(9, 11)}:${untilRaw.slice(11, 13)}:${untilRaw.slice(13, 15)}Z`
      : untilRaw;
    const parsed = new Date(normalised);
    if (!Number.isNaN(parsed.getTime())) until = parsed;
  }

  return {
    freq: freq === "DAILY" || freq === "WEEKLY" || freq === "MONTHLY" ? freq : null,
    interval: Number.isFinite(interval) && interval > 0 ? Math.min(interval, 52) : 1,
    byDay: (parts.get("BYDAY") ?? "")
      .split(",")
      .map((code) => DAY_CODES.indexOf(code.trim().toUpperCase()))
      .filter((index) => index >= 0),
    count: Number.isFinite(count as number) && (count as number) > 0 ? count : null,
    until,
  };
}

/**
 * Every start instant this event has inside [windowFrom, windowTo).
 *
 * Returns the original start when there is no rule, so callers never need to
 * branch on whether an event repeats.
 */
export function expandOccurrences(input: {
  start: Date;
  durationMs: number;
  rule: string | null;
  recurrenceUntil: Date | null;
  windowFrom: Date;
  windowTo: Date;
}): Date[] {
  const { start, durationMs, windowFrom, windowTo } = input;

  if (!input.rule) {
    // A span that started before the window but runs into it still shows.
    return start.getTime() + durationMs > windowFrom.getTime() &&
           start.getTime() < windowTo.getTime()
      ? [start]
      : [];
  }

  const rule = parseRule(input.rule);
  if (!rule.freq) return start < windowTo ? [start] : [];

  const hardStop = [rule.until, input.recurrenceUntil]
    .filter((date): date is Date => Boolean(date))
    .reduce<Date | null>((earliest, date) =>
      !earliest || date < earliest ? date : earliest, null);

  const out: Date[] = [];
  const cursor = new Date(start);
  let produced = 0;

  for (let guard = 0; guard < MAX_OCCURRENCES; guard += 1) {
    if (hardStop && cursor > hardStop) break;
    if (rule.count !== null && produced >= rule.count) break;
    if (cursor.getTime() >= windowTo.getTime()) break;

    // Weekly rules with BYDAY produce several days per interval week.
    if (rule.freq === "WEEKLY" && rule.byDay.length > 0) {
      const weekStart = new Date(cursor);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      for (const day of rule.byDay) {
        const at = new Date(weekStart);
        at.setDate(weekStart.getDate() + day);
        at.setHours(start.getHours(), start.getMinutes(), 0, 0);

        if (at < start) continue;
        if (hardStop && at > hardStop) continue;
        if (rule.count !== null && produced >= rule.count) break;
        produced += 1;
        if (at.getTime() + durationMs > windowFrom.getTime() && at < windowTo) {
          out.push(at);
        }
      }
      cursor.setDate(cursor.getDate() + 7 * rule.interval);
      continue;
    }

    produced += 1;
    if (cursor.getTime() + durationMs > windowFrom.getTime()) {
      out.push(new Date(cursor));
    }

    if (rule.freq === "DAILY") cursor.setDate(cursor.getDate() + rule.interval);
    else if (rule.freq === "WEEKLY") cursor.setDate(cursor.getDate() + 7 * rule.interval);
    else cursor.setMonth(cursor.getMonth() + rule.interval);
  }

  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** "Weekly", "Every 2 weeks" — for the drawer, where the rule is read not written. */
export function describeRule(rule: string | null): string | null {
  if (!rule) return null;
  const parsed = parseRule(rule);
  if (!parsed.freq) return "Repeats";

  const unit = parsed.freq === "DAILY" ? "day" : parsed.freq === "WEEKLY" ? "week" : "month";
  const every = parsed.interval === 1 ? `Every ${unit}` : `Every ${parsed.interval} ${unit}s`;
  const days = parsed.byDay.length
    ? ` on ${parsed.byDay.map((index) => DAY_CODES[index]).join(", ")}`
    : "";
  const ends = parsed.count ? `, ${parsed.count} times` : "";
  return `${every}${days}${ends}`;
}
