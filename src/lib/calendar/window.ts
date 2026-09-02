import { chicagoDate, zonedMidnightUtc } from "@/lib/time/chicago";
import type { CalendarView } from "./config";
import type { CalendarWindow } from "./types";

/**
 * The visible date range, in the business timezone.
 *
 * Everything the calendar fetches is bounded by one of these. The page never
 * asks for "all events" — a week view fetches a week, and that is what keeps
 * the query cheap however many years of history accumulate.
 */

/**
 * Chicago day boundaries.
 *
 * The same two functions the dashboard uses, from the same module. They
 * handle the two days a year when Central changes offset; a second
 * implementation here is how the calendar and the dashboard would end up
 * disagreeing about when Sunday starts.
 */
export const chicagoDay = chicagoDate;
export const startOfDay = zonedMidnightUtc;

export function addDays(day: string, count: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + count));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  for (let guard = 0; guard < 400 && cursor < to; guard += 1) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function labelFor(view: CalendarView, days: string[]): string {
  const fmt = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts })
      .format(new Date(`${day}T12:00:00Z`));

  const first = days[0];
  const last = days[days.length - 1];

  if (view === "day") return fmt(first, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (view === "month") return fmt(first, { month: "long", year: "numeric" });

  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return sameMonth
    ? `${fmt(first, { month: "short", day: "numeric" })} – ${fmt(last, { day: "numeric", year: "numeric" })}`
    : `${fmt(first, { month: "short", day: "numeric" })} – ${fmt(last, { month: "short", day: "numeric", year: "numeric" })}`;
}

/**
 * Builds the window for a view anchored on a date.
 *
 * The month view deliberately runs Sunday-to-Saturday across whole weeks, so
 * the grid is always six even rows rather than a ragged first line.
 */
export function buildWindow(view: CalendarView, anchor: string): CalendarWindow {
  const [y, m, d] = anchor.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));

  let fromDay: string;
  let toDay: string;

  if (view === "day") {
    fromDay = anchor;
    toDay = addDays(anchor, 1);
  } else if (view === "week") {
    fromDay = addDays(anchor, -probe.getUTCDay());
    toDay = addDays(fromDay, 7);
  } else if (view === "month") {
    const firstOfMonth = `${anchor.slice(0, 7)}-01`;
    const firstProbe = new Date(`${firstOfMonth}T12:00:00Z`);
    fromDay = addDays(firstOfMonth, -firstProbe.getUTCDay());
    toDay = addDays(fromDay, 42);
  } else {
    // Agenda: from today forward, four weeks.
    fromDay = anchor;
    toDay = addDays(anchor, 28);
  }

  const days = daysBetween(fromDay, toDay);

  return {
    fromIso: startOfDay(fromDay).toISOString(),
    toIso: startOfDay(toDay).toISOString(),
    days: view === "agenda" ? days : days,
    label: labelFor(view, days),
  };
}

/** Moves the anchor one view-length forward or back. */
export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week" || view === "agenda") return addDays(anchor, 7 * direction);

  const [y, m] = anchor.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1 + direction, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
