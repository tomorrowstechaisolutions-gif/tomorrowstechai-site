/**
 * The calendar vocabulary: categories, views, statuses and the colours.
 *
 * A plain module — server actions live in a `"use server"` file, which may
 * export nothing but async functions, so anything both a form and an action
 * need has to live here.
 *
 * The eleven categories are shared by EVERY source. A task deadline, a
 * milestone and a hand-made meeting all normalise into the same category
 * vocabulary, which is what lets one legend and one set of filters describe
 * nine different tables.
 */

export const CALENDAR_CATEGORIES = [
  "task", "meeting", "project", "milestone", "proposal",
  "sales_followup", "launch", "content", "hosting", "domain", "internal",
] as const;

export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CalendarCategory, string> = {
  task: "Tasks",
  meeting: "Client Meetings",
  project: "Projects",
  milestone: "Milestones",
  proposal: "Proposals",
  sales_followup: "Sales Follow-ups",
  launch: "Launches",
  content: "Content",
  hosting: "Hosting / Domains",
  domain: "Hosting / Domains",
  internal: "Internal",
};

/** `.cal-c-*` classes, defined alongside the rest of the Calendar CSS. */
export const CATEGORY_TONE: Record<CalendarCategory, string> = {
  task: "cal-c-blue",
  meeting: "cal-c-violet",
  project: "cal-c-green",
  milestone: "cal-c-orange",
  proposal: "cal-c-red",
  sales_followup: "cal-c-teal",
  launch: "cal-c-yellow",
  content: "cal-c-indigo",
  hosting: "cal-c-slate",
  domain: "cal-c-slate",
  internal: "cal-c-gray",
};

/**
 * The filter panel. Hosting and Domain share one row because they are one
 * question — "what renews soon" — and two checkboxes for it would be two
 * ways to ask the same thing.
 */
export const CALENDAR_FILTERS: {
  key: string;
  label: string;
  categories: CalendarCategory[];
  tone: string;
}[] = [
  { key: "mine", label: "My Schedule", categories: [], tone: "cal-c-blue" },
  { key: "task", label: "Tasks", categories: ["task"], tone: "cal-c-blue" },
  { key: "meeting", label: "Client Meetings", categories: ["meeting"], tone: "cal-c-violet" },
  { key: "project", label: "Projects", categories: ["project"], tone: "cal-c-green" },
  { key: "milestone", label: "Milestones", categories: ["milestone"], tone: "cal-c-orange" },
  { key: "proposal", label: "Proposals", categories: ["proposal"], tone: "cal-c-red" },
  { key: "sales_followup", label: "Sales Follow-ups", categories: ["sales_followup"], tone: "cal-c-teal" },
  { key: "launch", label: "Launches", categories: ["launch"], tone: "cal-c-yellow" },
  { key: "content", label: "Content", categories: ["content"], tone: "cal-c-indigo" },
  { key: "hosting", label: "Hosting / Domains", categories: ["hosting", "domain"], tone: "cal-c-slate" },
  { key: "internal", label: "Internal", categories: ["internal"], tone: "cal-c-gray" },
];

/** The legend under the grid. One entry per colour, not per category. */
export const CALENDAR_LEGEND: { label: string; tone: string }[] = [
  { label: "Tasks", tone: "cal-c-blue" },
  { label: "Meetings", tone: "cal-c-violet" },
  { label: "Projects", tone: "cal-c-green" },
  { label: "Milestones", tone: "cal-c-orange" },
  { label: "Proposals", tone: "cal-c-red" },
  { label: "Follow-ups", tone: "cal-c-teal" },
  { label: "Launches", tone: "cal-c-yellow" },
  { label: "Content", tone: "cal-c-indigo" },
  { label: "Internal", tone: "cal-c-gray" },
];

// ── Views ────────────────────────────────────────────────────────────

export const CALENDAR_VIEWS = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "agenda", label: "Agenda" },
] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number]["key"];

export function isCalendarView(value: string | undefined): value is CalendarView {
  return Boolean(value) && CALENDAR_VIEWS.some((view) => view.key === value);
}

/** The hours the grid draws. Outside these an event is pinned to the edge. */
export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 19;

// ── Status ───────────────────────────────────────────────────────────

export const EVENT_STATUSES = [
  "scheduled", "in_progress", "waiting", "completed", "canceled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  waiting: "Waiting",
  completed: "Completed",
  canceled: "Canceled",
};

export const EVENT_STATUS_TONE: Record<EventStatus, string> = {
  scheduled: "tk-s-info",
  in_progress: "tk-s-active",
  waiting: "tk-s-warn",
  completed: "tk-s-ok",
  canceled: "tk-s-muted",
};

// ── Recurrence and reminders ─────────────────────────────────────────

/** The rules the New Event form can build. Anything else can still be stored. */
export const RECURRENCE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "Does not repeat" },
  { value: "FREQ=DAILY", label: "Daily" },
  { value: "FREQ=WEEKLY", label: "Weekly" },
  { value: "FREQ=WEEKLY;INTERVAL=2", label: "Every two weeks" },
  { value: "FREQ=MONTHLY", label: "Monthly" },
];

export const REMINDER_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At the time of the event" },
  { value: "15", label: "15 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

/** Where the timezone comes from. One business, one clock, stated out loud. */
export const BUSINESS_TIMEZONE = "America/Chicago";
export const BUSINESS_TIMEZONE_LABEL = "Central Time (CT)";
