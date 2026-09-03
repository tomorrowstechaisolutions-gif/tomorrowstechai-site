import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { providerFor, ProviderError } from "./providers";
import type { ProviderMeetingInput, ProviderResult } from "./providers";
import {
  OUTCOMES_IMPLYING_FOLLOW_UP, PROVIDER_IS_VIDEO, TYPE_LABELS,
} from "./config";
import type {
  MeetingOutcome, MeetingProviderKey, MeetingStatus, MeetingType,
} from "./config";
import type { Meeting } from "./types";
import { BUSINESS_TZ } from "@/lib/time/chicago";

/**
 * What actually happens when a meeting is scheduled, moved, cancelled or
 * finished.
 *
 * The order of operations is the whole design here:
 *
 *   1. Write our row first, with no provider ids.
 *   2. Ask the provider to create the event.
 *   3. Write what it gave back onto the row.
 *
 * Provider-first would be worse in exactly the way that matters: if step 2
 * succeeded and step 1 then failed, the client would be holding a calendar
 * invitation for a meeting that exists nowhere in this system. Our-row-first
 * can only fail the other way — a meeting we know about that Google has not
 * heard of — which is visible, honest and retryable. `provider_error` says so
 * on the meeting, and syncMeeting() retries it.
 *
 * Timelines are appended to the tables that already own them: lead_events and
 * job_events. There is no third activity log.
 */

// ── Timeline ─────────────────────────────────────────────────────────

type TimelineAction = "scheduled" | "rescheduled" | "completed" | "cancelled" | "no_show";

function whenLabel(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: timezone || BUSINESS_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TIMELINE_HEAD: Record<TimelineAction, string> = {
  scheduled: "Meeting scheduled",
  rescheduled: "Meeting rescheduled",
  completed: "Meeting completed",
  cancelled: "Meeting cancelled",
  no_show: "Meeting — no show",
};

/**
 * Appends to whichever timelines this meeting belongs on.
 *
 * A customer that came from a lead writes to that lead's timeline, which is
 * what the client record already reads — so a meeting with a converted client
 * still shows up in their history without a second event table.
 *
 * Never fatal. A meeting that happened is a fact; failing to write a note
 * about it must not undo it.
 */
async function writeTimeline(
  sb: SupabaseClient,
  meeting: Meeting,
  action: TimelineAction,
  detail: string | null,
  actor: string | null
): Promise<void> {
  const head = TIMELINE_HEAD[action];
  const body = [
    `${head}: ${meeting.title}`,
    `${TYPE_LABELS[meeting.meeting_type]} · ${whenLabel(meeting.start_at, meeting.timezone)}`,
    detail,
  ].filter(Boolean).join("\n");

  let leadId = meeting.lead_id;
  if (!leadId && meeting.customer_id) {
    const { data } = await sb
      .from("customers").select("lead_id").eq("id", meeting.customer_id).maybeSingle();
    leadId = (data?.lead_id as string | undefined) ?? null;
  }

  const writes: PromiseLike<unknown>[] = [];

  if (leadId) {
    writes.push(
      sb.from("lead_events").insert({
        lead_id: leadId,
        // `appointment` is the existing vocabulary for "a conversation was
        // arranged". meta carries what makes this one a meeting.
        type: "appointment",
        body,
        actor: actor ?? "system",
        meta: {
          kind: "meeting",
          meeting_id: meeting.id,
          action,
          meeting_type: meeting.meeting_type,
          provider: meeting.provider,
          start_at: meeting.start_at,
          outcome: meeting.outcome,
        },
      })
    );
  }

  if (meeting.job_id) {
    writes.push(
      sb.from("job_events").insert({
        job_id: meeting.job_id,
        kind: "note",
        body,
        actor: actor ?? "system",
      })
    );
  }

  if (meeting.proposal_id) {
    writes.push(
      sb.from("proposal_events").insert({
        proposal_id: meeting.proposal_id,
        event_type: "note",
        body,
        actor: actor ?? "system",
        metadata: { meeting_id: meeting.id, action },
      })
    );
  }

  const settled = await Promise.allSettled(writes.map(async (write) => write));
  for (const result of settled) {
    if (result.status === "rejected") console.error("Meeting timeline write failed:", result.reason);
  }
}

// ── Provider payload ─────────────────────────────────────────────────

function attendeesOf(meeting: Meeting): { email: string; name?: string | null }[] {
  const list: { email: string; name?: string | null }[] = [];
  if (meeting.attendee_email) {
    list.push({ email: meeting.attendee_email, name: meeting.attendee_name });
  }
  for (const extra of meeting.extra_attendees ?? []) {
    if (extra?.email) list.push({ email: extra.email, name: extra.name ?? null });
  }
  return list;
}

function providerInput(meeting: Meeting, notify: boolean): ProviderMeetingInput {
  const description = [meeting.description, meeting.agenda ? `Agenda:\n${meeting.agenda}` : null]
    .filter(Boolean).join("\n\n") || null;

  return {
    title: meeting.title,
    description,
    startAt: meeting.start_at,
    endAt: meeting.end_at,
    timezone: meeting.timezone || BUSINESS_TZ,
    location: meeting.location,
    attendees: attendeesOf(meeting),
    notifyAttendees: notify,
  };
}

async function applyResult(
  sb: SupabaseClient,
  meetingId: string,
  result: ProviderResult
): Promise<void> {
  await sb.from("meetings").update({
    provider_event_id: result.eventId,
    provider_calendar_id: result.calendarId,
    meeting_url: result.joinUrl,
    provider_metadata: result.metadata,
    provider_synced_at: new Date().toISOString(),
    provider_error: null,
  }).eq("id", meetingId);
}

async function recordProviderError(
  sb: SupabaseClient,
  meetingId: string,
  message: string
): Promise<void> {
  await sb.from("meetings")
    .update({ provider_error: message.slice(0, 500) })
    .eq("id", meetingId);
}

function messageOf(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong talking to the meeting provider.";
}

// ── Create ───────────────────────────────────────────────────────────

export type ScheduleInput = {
  leadId?: string | null;
  customerId?: string | null;
  companyId?: string | null;
  jobId?: string | null;
  proposalId?: string | null;

  title: string;
  meetingType: MeetingType;
  description?: string | null;
  agenda?: string | null;
  location?: string | null;

  provider: MeetingProviderKey;
  startAt: string;
  endAt: string;
  timezone?: string;

  attendeeName?: string | null;
  attendeeEmail?: string | null;
  attendeePhone?: string | null;
  extraAttendees?: { email: string; name?: string | null }[];

  owner?: string | null;
  notifyAttendees: boolean;
};

export type ScheduleResult = {
  meeting: Meeting;
  /** Null when everything worked. A sentence to show when it did not. */
  providerError: string | null;
};

export async function scheduleMeeting(
  sb: SupabaseClient,
  input: ScheduleInput,
  actor: string | null
): Promise<ScheduleResult> {
  if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
    throw new Error("A meeting has to end after it starts.");
  }
  if (PROVIDER_IS_VIDEO[input.provider] && !input.attendeeEmail) {
    throw new Error(
      "A video meeting needs an email address to send the invitation to. Add one to the contact, or pick Phone."
    );
  }

  const { data, error } = await sb
    .from("meetings")
    .insert({
      lead_id: input.leadId ?? null,
      customer_id: input.customerId ?? null,
      company_id: input.companyId ?? null,
      job_id: input.jobId ?? null,
      proposal_id: input.proposalId ?? null,
      title: input.title,
      meeting_type: input.meetingType,
      description: input.description ?? null,
      agenda: input.agenda ?? null,
      location: input.location ?? null,
      provider: input.provider,
      start_at: input.startAt,
      end_at: input.endAt,
      timezone: input.timezone || BUSINESS_TZ,
      status: "scheduled",
      attendee_name: input.attendeeName ?? null,
      attendee_email: input.attendeeEmail ?? null,
      attendee_phone: input.attendeePhone ?? null,
      extra_attendees: input.extraAttendees ?? [],
      owner: input.owner ?? actor,
      created_by: actor,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Could not save the meeting: ${error?.message ?? "unknown"}`);
  }
  const meeting = data as Meeting;

  let providerError: string | null = null;
  try {
    const result = await providerFor(input.provider).create(providerInput(meeting, input.notifyAttendees));
    await applyResult(sb, meeting.id, result);
    meeting.provider_event_id = result.eventId;
    meeting.provider_calendar_id = result.calendarId;
    meeting.meeting_url = result.joinUrl;
  } catch (error: unknown) {
    providerError = messageOf(error);
    await recordProviderError(sb, meeting.id, providerError);
    meeting.provider_error = providerError;
  }

  await writeTimeline(
    sb, meeting, "scheduled",
    providerError ? `The invitation was NOT sent: ${providerError}` : null,
    actor
  );

  return { meeting, providerError };
}

/** Retry the provider for a meeting whose first attempt failed. */
export async function syncMeeting(
  sb: SupabaseClient,
  meeting: Meeting,
  notify: boolean
): Promise<string | null> {
  try {
    const provider = providerFor(meeting.provider);
    const result = meeting.provider_event_id
      ? await provider.update(meeting.provider_event_id, meeting.provider_calendar_id, providerInput(meeting, notify))
      : await provider.create(providerInput(meeting, notify));
    await applyResult(sb, meeting.id, result);
    return null;
  } catch (error: unknown) {
    const message = messageOf(error);
    await recordProviderError(sb, meeting.id, message);
    return message;
  }
}

// ── Reschedule ───────────────────────────────────────────────────────

/**
 * Moves a meeting.
 *
 * The provider is asked first here, unlike create — because the event already
 * exists and a PATCH either moves it or does not. Writing our new time before
 * knowing whether Google accepted it would leave the two disagreeing about
 * when the client should turn up, which is the one thing rescheduling must
 * never do.
 *
 * The Meet link survives: the update patches only the times, so the room,
 * its id and its URL are untouched. Nobody gets a second invitation to a
 * different room.
 */
export async function rescheduleMeeting(
  sb: SupabaseClient,
  meeting: Meeting,
  next: { startAt: string; endAt: string; notify: boolean; reason?: string | null },
  actor: string | null
): Promise<{ meeting: Meeting; providerError: string | null }> {
  if (new Date(next.endAt).getTime() <= new Date(next.startAt).getTime()) {
    throw new Error("A meeting has to end after it starts.");
  }

  const moved: Meeting = { ...meeting, start_at: next.startAt, end_at: next.endAt };
  let providerError: string | null = null;

  if (meeting.provider_event_id) {
    try {
      const result = await providerFor(meeting.provider).update(
        meeting.provider_event_id,
        meeting.provider_calendar_id,
        providerInput(moved, next.notify)
      );
      moved.meeting_url = result.joinUrl ?? meeting.meeting_url;
    } catch (error: unknown) {
      providerError = messageOf(error);
    }
  } else {
    providerError = "This meeting was never sent to the provider, so only the local time changed.";
  }

  const { data, error } = await sb
    .from("meetings")
    .update({
      start_at: next.startAt,
      end_at: next.endAt,
      // Rescheduling puts a completed or cancelled meeting back in play.
      status: "scheduled",
      meeting_url: moved.meeting_url,
      provider_error: providerError,
      provider_synced_at: providerError ? meeting.provider_synced_at : new Date().toISOString(),
    })
    .eq("id", meeting.id)
    .select("*")
    .single();

  if (error || !data) throw new Error(`Could not move the meeting: ${error?.message ?? "unknown"}`);
  const saved = data as Meeting;

  const detail = [
    `Moved from ${whenLabel(meeting.start_at, meeting.timezone)} to ${whenLabel(next.startAt, saved.timezone)}.`,
    next.reason ? `Reason: ${next.reason}` : null,
    providerError ? `The provider was NOT updated: ${providerError}` : null,
  ].filter(Boolean).join(" ");

  await writeTimeline(sb, saved, "rescheduled", detail, actor);
  return { meeting: saved, providerError };
}

// ── Cancel ───────────────────────────────────────────────────────────

/**
 * Cancels a meeting.
 *
 * Local state wins here. If the provider refuses, the meeting is still
 * cancelled in this system and the failure is recorded on the row — because
 * the person clicked Cancel, and leaving it "scheduled" because Google
 * hiccuped would put a meeting nobody is attending back on the calendar. The
 * error text tells them to remove it from Google by hand.
 */
export async function cancelMeeting(
  sb: SupabaseClient,
  meeting: Meeting,
  options: { reason?: string | null; notify: boolean; noShow?: boolean },
  actor: string | null
): Promise<{ meeting: Meeting; providerError: string | null }> {
  let providerError: string | null = null;

  if (meeting.provider_event_id) {
    try {
      await providerFor(meeting.provider).cancel(
        meeting.provider_event_id, meeting.provider_calendar_id, options.notify
      );
    } catch (error: unknown) {
      providerError = `${messageOf(error)} Remove it from Google Calendar by hand.`;
    }
  }

  const status: MeetingStatus = options.noShow ? "no_show" : "cancelled";

  const { data, error } = await sb
    .from("meetings")
    .update({
      status,
      cancel_reason: options.reason ?? null,
      provider_error: providerError,
    })
    .eq("id", meeting.id)
    .select("*")
    .single();

  if (error || !data) throw new Error(`Could not cancel the meeting: ${error?.message ?? "unknown"}`);
  const saved = data as Meeting;

  await writeTimeline(
    sb, saved, options.noShow ? "no_show" : "cancelled",
    [options.reason, providerError].filter(Boolean).join(" ") || null,
    actor
  );

  return { meeting: saved, providerError };
}

// ── Complete ─────────────────────────────────────────────────────────

export type CompleteInput = {
  outcome: MeetingOutcome;
  notes?: string | null;
  nextSteps?: string | null;
  followUpRequired: boolean;
  followUpDate?: string | null;
  /** Create a task in the existing task system for the follow-up. */
  createTask: boolean;
  taskTitle?: string | null;
};

export type CompleteResult = {
  meeting: Meeting;
  taskId: string | null;
  taskTitle: string | null;
};

/**
 * Records what happened, and turns it into work if it needs to.
 *
 * The follow-up task is a row in `tasks` — the same table /admin/tasks reads,
 * with the same owner, the same priority vocabulary and the same links back
 * to the lead, client and project. There is no meetings to-do list.
 */
export async function completeMeeting(
  sb: SupabaseClient,
  meeting: Meeting,
  input: CompleteInput,
  actor: string | null
): Promise<CompleteResult> {
  const needsFollowUp =
    input.followUpRequired || OUTCOMES_IMPLYING_FOLLOW_UP.includes(input.outcome);

  // The database refuses a completed meeting that needs a follow-up with no
  // date on it, so a sensible default beats an error the person cannot fix
  // from the panel they are looking at.
  const followUpDate = needsFollowUp
    ? (input.followUpDate || defaultFollowUpDate(meeting.timezone))
    : null;

  let taskId: string | null = null;
  let taskTitle: string | null = null;

  if (needsFollowUp && input.createTask) {
    const who = meeting.attendee_name || meeting.title;
    taskTitle = (input.taskTitle || `Follow up with ${who}`).slice(0, 200);

    const { data: task, error: taskError } = await sb
      .from("tasks")
      .insert({
        title: taskTitle,
        notes: [input.nextSteps, input.notes].filter(Boolean).join("\n\n") || null,
        kind: "followup",
        type: "sales",
        priority: "high",
        due_at: `${followUpDate}T17:00:00.000Z`,
        owner: meeting.owner ?? actor,
        lead_id: meeting.lead_id,
        customer_id: meeting.customer_id,
        job_id: meeting.job_id,
        meeting_id: meeting.id,
        created_by: actor,
        source: "system",
      })
      .select("id")
      .single();

    if (taskError) {
      // A task that could not be opened is a follow-up, not a failed meeting.
      console.error("Follow-up task failed:", taskError);
      taskTitle = null;
    } else {
      taskId = (task?.id as string | undefined) ?? null;
    }
  }

  const { data, error } = await sb
    .from("meetings")
    .update({
      status: "completed",
      outcome: input.outcome,
      internal_notes: input.notes ?? null,
      next_steps: input.nextSteps ?? null,
      follow_up_required: needsFollowUp,
      follow_up_date: followUpDate,
      follow_up_task_id: taskId,
    })
    .eq("id", meeting.id)
    .select("*")
    .single();

  if (error || !data) throw new Error(`Could not save the meeting: ${error?.message ?? "unknown"}`);
  const saved = data as Meeting;

  const detail = [
    input.notes,
    input.nextSteps ? `Next steps: ${input.nextSteps}` : null,
    needsFollowUp && followUpDate ? `Follow-up due ${followUpDate}.` : null,
    taskTitle ? `Task created: ${taskTitle}` : null,
  ].filter(Boolean).join("\n");

  await writeTimeline(sb, saved, "completed", detail || null, actor);
  return { meeting: saved, taskId, taskTitle };
}

/** Three days out, in the meeting's own timezone. */
function defaultFollowUpDate(timezone: string): string {
  const at = new Date(Date.now() + 3 * 24 * 3600_000);
  return at.toLocaleDateString("en-CA", { timeZone: timezone || BUSINESS_TZ });
}

/** Moves a meeting into or out of "happening now" without other side effects. */
export async function setMeetingStatus(
  sb: SupabaseClient,
  meetingId: string,
  status: MeetingStatus
): Promise<void> {
  await sb.from("meetings").update({ status }).eq("id", meetingId);
}
