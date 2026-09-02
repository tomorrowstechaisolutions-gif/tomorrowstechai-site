"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CATEGORY_TONE, GRID_END_HOUR, GRID_START_HOUR, BUSINESS_TIMEZONE,
} from "@/lib/calendar/config";
import type { CalendarItem } from "@/lib/calendar/types";
import { itemHref } from "@/lib/calendar/links";

/**
 * The week and day time grid.
 *
 * Hand-built rather than a calendar library: the build machine that maintains
 * this repo has no package-registry access, and what this needs is arithmetic
 * on minutes plus a drop handler. A library would also have brought its own
 * look, which is the one thing this screen must not have.
 *
 * Dragging an event calls the same server action the drawer's Reschedule
 * button calls, and that action writes to whichever table owns the date. The
 * card moves optimistically and snaps back with an explanation if the write
 * is refused — a proposal's expiry and an automated follow-up are meant to
 * refuse, and silence would look like a bug.
 */

const PX_PER_MINUTE = 1.05;
const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR + 1 },
  (_, index) => GRID_START_HOUR + index
);

/** Minutes past midnight, in the business timezone. */
function minutesOfDay(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE })
    .format(new Date(iso));
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit",
  });
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

function dayHeading(day: string): { weekday: string; date: string } {
  const at = new Date(`${day}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(at),
    date: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(at),
  };
}

/** Side-by-side placement for events that overlap in time. */
function packColumns(items: CalendarItem[]): Map<string, { column: number; of: number }> {
  const placed = new Map<string, { column: number; of: number }>();
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  let cluster: CalendarItem[] = [];
  let clusterEnd = 0;

  const flush = () => {
    const columns: CalendarItem[][] = [];
    for (const entry of cluster) {
      const start = minutesOfDay(entry.start);
      const column = columns.findIndex((lane) => {
        const last = lane[lane.length - 1];
        const lastEnd = last.end ? minutesOfDay(last.end) : minutesOfDay(last.start) + 30;
        return lastEnd <= start;
      });
      if (column === -1) columns.push([entry]);
      else columns[column].push(entry);
    }
    for (const [index, lane] of columns.entries()) {
      for (const entry of lane) placed.set(entry.id, { column: index, of: columns.length });
    }
    cluster = [];
  };

  for (const entry of sorted) {
    const start = minutesOfDay(entry.start);
    const end = entry.end ? minutesOfDay(entry.end) : start + 30;
    if (cluster.length > 0 && start >= clusterEnd) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();

  return placed;
}

export default function TimeGrid({
  days,
  items,
  today,
  query,
  rescheduleAction,
}: {
  days: string[];
  items: CalendarItem[];
  today: string;
  /** The page's current search string. A function prop would not survive
   *  the trip from the server component that renders this one. */
  query: string;
  rescheduleAction: (formData: FormData) => void | Promise<void>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [now, setNow] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, { day: string; minutes: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // The current-time line. Rendered only after mount so the server and the
  // browser cannot disagree about what "now" is during hydration.
  useEffect(() => {
    const tick = () => setNow(minutesOfDay(new Date().toISOString()));
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Open on the working day rather than at 7am with the morning empty.
  useEffect(() => {
    const element = scroller.current;
    if (!element || now === null) return;
    const offset = (Math.max(0, now - GRID_START_HOUR * 60 - 90)) * PX_PER_MINUTE;
    element.scrollTop = Math.min(offset, element.scrollHeight);
    // Only on first paint; re-scrolling every minute would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now !== null]);

  const timed = useMemo(() => items.filter((entry) => !entry.allDay), [items]);
  const allDay = useMemo(() => items.filter((entry) => entry.allDay), [items]);

  const placedOn = (day: string) => {
    const forDay = timed.filter((entry) => {
      const override = moved[entry.id];
      return (override ? override.day : dayOf(entry.start)) === day;
    });
    return { forDay, lanes: packColumns(forDay) };
  };

  const drop = (day: string, offsetY: number, id: string) => {
    const raw = GRID_START_HOUR * 60 + offsetY / PX_PER_MINUTE;
    // Snap to the quarter hour. Minute-precision dragging is false precision.
    const minutes = Math.max(0, Math.min(23 * 60 + 45, Math.round(raw / 15) * 15));
    const item = items.find((entry) => entry.id === id);
    if (!item) return;

    if (!item.reschedulable) {
      setError(
        "That one is not scheduled here — it comes from the record that owns the date. Open it to change when it happens."
      );
      return;
    }

    const previous = moved[id];
    setMoved((state) => ({ ...state, [id]: { day, minutes } }));
    setError(null);

    const durationMin = item.end
      ? Math.max(15, minutesOfDay(item.end) - minutesOfDay(item.start))
      : 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    const startTime = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    const endMinutes = Math.min(23 * 60 + 59, minutes + durationMin);
    const endTime = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;

    const formData = new FormData();
    formData.set("item_id", id);
    formData.set("date", day);
    formData.set("start_time", startTime);
    if (item.end) formData.set("end_time", endTime);

    startTransition(async () => {
      try {
        await rescheduleAction(formData);
        router.refresh();
      } catch (err) {
        setMoved((state) => {
          const next = { ...state };
          if (previous) next[id] = previous;
          else delete next[id];
          return next;
        });
        setError(err instanceof Error ? err.message : "That move did not save.");
      }
    });
  };

  const gridHeight = (GRID_END_HOUR - GRID_START_HOUR + 1) * 60 * PX_PER_MINUTE;

  return (
    <div className="cal-gridwrap">
      {error ? (
        <p className="cal-error" role="status">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </p>
      ) : null}

      <div
        className="cal-grid"
        style={{ ["--cal-days" as string]: String(days.length) }}
      >
        <div className="cal-head">
          <span className="cal-gutter" />
          {days.map((day) => {
            const heading = dayHeading(day);
            return (
              <div key={day} className={`cal-daycol ${day === today ? "is-today" : ""}`}>
                <span>{heading.weekday}</span>
                <b>{heading.date.split(" ")[0]} {heading.date.split(" ")[1]}</b>
              </div>
            );
          })}
        </div>

        <div className="cal-allday">
          <span className="cal-gutter">all-day</span>
          {days.map((day) => (
            <div key={day} className="cal-allday-cell">
              {allDay
                .filter((entry) => dayOf(entry.start) === day)
                .map((entry) => (
                  <Link
                    key={entry.id}
                    href={itemHref(query, entry.id)}
                    scroll={false}
                    className={`cal-pill ${CATEGORY_TONE[entry.category]} ${
                      entry.status === "completed" ? "is-done" : ""
                    }`}
                    title={`${entry.title}${entry.subtitle ? ` — ${entry.subtitle}` : ""}`}
                  >
                    {entry.title}
                  </Link>
                ))}
            </div>
          ))}
        </div>

        <div className="cal-body" ref={scroller}>
          {/*
            The current time, drawn once across the whole grid with its label
            in the gutter — the same line a paper diary would have, rather
            than a marker hiding in one column.
          */}
          {now !== null && now >= GRID_START_HOUR * 60 && now <= (GRID_END_HOUR + 1) * 60 ? (
            <div
              className="cal-now"
              style={{ top: (now - GRID_START_HOUR * 60) * PX_PER_MINUTE }}
              aria-hidden="true"
            >
              <span>
                {new Date().toLocaleTimeString("en-US", {
                  timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit",
                })}
              </span>
            </div>
          ) : null}

          <div className="cal-hours" style={{ height: gridHeight }}>
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="cal-hour"
                style={{ top: (hour - GRID_START_HOUR) * 60 * PX_PER_MINUTE }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const { forDay, lanes } = placedOn(day);

            return (
              <div
                key={day}
                className={`cal-col ${day === today ? "is-today" : ""}`}
                style={{ height: gridHeight }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/plain") || dragging;
                  const box = event.currentTarget.getBoundingClientRect();
                  if (id) drop(day, event.clientY - box.top, id);
                  setDragging(null);
                }}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="cal-slot"
                    style={{ top: (hour - GRID_START_HOUR) * 60 * PX_PER_MINUTE }}
                  />
                ))}

                {forDay.map((entry) => {
                  const override = moved[entry.id];
                  const startMin = override ? override.minutes : minutesOfDay(entry.start);
                  const endMin = entry.end
                    ? startMin + Math.max(15, minutesOfDay(entry.end) - minutesOfDay(entry.start))
                    : startMin + 30;
                  const lane = lanes.get(entry.id) ?? { column: 0, of: 1 };
                  const width = 100 / lane.of;

                  return (
                    <Link
                      key={entry.id}
                      href={itemHref(query, entry.id)}
                      scroll={false}
                      draggable={entry.reschedulable}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", entry.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(entry.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={`cal-event ${CATEGORY_TONE[entry.category]} ${
                        entry.status === "completed" ? "is-done" : ""
                      } ${dragging === entry.id ? "is-dragging" : ""}`}
                      style={{
                        top: Math.max(0, (startMin - GRID_START_HOUR * 60) * PX_PER_MINUTE),
                        height: Math.max(26, (endMin - startMin) * PX_PER_MINUTE - 2),
                        left: `${lane.column * width}%`,
                        width: `calc(${width}% - 3px)`,
                      }}
                    >
                      <b>{entry.title}</b>
                      {entry.subtitle ? <span>{entry.subtitle}</span> : null}
                      <i>
                        {clock(entry.start)}
                        {entry.end ? ` – ${clock(entry.end)}` : ""}
                      </i>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
