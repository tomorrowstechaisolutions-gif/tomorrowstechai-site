import Link from "next/link";
import {
  BUSINESS_TIMEZONE, CALENDAR_LEGEND, CATEGORY_TONE, type CalendarView,
} from "@/lib/calendar/config";
import type { CalendarItem, CalendarWindow } from "@/lib/calendar/types";
import { rescheduleItemAction } from "@/app/admin/calendar-actions";
import CalendarFilters from "../calendar/CalendarFilters";
import CalendarToolbar from "../calendar/CalendarToolbar";
import TimeGrid from "../calendar/TimeGrid";
import MonthGrid from "../calendar/MonthGrid";
import AgendaList from "../calendar/AgendaList";
import { EmptyState } from "../Panel";
import { IconArrowRight, IconCalendar } from "../Icons";

/**
 * The calendar page's body.
 *
 * Everything below the header: the filter rail, the view controls, whichever
 * grid the view asks for, and the two panels underneath. The data all arrives
 * already normalised — this component does not know which of nine tables any
 * row came from.
 */

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit",
  });
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: BUSINESS_TIMEZONE, month: "short", day: "numeric",
  });
}

function longToday(day: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "long", month: "short", day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
}

export default function CalendarBoard({
  view,
  anchor,
  today,
  window: win,
  items,
  todayItems,
  upcoming,
  people,
  viewer,
  query,
}: {
  view: CalendarView;
  anchor: string;
  today: string;
  window: CalendarWindow;
  items: CalendarItem[];
  todayItems: CalendarItem[];
  upcoming: CalendarItem[];
  people: string[];
  viewer: string;
  query: string;
}) {
  const itemHref = (item: CalendarItem) => {
    const params = new URLSearchParams(query);
    params.set("item", item.id);
    return `/admin/calendar?${params.toString()}`;
  };

  const dayHref = (day: string) => {
    const params = new URLSearchParams(query);
    params.set("view", "day");
    params.set("anchor", day);
    params.delete("item");
    return `/admin/calendar?${params.toString()}`;
  };

  const agendaHref = () => {
    const params = new URLSearchParams(query);
    params.set("view", "agenda");
    params.delete("item");
    return `/admin/calendar?${params.toString()}`;
  };

  return (
    <>
      <CalendarToolbar view={view} anchor={anchor} label={win.label} today={today} />

      <div className="cal-layout">
        <CalendarFilters people={people} viewer={viewer} />

        <div className="cal-main">
          {items.length === 0 && view !== "agenda" ? (
            <section className="cc-panel">
              <div className="cc-panel-body">
                <EmptyState
                  title="Nothing scheduled here"
                  text="No events, deadlines or launches fall in this range — or the calendars you have ticked have nothing in it. Anything with a date on it anywhere in the Command Center appears here automatically."
                  icon={<IconCalendar size={17} />}
                />
              </div>
            </section>
          ) : view === "month" ? (
            <MonthGrid
              days={win.days}
              items={items}
              today={today}
              anchor={anchor}
              itemHref={itemHref}
              dayHref={dayHref}
            />
          ) : view === "agenda" ? (
            <AgendaList items={items} today={today} itemHref={itemHref} />
          ) : (
            <TimeGrid
              days={win.days}
              items={items}
              today={today}
              itemHref={itemHref}
              rescheduleAction={rescheduleItemAction}
            />
          )}

          {view !== "agenda" ? (
            <div className="cal-legend">
              {CALENDAR_LEGEND.map((entry) => (
                <span key={entry.label}>
                  <i className={`cal-swatch ${entry.tone}`} aria-hidden="true" />
                  {entry.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Today and Coming Up ─────────────────────────────────── */}
      <div className="cal-panels">
        <section className="cc-panel">
          <div className="cc-panel-head">
            <IconCalendar size={15} />
            <h2>Today — {longToday(today)}</h2>
            <Link href={agendaHref()} className="cc-more" scroll={false}>
              View agenda <IconArrowRight size={13} />
            </Link>
          </div>

          <div className="cc-panel-body">
            {todayItems.length === 0 ? (
              <EmptyState
                title="No events scheduled today"
                text="Your calendar is clear."
                icon={<IconCalendar size={17} />}
              />
            ) : (
              <ol className="cal-list">
                {todayItems.map((entry) => (
                  <li key={entry.id}>
                    <span className="cal-list-when">
                      {entry.allDay ? "All day" : clock(entry.start)}
                    </span>
                    <i className={`cal-swatch ${CATEGORY_TONE[entry.category]}`} aria-hidden="true" />
                    <Link href={itemHref(entry)} scroll={false}>
                      <b>{entry.title}</b>
                      {entry.subtitle ? <span>{entry.subtitle}</span> : null}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="cc-panel">
          <div className="cc-panel-head">
            <IconArrowRight size={15} />
            <h2>Coming Up</h2>
            <Link href={agendaHref()} className="cc-more" scroll={false}>
              View all <IconArrowRight size={13} />
            </Link>
          </div>

          <div className="cc-panel-body">
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing important ahead"
                text="No launches, milestones or client commitments in the next two weeks."
                icon={<IconCalendar size={17} />}
              />
            ) : (
              <ol className="cal-list">
                {upcoming.map((entry) => (
                  <li key={entry.id}>
                    <span className="cal-list-when">{shortDay(entry.start)}</span>
                    <i className={`cal-swatch ${CATEGORY_TONE[entry.category]}`} aria-hidden="true" />
                    <Link href={itemHref(entry)} scroll={false}>
                      <b>{entry.title}</b>
                      {entry.subtitle ? <span>{entry.subtitle}</span> : null}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
