"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  MEETING_OUTCOMES, MEETING_PROVIDERS, MEETING_STATUSES, MEETING_TYPES,
  PROVIDER_IS_VIDEO, TYPE_DEFAULT_MINUTES, suggestedTitle,
} from "@/lib/meetings/config";
import type {
  MeetingOutcome, MeetingProviderKey, MeetingStatus, MeetingType,
} from "@/lib/meetings/config";
import { getMeetingById, getMeetingRow } from "@/lib/meetings/queries";
import { sendMeetingEmail } from "@/lib/meetings/emails";
import type { MeetingEmailKind } from "@/lib/meetings/emails";
import {
  cancelMeeting, completeMeeting, rescheduleMeeting, scheduleMeeting,
  setMeetingStatus, syncMeeting,
} from "@/lib/meetings/service";
import type { Meeting } from "@/lib/meetings/types";
import { disconnectGoogle } from "@/lib/google/oauth";
import { BUSINESS_TZ } from "@/lib/time/chicago";

/**
 * Every write the Meetings feature makes.
 *
 * Thin on purpose: parse the form, check the person, hand it to the service.
 * The service owns the ordering, the provider and the timeline, so an action
 * here and a future webhook there cannot end up doing it two different ways.
 *
 * Errors are thrown with a sentence, not a code. Next surfaces a thrown
 * server-action error to the caller, and the caller is a person who needs to
 * know whether to retry, reconnect Google, or pick a different provider.
 */

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

function idOrNull(fd: FormData, key: string): string | null {
  const value = str(fd, key, 40);
  return value.length >= 32 ? value : null;
}

function typeOf(value: string): MeetingType {
  return (MEETING_TYPES as readonly string[]).includes(value) ? (value as MeetingType) : "custom";
}

function providerOf(value: string): MeetingProviderKey {
  return (MEETING_PROVIDERS as readonly string[]).includes(value)
    ? (value as MeetingProviderKey) : "google_meet";
}

/**
 * A local date and time in the business timezone, as a UTC instant.
 *
 * The form posts what a person typed on a wall clock. Building the instant
 * here — rather than `new Date("2026-09-09T14:00")`, which is parsed in the
 * SERVER's zone — is what stops a meeting drifting by an hour when Vercel
 * runs it in UTC.
 */
function instantFrom(date: string, time: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("That date and time did not look right. Use the pickers and try again.");
  }
  const naive = new Date(`${date}T${time}:00Z`);
  // What the server thinks that wall time is, in the business zone, tells us
  // the offset to subtract. Two passes, because the offset can change across
  // the very boundary being converted.
  const offsetAt = (probe: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || BUSINESS_TZ,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(probe);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return (asUtc - probe.getTime()) / 60_000;
  };
  const first = new Date(naive.getTime() - offsetAt(naive) * 60_000);
  const instant = new Date(naive.getTime() - offsetAt(first) * 60_000);
  if (Number.isNaN(instant.getTime())) throw new Error("That date and time could not be read.");
  return instant.toISOString();
}

function durationFrom(fd: FormData, type: MeetingType): number {
  const raw = str(fd, "duration", 10);
  const custom = str(fd, "duration_custom", 10);
  const minutes = raw === "custom" ? Number(custom) : Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return TYPE_DEFAULT_MINUTES[type];
  return Math.min(Math.max(Math.round(minutes), 5), 8 * 60);
}

/** Every screen a meeting can appear on. */
function touch(meeting: Pick<Meeting, "lead_id" | "customer_id" | "job_id" | "proposal_id">) {
  revalidatePath("/admin/meetings");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  if (meeting.lead_id) revalidatePath(`/admin/leads/${meeting.lead_id}`);
  if (meeting.customer_id) revalidatePath(`/admin/clients/${meeting.customer_id}`);
  if (meeting.job_id) revalidatePath(`/admin/jobs/${meeting.job_id}`);
  if (meeting.proposal_id) revalidatePath(`/admin/proposals/${meeting.proposal_id}`);
}

// ═══════════════════════════════════════════════════════════════════════
// Schedule
// ═══════════════════════════════════════════════════════════════════════

export async function scheduleMeetingAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const meetingType = typeOf(str(formData, "meeting_type", 40));
  const provider = providerOf(str(formData, "provider", 30));
  const timezone = str(formData, "timezone", 60) || BUSINESS_TZ;

  const startAt = instantFrom(str(formData, "date", 12), str(formData, "time", 6), timezone);
  const minutes = durationFrom(formData, meetingType);
  const endAt = new Date(new Date(startAt).getTime() + minutes * 60_000).toISOString();

  const attendeeEmail = str(formData, "attendee_email", 320).toLowerCase() || null;
  if (PROVIDER_IS_VIDEO[provider] && !attendeeEmail) {
    throw new Error(
      "A video meeting needs an email address to send the invitation to. Add one, or choose Phone or In Person."
    );
  }

  const company = str(formData, "company", 200);
  const title = str(formData, "title", 200) || suggestedTitle(meetingType, company);

  const { meeting, providerError } = await scheduleMeeting(
    supabase,
    {
      leadId: idOrNull(formData, "lead_id"),
      customerId: idOrNull(formData, "customer_id"),
      companyId: idOrNull(formData, "company_id"),
      jobId: idOrNull(formData, "job_id"),
      proposalId: idOrNull(formData, "proposal_id"),
      title,
      meetingType,
      description: str(formData, "description", 4000) || null,
      agenda: str(formData, "agenda", 4000) || null,
      location: str(formData, "location", 400) || null,
      provider,
      startAt,
      endAt,
      timezone,
      attendeeName: str(formData, "attendee_name", 200) || null,
      attendeeEmail,
      attendeePhone: str(formData, "attendee_phone", 40) || null,
      owner: str(formData, "owner", 200) || actor,
      notifyAttendees: !flag(formData, "no_invite"),
    },
    actor
  );

  touch(meeting);

  // A provider failure is not a lost meeting — the row exists and can be
  // retried — but the person must be told before they walk away thinking an
  // invitation went out.
  if (providerError) {
    throw new Error(
      `The meeting was saved, but the invitation was not sent: ${providerError} `
      + "Open it under Meetings and press Retry once that is fixed."
    );
  }

  const back = str(formData, "return_to", 300);
  redirect(back || `/admin/meetings?meeting=${meeting.id}`);
}

// ═══════════════════════════════════════════════════════════════════════
// Reschedule, cancel, complete
// ═══════════════════════════════════════════════════════════════════════

export async function rescheduleMeetingAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const meeting = await getMeetingRow(supabase, str(formData, "meeting_id", 40));
  if (!meeting) throw new Error("That meeting no longer exists.");

  const timezone = meeting.timezone || BUSINESS_TZ;
  const startAt = instantFrom(str(formData, "date", 12), str(formData, "time", 6), timezone);
  const minutes = durationFrom(formData, meeting.meeting_type);
  const endAt = new Date(new Date(startAt).getTime() + minutes * 60_000).toISOString();

  const { meeting: saved, providerError } = await rescheduleMeeting(
    supabase, meeting,
    { startAt, endAt, notify: !flag(formData, "no_invite"), reason: str(formData, "reason", 500) || null },
    actor
  );

  touch(saved);
  if (providerError) {
    throw new Error(`The new time was saved, but the invitation was not updated: ${providerError}`);
  }
}

export async function cancelMeetingAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const meeting = await getMeetingRow(supabase, str(formData, "meeting_id", 40));
  if (!meeting) throw new Error("That meeting no longer exists.");

  const { meeting: saved, providerError } = await cancelMeeting(
    supabase, meeting,
    {
      reason: str(formData, "reason", 500) || null,
      notify: !flag(formData, "no_invite"),
      noShow: flag(formData, "no_show"),
    },
    actor
  );

  touch(saved);
  if (providerError) throw new Error(providerError);
}

export async function completeMeetingAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const meeting = await getMeetingRow(supabase, str(formData, "meeting_id", 40));
  if (!meeting) throw new Error("That meeting no longer exists.");

  const outcomeRaw = str(formData, "outcome", 40);
  const outcome: MeetingOutcome = (MEETING_OUTCOMES as readonly string[]).includes(outcomeRaw)
    ? (outcomeRaw as MeetingOutcome) : "other";

  const followUpDate = str(formData, "follow_up_date", 12);

  const { meeting: saved, taskTitle } = await completeMeeting(
    supabase, meeting,
    {
      outcome,
      notes: str(formData, "notes", 8000) || null,
      nextSteps: str(formData, "next_steps", 4000) || null,
      followUpRequired: flag(formData, "follow_up_required"),
      followUpDate: /^\d{4}-\d{2}-\d{2}$/.test(followUpDate) ? followUpDate : null,
      createTask: flag(formData, "create_task"),
      taskTitle: str(formData, "task_title", 200) || null,
    },
    actor
  );

  touch(saved);
  if (taskTitle) revalidatePath("/admin/tasks");
}

/** Confirmed, no-show, or back to scheduled — one small status change. */
export async function setMeetingStatusAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const meeting = await getMeetingRow(supabase, str(formData, "meeting_id", 40));
  if (!meeting) return;

  const raw = str(formData, "status", 30);
  if (!(MEETING_STATUSES as readonly string[]).includes(raw)) return;
  const status = raw as MeetingStatus;

  if (status === "completed") {
    throw new Error("Completing a meeting asks what came out of it. Use Mark complete.");
  }
  if (status === "cancelled") {
    throw new Error("Cancelling has to tell the client too. Use Cancel.");
  }

  await setMeetingStatus(supabase, meeting.id, status);
  touch(meeting);
}

/** Retry the provider for a meeting whose invitation never went out. */
export async function syncMeetingAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const meeting = await getMeetingRow(supabase, str(formData, "meeting_id", 40));
  if (!meeting) throw new Error("That meeting no longer exists.");

  const error = await syncMeeting(supabase, meeting, true);
  touch(meeting);
  if (error) throw new Error(error);
}


// ═══════════════════════════════════════════════════════════════════════
// Email
// ═══════════════════════════════════════════════════════════════════════

/**
 * Sends the human email — the invite with the link in it, a reminder, or the
 * follow-up. Google Calendar still sends the official invitation with the
 * .ics attachment; this is the one a person can reply to.
 */
export async function emailMeetingAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const meeting = await getMeetingById(supabase, str(formData, "meeting_id", 40));
  if (!meeting) throw new Error("That meeting no longer exists.");

  if (!meeting.attendee_email) {
    throw new Error("There is no email address on this meeting to send to.");
  }

  const raw = str(formData, "kind", 20);
  const kind: MeetingEmailKind =
    raw === "reminder" || raw === "follow_up" ? raw : "invite";

  const sent = await sendMeetingEmail(kind, meeting, str(formData, "note", 2000) || null);
  if (!sent) {
    throw new Error(
      "The email did not go out — RESEND_API_KEY is not configured, so send the link by hand."
    );
  }
  touch(meeting);
}


/** Forgets the Google connection. The refresh token is deleted, not blanked. */
export async function disconnectGoogleAction() {
  await requireAdmin();
  await disconnectGoogle();
  revalidatePath("/admin/settings");
  revalidatePath("/admin/meetings");
}
