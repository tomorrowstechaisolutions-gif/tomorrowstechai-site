"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  CALENDAR_CATEGORIES, EVENT_STATUSES,
  type CalendarCategory, type EventStatus,
} from "@/lib/calendar/config";
import { getMeetingRow } from "@/lib/meetings/queries";
import { rescheduleMeeting } from "@/lib/meetings/service";
import type { Priority } from "@/lib/supabase/types";

/**
 * Every write the Calendar makes.
 *
 * The important one is rescheduleItemAction. The calendar shows nine sources
 * and owns exactly one of them, so moving something has to write back to
 * whichever table actually holds that date — the task, the job, the lead —
 * and never to a calendar copy of it. There is no calendar copy.
 *
 * Anything derived rather than scheduled refuses to move and says why: a
 * proposal's expiry, an automated follow-up step and a registrar's renewal
 * date are facts other systems computed, not plans this page may rewrite.
 */

const CALENDAR = "/admin/calendar";

function touch(extra?: string) {
  revalidatePath(CALENDAR);
  revalidatePath("/admin");
  if (extra) revalidatePath(extra);
}

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return {
    supabase: await createSupabaseServerClient(),
    actor: session.admin.email,
  };
}

function str(fd: FormData, key: string, max = 4000): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function flag(fd: FormData, key: string): boolean {
  const value = fd.get(key);
  return value === "on" || value === "1" || value === "true";
}

function categoryOrDefault(raw: string): CalendarCategory {
  return (CALENDAR_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as CalendarCategory)
    : "meeting";
}

function statusOrNull(raw: string): EventStatus | null {
  return (EVENT_STATUSES as readonly string[]).includes(raw) ? (raw as EventStatus) : null;
}

function priorityOrDefault(raw: string): Priority {
  return ["low", "medium", "high", "critical"].includes(raw) ? (raw as Priority) : "medium";
}

/**
 * A Chicago date and time become the UTC instant every source stores.
 *
 * Central is UTC-5 or UTC-6 depending on the date, so the offset is measured
 * for that day rather than assumed, in the same two passes the dashboard's
 * period helpers use — the first guess can land on the wrong side of a
 * changeover, and then the offset it measured is the wrong one.
 */
function chicagoOffsetMinutes(at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(at)).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return (asUtc - at) / 60000;
}

function instant(date: string, time: string | null, endOfDay = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const clock = time && /^\d{2}:\d{2}/.test(time) ? time : endOfDay ? "17:00" : "09:00";
  const [hours, minutes] = clock.split(":").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  const wallClock = Date.UTC(y, m - 1, d, hours, minutes, 0);

  const first = chicagoOffsetMinutes(wallClock);
  let ts = wallClock - first * 60000;
  const second = chicagoOffsetMinutes(ts);
  if (second !== first) ts = wallClock - second * 60000;

  return new Date(ts).toISOString();
}

// ═══════════════════════════════════════════════════════════════════════
// calendar_events — the rows the calendar owns
// ═══════════════════════════════════════════════════════════════════════

export async function createCalendarEventAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const title = str(formData, "title", 300);
  if (!title) throw new Error("An event needs a title.");

  const date = str(formData, "date", 20);
  const allDay = flag(formData, "all_day");
  const startAt = instant(date, allDay ? "00:00" : str(formData, "start_time", 10));
  if (!startAt) throw new Error("An event needs a valid date.");

  const endTime = str(formData, "end_time", 10);
  const endAt = allDay ? null : endTime ? instant(date, endTime) : null;
  if (endAt && endAt < startAt) {
    throw new Error("The end time is before the start time.");
  }

  const reminder = Number.parseInt(str(formData, "reminder_minutes", 10), 10);
  const recurrence = str(formData, "recurrence_rule", 300) || null;

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      title,
      description: str(formData, "description", 8000) || null,
      event_type: categoryOrDefault(str(formData, "event_type", 40)),
      client_id: str(formData, "client_id", 40) || null,
      project_id: str(formData, "project_id", 40) || null,
      proposal_id: str(formData, "proposal_id", 40) || null,
      lead_id: str(formData, "lead_id", 40) || null,
      task_id: str(formData, "task_id", 40) || null,
      assigned_to: str(formData, "assigned_to", 200) || actor,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      location: str(formData, "location", 300) || null,
      meeting_url: str(formData, "meeting_url", 600) || null,
      status: statusOrNull(str(formData, "status", 30)) ?? "scheduled",
      priority: priorityOrDefault(str(formData, "priority", 20)),
      recurrence_rule: recurrence,
      recurrence_until: recurrence
        ? instant(str(formData, "recurrence_until", 20), "23:59")
        : null,
      reminder_minutes: Number.isFinite(reminder) && reminder >= 0 ? reminder : null,
      tags: str(formData, "tags", 500)
        .split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      created_by: actor,
    })
    .select("id, project_id, lead_id")
    .single();

  if (error || !data) throw new Error(`Could not create the event: ${error?.message ?? "unknown"}`);

  // Activity goes to the record it is about, using the event tables that
  // already exist. No second activity system.
  await noteOnSource(supabase, {
    jobId: data.project_id as string | null,
    leadId: data.lead_id as string | null,
    body: `Calendar event scheduled: ${title}.`,
    actor,
  });

  touch();
}

export async function updateCalendarEventAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "event_id", 40);
  if (!id) return;

  const date = str(formData, "date", 20);
  const allDay = flag(formData, "all_day");
  const startAt = instant(date, allDay ? "00:00" : str(formData, "start_time", 10));
  if (!startAt) throw new Error("An event needs a valid date.");

  const endTime = str(formData, "end_time", 10);
  const endAt = allDay ? null : endTime ? instant(date, endTime) : null;
  if (endAt && endAt < startAt) throw new Error("The end time is before the start time.");

  const { error } = await supabase
    .from("calendar_events")
    .update({
      title: str(formData, "title", 300),
      description: str(formData, "description", 8000) || null,
      event_type: categoryOrDefault(str(formData, "event_type", 40)),
      client_id: str(formData, "client_id", 40) || null,
      project_id: str(formData, "project_id", 40) || null,
      proposal_id: str(formData, "proposal_id", 40) || null,
      lead_id: str(formData, "lead_id", 40) || null,
      task_id: str(formData, "task_id", 40) || null,
      assigned_to: str(formData, "assigned_to", 200) || null,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      location: str(formData, "location", 300) || null,
      meeting_url: str(formData, "meeting_url", 600) || null,
      status: statusOrNull(str(formData, "status", 30)) ?? "scheduled",
      priority: priorityOrDefault(str(formData, "priority", 20)),
    })
    .eq("id", id);

  if (error) throw new Error(`Could not save the event: ${error.message}`);

  touch();
}

export async function deleteCalendarEventAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "event_id", 40);
  if (!id) return;

  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw new Error(`Could not delete the event: ${error.message}`);

  touch();
  redirect(CALENDAR);
}

/** Writes a line onto whichever record an event is about. */
async function noteOnSource(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: { jobId?: string | null; leadId?: string | null; body: string; actor: string }
) {
  try {
    if (input.jobId) {
      await supabase.from("job_events").insert({
        job_id: input.jobId, kind: "note", body: input.body, actor: input.actor,
      });
    } else if (input.leadId) {
      await supabase.from("lead_events").insert({
        lead_id: input.leadId, type: "system", body: input.body, actor: input.actor,
      });
    }
  } catch {
    // Activity is a courtesy on top of a change that already happened.
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Writing back to the source
// ═══════════════════════════════════════════════════════════════════════

/**
 * A composite calendar id, split back into which table owns the date.
 *
 * Recurring occurrences carry `@YYYY-MM-DD` so two Mondays of one series are
 * two rows on screen; the suffix is dropped here because they are one row in
 * the database.
 */
function splitItemId(id: string): { source: string; sourceId: string } | null {
  const at = id.indexOf(":");
  if (at <= 0) return null;
  return {
    source: id.slice(0, at),
    sourceId: id.slice(at + 1).split("@")[0],
  };
}

/** Why a given kind of item cannot be moved from the calendar. */
const IMMOVABLE: Record<string, string> = {
  proposal:
    "A proposal's expiry date is a term on a document that has already gone out. Change it on the proposal itself.",
  followup_step:
    "That is an automated follow-up. The sequence decides when it sends, so moving it here would put the calendar and the cron in disagreement.",
  renewal:
    "A renewal date comes from the registrar or the subscription, not from this calendar.",
};

/**
 * Moves something, in whichever table actually holds its date.
 *
 * This is what makes the calendar a view rather than a second schedule.
 */
export async function rescheduleItemAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const parsed = splitItemId(str(formData, "item_id", 120));
  if (!parsed) return;

  const date = str(formData, "date", 20);
  const startTime = str(formData, "start_time", 10) || null;
  const endTime = str(formData, "end_time", 10) || null;

  const startAt = instant(date, startTime, true);
  if (!startAt) throw new Error("That is not a date this can move something to.");
  const endAt = endTime ? instant(date, endTime) : null;
  if (endAt && endAt < startAt) throw new Error("The end time is before the start time.");

  const refusal = IMMOVABLE[parsed.source];
  if (refusal) throw new Error(refusal);

  switch (parsed.source) {
    case "event": {
      const { error } = await supabase
        .from("calendar_events")
        .update({ start_at: startAt, end_at: endAt })
        .eq("id", parsed.sourceId);
      if (error) throw new Error(`Could not move the event: ${error.message}`);
      break;
    }

    case "task": {
      const { error } = await supabase
        .from("tasks")
        .update({ due_at: startAt, due_time: startTime })
        .eq("id", parsed.sourceId);
      if (error) throw new Error(`Could not move the task: ${error.message}`);

      await supabase.from("task_events").insert({
        task_id: parsed.sourceId,
        event_type: "due_changed",
        body: `Rescheduled to ${date} from the calendar.`,
        actor,
      });
      revalidatePath("/admin/tasks");
      break;
    }

    case "job_start":
    case "job_due":
    case "job_launch": {
      const column =
        parsed.source === "job_start" ? "started_at"
        : parsed.source === "job_due" ? "due_at"
        : "launched_at";

      const { error } = await supabase
        .from("jobs")
        .update({ [column]: startAt })
        .eq("id", parsed.sourceId);
      if (error) throw new Error(`Could not move the project date: ${error.message}`);

      const labels: Record<string, string> = {
        started_at: "Kickoff", due_at: "Target delivery", launched_at: "Launch",
      };
      await supabase.from("job_events").insert({
        job_id: parsed.sourceId,
        kind: "note",
        body: `${labels[column]} moved to ${date} from the calendar.`,
        actor,
      });
      revalidatePath(`/admin/jobs/${parsed.sourceId}`);
      revalidatePath("/admin/jobs");
      break;
    }

    case "lead_followup": {
      const { error } = await supabase
        .from("leads")
        .update({ next_followup_at: startAt })
        .eq("id", parsed.sourceId);
      if (error) throw new Error(`Could not move the follow-up: ${error.message}`);

      await supabase.from("lead_events").insert({
        lead_id: parsed.sourceId,
        type: "system",
        body: `Follow-up moved to ${date} from the calendar.`,
        actor,
      });
      revalidatePath(`/admin/leads/${parsed.sourceId}`);
      break;
    }

    case "appointment": {
      const { error } = await supabase
        .from("appointments")
        .update({ scheduled_at: startAt })
        .eq("id", parsed.sourceId);
      if (error) throw new Error(`Could not move the appointment: ${error.message}`);
      break;
    }

    case "meeting": {
      // A meeting is not just a row with a date on it: there is a calendar
      // event at Google with the client on it. Dragging it goes through the
      // meetings service so the invitation moves too, rather than writing
      // start_at here and leaving the client at the old time.
      const meeting = await getMeetingRow(supabase, parsed.sourceId);
      if (!meeting) throw new Error("That meeting no longer exists.");

      const next = new Date(startAt);
      const ends = new Date(next.getTime() + meeting.duration_minutes * 60_000);
      const { providerError } = await rescheduleMeeting(
        supabase, meeting,
        { startAt: next.toISOString(), endAt: ends.toISOString(), notify: true,
          reason: "Moved on the calendar." },
        actor
      );
      if (providerError) throw new Error(providerError);
      revalidatePath("/admin/meetings");
      break;
    }

    case "content": {
      const { error } = await supabase
        .from("social_posts")
        .update({ scheduled_at: startAt })
        .eq("id", parsed.sourceId)
        .in("status", ["draft", "scheduled", "needs_approval"]);
      if (error) throw new Error(`Could not move the post: ${error.message}`);
      revalidatePath("/admin/marketing/content");
      break;
    }

    default:
      throw new Error("That item cannot be moved from the calendar.");
  }

  touch();
}

/**
 * Marks something done, again in whichever table owns it.
 *
 * A task completed here is completed in Tasks and on the dashboard, because
 * it is the same row.
 */
export async function completeItemAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const parsed = splitItemId(str(formData, "item_id", 120));
  if (!parsed) return;
  const reopen = flag(formData, "reopen");

  switch (parsed.source) {
    case "event":
      await supabase
        .from("calendar_events")
        .update({ status: reopen ? "scheduled" : "completed" })
        .eq("id", parsed.sourceId);
      break;

    case "task":
      await supabase
        .from("tasks")
        .update({ status: reopen ? "in_progress" : "completed" })
        .eq("id", parsed.sourceId);
      await supabase.from("task_events").insert({
        task_id: parsed.sourceId,
        event_type: reopen ? "reopened" : "completed",
        body: reopen ? "Reopened from the calendar." : "Completed from the calendar.",
        actor,
      });
      revalidatePath("/admin/tasks");
      break;

    case "appointment":
      await supabase
        .from("appointments")
        .update({ status: reopen ? "scheduled" : "completed" })
        .eq("id", parsed.sourceId);
      break;

    case "meeting":
      throw new Error(
        "Finishing a meeting asks what came out of it. Open the meeting and use Mark complete."
      );

    case "job_launch":
    case "job_due":
    case "job_start":
      throw new Error("A project date is finished by moving the project's stage, not by ticking the calendar.");

    default:
      throw new Error("That item is not something the calendar can complete.");
  }

  touch();
}

/** Inline status change on a calendar-owned event. */
export async function setEventStatusAction(formData: FormData) {
  const { supabase } = await requireAdmin();

  const parsed = splitItemId(str(formData, "item_id", 120));
  const next = statusOrNull(str(formData, "status", 30));
  if (!parsed || !next) return;

  if (parsed.source !== "event") {
    throw new Error("Only events created on the calendar have a status you can set here.");
  }

  const { error } = await supabase
    .from("calendar_events")
    .update({ status: next })
    .eq("id", parsed.sourceId);
  if (error) throw new Error(`Could not change the status: ${error.message}`);

  touch();
}
