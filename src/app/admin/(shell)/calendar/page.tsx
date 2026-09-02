import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  CALENDAR_FILTERS, isCalendarView,
  type CalendarCategory, type CalendarView,
} from "@/lib/calendar/config";
import {
  findItem, getCalendarItems, loadCalendarPeople, loadTodayAndUpcoming,
} from "@/lib/calendar/service";
import { buildWindow, chicagoDay } from "@/lib/calendar/window";
import type { CalendarEvent } from "@/lib/calendar/types";
import { loadTaskDetail, loadTaskLinkOptions } from "@/lib/tasks/queries";
import {
  createCalendarEventAction, rescheduleItemAction,
} from "@/app/admin/calendar-actions";
import CalendarBoard from "@/components/admin/cc/panels/CalendarBoard";
import EventDrawer from "@/components/admin/cc/calendar/EventDrawer";
import NewEventModal from "@/components/admin/cc/calendar/NewEventModal";
import PlanWeekButton from "@/components/admin/cc/calendar/PlanWeekButton";
import { IconAlert } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

/**
 * The scheduling layer.
 *
 * Nine tables already know when things happen; this page reads them for one
 * date window and draws them together. The view, the date and the filters all
 * live in the URL, so a week is a link, and the detail panel opens on an
 * `?item=` parameter rather than a route change.
 *
 * Nothing here is fetched in the browser, and nothing on this page owns a
 * date that belongs to another record.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const today = chicagoDay();
  const view: CalendarView = isCalendarView(one("view")) ? (one("view") as CalendarView) : "week";
  const anchorRaw = one("anchor");
  const anchor = anchorRaw && /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw) ? anchorRaw : today;

  const window = buildWindow(view, anchor);
  const supabase = await createSupabaseServerClient();
  const viewer = session.admin.email;

  const people = await loadCalendarPeople(supabase);

  // Filters. An absent parameter means everything is on, so the default view
  // needs no query string at all.
  const allCalendarKeys = CALENDAR_FILTERS.map((filter) => filter.key);
  const allPeopleKeys = [...people, "__unassigned__"];

  const chosen = (key: string, all: string[]): string[] => {
    const raw = one(key);
    if (raw === undefined) return all;
    return raw.split(",").filter((value) => all.includes(value));
  };

  const calendarKeys = chosen("cal", allCalendarKeys);
  const ownerKeys = chosen("who", allPeopleKeys);

  const categories = calendarKeys.length === allCalendarKeys.length
    ? undefined
    : (CALENDAR_FILTERS
        .filter((filter) => calendarKeys.includes(filter.key))
        .flatMap((filter) => filter.categories) as CalendarCategory[]);

  // "My Schedule" ticked on its own means only what is assigned to you.
  const mineOnly = calendarKeys.length === 1 && calendarKeys[0] === "mine" ? viewer : null;

  let items;
  try {
    items = await getCalendarItems(supabase, window, {
      categories: mineOnly ? undefined : categories,
      owners: ownerKeys.length === allPeopleKeys.length ? undefined : ownerKeys,
      mineOnly,
    });
  } catch (err) {
    return (
      <div className="cc-error">
        <IconAlert size={15} />
        <span>{err instanceof Error ? err.message : "The calendar could not be loaded."}</span>
      </div>
    );
  }

  const [panels, options] = await Promise.all([
    loadTodayAndUpcoming(supabase, today),
    loadTaskLinkOptions(supabase),
  ]);

  // ── The drawer, when something is open.
  const openId = one("item");
  const openItem = openId ? findItem(items, openId) : null;

  const [openEvent, openTask] = await Promise.all([
    openItem?.source === "event"
      ? supabase.from("calendar_events").select("*")
          .eq("id", openItem.sourceId.split("@")[0]).maybeSingle()
          .then((r) => (r.data as CalendarEvent) ?? null)
      : Promise.resolve(null),
    openItem?.taskId
      ? loadTaskDetail(supabase, openItem.taskId)
      : Promise.resolve(null),
  ]);

  const listParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "item" || typeof value !== "string" || !value) continue;
    listParams.set(key, value);
  }
  const query = listParams.toString();
  const closeHref = `/admin/calendar${query ? `?${query}` : ""}`;

  return (
    <>
      <div className="cc-greet cal-greet">
        <div>
          <h1>Calendar</h1>
          <p>Your schedule, deadlines, launches, and client commitments in one place.</p>
        </div>
        <div className="cal-greet-actions">
          <PlanWeekButton
            weekStart={window.days[0] ?? today}
            applyAction={rescheduleItemAction}
          />
          <NewEventModal
            action={createCalendarEventAction}
            owner={viewer}
            people={people}
            defaultDate={view === "day" ? anchor : today}
            options={{
              clients: options.clients,
              projects: options.projects,
              proposals: options.proposals,
              leads: options.leads,
              tasks: options.parents,
            }}
          />
        </div>
      </div>

      <CalendarBoard
        view={view}
        anchor={anchor}
        today={today}
        window={window}
        items={items}
        todayItems={panels.today}
        upcoming={panels.upcoming}
        people={people}
        viewer={viewer}
        query={query}
      />

      {openItem ? (
        <EventDrawer
          item={openItem}
          event={openEvent}
          task={openTask}
          closeHref={closeHref}
        />
      ) : null}
    </>
  );
}
