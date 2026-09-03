import type { Priority } from "@/lib/supabase/types";
import type { CalendarCategory, EventStatus } from "./config";

/**
 * Row type for the one table the calendar owns.
 * Kept in sync with supabase/migrations/0019_calendar_events.sql.
 */
export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: CalendarCategory;

  client_id: string | null;
  project_id: string | null;
  proposal_id: string | null;
  lead_id: string | null;
  task_id: string | null;

  assigned_to: string | null;

  start_at: string;
  end_at: string | null;
  all_day: boolean;

  location: string | null;
  meeting_url: string | null;

  status: EventStatus;
  priority: Priority;

  recurrence_rule: string | null;
  recurrence_until: string | null;
  reminder_minutes: number | null;
  tags: string[];

  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  canceled_at: string | null;
};

/**
 * Where a calendar item actually came from.
 *
 * This is the field that keeps the calendar honest: it says which table owns
 * the date, so rescheduling writes back to the source instead of creating a
 * second copy of it.
 */
export type CalendarSource =
  | "event"          // calendar_events — the only rows the calendar owns
  | "task"           // tasks.due_at / start_date
  | "job_start"      // jobs.started_at
  | "job_due"        // jobs.due_at
  | "job_launch"     // jobs.launched_at
  | "proposal"       // proposals.valid_until
  | "lead_followup"  // leads.next_followup_at
  | "followup_step"  // lead_followups.due_at — the automated sequence
  | "appointment"    // appointments.scheduled_at — the website booking log
  | "meeting"        // meetings.start_at — a scheduled call with a provider
  | "content"        // social_posts.scheduled_at / published_at
  | "renewal";       // website_renewals.renews_at

/**
 * One normalised thing on the calendar.
 *
 * Every source is flattened into this. The UI never knows which of nine
 * tables a row came from — only `source`, so it can send an edit back to the
 * right place.
 */
export type CalendarItem = {
  /** `${source}:${sourceId}` — unique across sources, stable across renders. */
  id: string;
  source: CalendarSource;
  sourceId: string;

  title: string;
  subtitle: string | null;

  /** ISO instants. `end` is null for a point in time rather than a span. */
  start: string;
  end: string | null;
  allDay: boolean;

  category: CalendarCategory;
  status: EventStatus;
  priority: Priority;

  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  proposalId: string | null;
  proposalNumber: string | null;
  leadId: string | null;
  taskId: string | null;

  assignedTo: string | null;

  location: string | null;
  meetingUrl: string | null;
  notes: string | null;

  /** Where "open the thing this came from" goes. */
  href: string | null;
  /**
   * Whether this item's date can be changed from the calendar.
   *
   * False for anything derived rather than scheduled — a proposal's expiry
   * date, an automated follow-up step, a renewal — because moving those here
   * would mean overwriting a fact that another system computed.
   */
  reschedulable: boolean;
};

export type CalendarWindow = {
  /** Inclusive start, exclusive end, as UTC instants. */
  fromIso: string;
  toIso: string;
  /** The Chicago dates the window covers, in order. */
  days: string[];
  label: string;
};
