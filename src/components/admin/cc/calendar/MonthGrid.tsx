import Link from "next/link";
import { BUSINESS_TIMEZONE, CATEGORY_TONE } from "@/lib/calendar/config";
import type { CalendarItem } from "@/lib/calendar/types";

/**
 * The month view.
 *
 * Six even rows, always — the window is built Sunday-to-Saturday across whole
 * weeks so the grid never has a ragged first line. Three items per day, then
 * a count, because a cell that lists everything stops being scannable at
 * exactly the point a busy month needs it to be.
 */

const MAX_PER_DAY = 3;

function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE })
    .format(new Date(iso));
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit",
  }).replace(":00", "");
}

export default function MonthGrid({
  days,
  items,
  today,
  anchor,
  itemHref,
  dayHref,
}: {
  days: string[];
  items: CalendarItem[];
  today: string;
  anchor: string;
  itemHref: (item: CalendarItem) => string;
  dayHref: (day: string) => string;
}) {
  const byDay = new Map<string, CalendarItem[]>();
  for (const entry of items) {
    const key = dayOf(entry.start);
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  const month = anchor.slice(0, 7);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="cal-month">
      <div className="cal-month-head">
        {weekdays.map((label) => <span key={label}>{label}</span>)}
      </div>

      <div className="cal-month-grid">
        {days.map((day) => {
          const dayItems = byDay.get(day) ?? [];
          const visible = dayItems.slice(0, MAX_PER_DAY);
          const hidden = dayItems.length - visible.length;
          const outside = day.slice(0, 7) !== month;

          return (
            <div
              key={day}
              className={`cal-month-cell ${outside ? "is-outside" : ""} ${day === today ? "is-today" : ""}`}
            >
              <Link href={dayHref(day)} scroll={false} className="cal-month-date">
                {Number(day.slice(8, 10))}
                {dayItems.length > 0 ? <b>{dayItems.length}</b> : null}
              </Link>

              <div className="cal-month-items">
                {visible.map((entry) => (
                  <Link
                    key={entry.id}
                    href={itemHref(entry)}
                    scroll={false}
                    className={`cal-mini ${CATEGORY_TONE[entry.category]} ${
                      entry.status === "completed" ? "is-done" : ""
                    }`}
                    title={`${entry.title}${entry.subtitle ? ` — ${entry.subtitle}` : ""}`}
                  >
                    {!entry.allDay ? <i>{clock(entry.start)}</i> : null}
                    {entry.title}
                  </Link>
                ))}

                {hidden > 0 ? (
                  <Link href={dayHref(day)} scroll={false} className="cal-more">
                    + {hidden} more
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
