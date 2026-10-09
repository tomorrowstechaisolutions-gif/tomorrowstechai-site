"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { providerFor } from "@/lib/meetings/providers";
import { getMeetingById, conflictsIn } from "@/lib/meetings/queries";
import { OPEN_MEETING_STATUSES } from "@/lib/meetings/config";
import type { Meeting } from "@/lib/meetings/types";
import { scheduleMeeting } from "@/lib/meetings/service";
import { sendMeetingEmail } from "@/lib/meetings/emails";
import type { MeetingWithLinks } from "@/lib/meetings/types";
import { categoryByKey } from "@/lib/conference/config";
import { CONFERENCE_PARTNERS } from "@/lib/conference/partners";
import { CONFERENCE_SCOPE, getConferenceSettings } from "@/lib/conference/settings";
import { disconnectZoom } from "@/lib/zoom/oauth";
import { BUSINESS_TZ } from "@/lib/time/chicago";

/**
 * Conference Center writes.
 *
 * These return a result object instead of throwing or redirecting, because
 * the screen has to say three different true things: "Zoom confirmed the
 * meeting", "the meeting exists but Zoom did not confirm it — retry", and
 * "the invitation email did / did not go out". A thrown error can only say
 * one of those.
 *
 * Every success message is built from what Zoom and Resend actually returned.
 */

export type ConferenceResult = {
  ok: boolean;
  error?: string;
  meetingId?: string;
  joinUrl?: string | null;
  passcode?: string | null;
  zoomMeetingId?: string | null;
  /** True when a row exists even though Zoom failed — the drawer can retry it. */
  saved?: boolean;
  duplicate?: boolean;
  emailed?: { to: string; sent: boolean }[];
  emailNote?: string;
  warning?: string | null;
};

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return { supabase: await createSupabaseServerClient(), actor: session.admin.email };
}

function str(fd: FormData, key: string, max = 4000): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function uuidOrNull(value: string): string | null {
  return UUID.test(value) ? value : null;
}

/** "lead:<uuid>" or "client:<uuid>" from the CRM picker. */
async function contactFromKey(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  key: string
): Promise<{
  leadId: string | null; customerId: string | null; companyId: string | null;
  name: string | null; company: string | null; email: string | null; phone: string | null;
} | null> {
  const [kind, id] = key.split(":");
  if (!id || !UUID.test(id)) return null;
  if (kind === "lead") {
    const { data } = await supabase.from("leads")
      .select("id, first_name, last_name, business_name, email, phone, company_id")
      .eq("id", id).maybeSingle();
    if (!data) return null;
    const l = data as { id: string; first_name: string | null; last_name: string | null; business_name: string | null; email: string | null; phone: string | null; company_id: string | null };
    return {
      leadId: l.id, customerId: null, companyId: l.company_id,
      name: [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
      company: l.business_name, email: l.email?.toLowerCase() ?? null, phone: l.phone,
    };
  }
  if (kind === "client") {
    const { data } = await supabase.from("customers")
      .select("id, lead_id, name, business_name, email, phone, company_id")
      .eq("id", id).maybeSingle();
    if (!data) return null;
    const c = data as { id: string; lead_id: string | null; name: string | null; business_name: string | null; email: string | null; phone: string | null; company_id: string | null };
    return {
      leadId: c.lead_id, customerId: c.id, companyId: c.company_id,
      name: c.name, company: c.business_name, email: c.email?.toLowerCase() ?? null, phone: c.phone,
    };
  }
  return null;
}

/** Wall-clock date + time in `timezone` → UTC instant. DST-safe (two-pass). */
function instantFrom(date: string, time: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const naive = new Date(`${date}T${time}:00Z`);
  const offsetAt = (probe: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(probe);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return (asUtc - probe.getTime()) / 60_000;
  };
  try {
    const first = new Date(naive.getTime() - offsetAt(naive) * 60_000);
    const instant = new Date(naive.getTime() - offsetAt(first) * 60_000);
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
  } catch {
    return null;
  }
}

function validTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return BUSINESS_TZ;
  }
}

function touch(meeting: { lead_id: string | null; customer_id: string | null; job_id: string | null; proposal_id: string | null }) {
  revalidatePath("/admin/conference-center");
  revalidatePath("/admin/meetings");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  if (meeting.lead_id) revalidatePath(`/admin/leads/${meeting.lead_id}`);
  if (meeting.customer_id) revalidatePath(`/admin/clients/${meeting.customer_id}`);
  if (meeting.job_id) revalidatePath(`/admin/jobs/${meeting.job_id}`);
  if (meeting.proposal_id) revalidatePath(`/admin/proposals/${meeting.proposal_id}`);
}

/** Sends the branded invitation to the guest and any extra attendees. Honest about each. */
async function emailInvites(meeting: MeetingWithLinks): Promise<{ emailed: { to: string; sent: boolean }[]; note?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { emailed: [], note: "Email is not configured (RESEND_API_KEY), so no invitation was sent. Copy the link instead." };
  }
  const recipients = [
    ...(meeting.attendee_email ? [{ email: meeting.attendee_email, name: meeting.attendee_name }] : []),
    ...(meeting.extra_attendees ?? []).map((a) => ({ email: a.email, name: a.name ?? null })),
  ];
  const emailed: { to: string; sent: boolean }[] = [];
  for (const r of recipients) {
    // The participant join_url only. The host start link never leaves the server.
    const sent = await sendMeetingEmail("invite", { ...meeting, attendee_email: r.email, attendee_name: r.name ?? null });
    emailed.push({ to: r.email, sent });
  }
  return { emailed };
}

/**
 * A repeat of a request that already created (or is creating) a meeting.
 * Checked FIRST, before conflicts or Zoom, so a double-click never reports
 * the first submit's own meeting as a clash, and never claims success for a
 * meeting Zoom has not confirmed yet.
 */
async function priorAttempt(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  requestId: string | null
): Promise<ConferenceResult | null> {
  if (!requestId) return null;
  const { data } = await supabase.from("meetings").select("*").eq("client_request_id", requestId).maybeSingle();
  if (!data) return null;
  const prior = data as Meeting;
  const meta = prior.provider_metadata ?? {};
  if (prior.provider_event_id && prior.meeting_url) {
    return {
      ok: true, duplicate: true, meetingId: prior.id, joinUrl: prior.meeting_url,
      passcode: typeof meta.passcode === "string" ? meta.passcode : null,
      zoomMeetingId: prior.provider_event_id,
    };
  }
  if (prior.provider_error) {
    return { ok: false, saved: true, meetingId: prior.id, error: `Zoom did not confirm this conference: ${prior.provider_error}` };
  }
  return {
    ok: false, saved: true, meetingId: prior.id,
    error: "This conference is still being created in Zoom. Refresh in a few seconds — do not submit it again.",
  };
}

async function zoomReady(): Promise<string | null> {
  const status = await providerFor("zoom").status();
  return status.ready ? null : (status.reason ?? "Zoom is not available.");
}

// ═══════════════════════════════════════════════════════════════════════
// Instant conference
// ═══════════════════════════════════════════════════════════════════════

export async function startInstantConferenceAction(formData: FormData): Promise<ConferenceResult> {
  const { supabase, actor } = await requireAdmin();

  const requestId = uuidOrNull(str(formData, "client_request_id", 40));
  const prior = await priorAttempt(supabase, requestId);
  if (prior) return prior;

  const notReady = await zoomReady();
  if (notReady) return { ok: false, error: notReady };

  const settings = await getConferenceSettings();
  const topic = str(formData, "title", 200) || `${settings.brand_name} Conference`;

  const start = new Date();
  const end = new Date(start.getTime() + settings.instant_duration_minutes * 60_000);

  let result;
  try {
    result = await scheduleMeeting(
      supabase,
      {
        title: topic,
        meetingType: "custom",
        provider: "zoom",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        timezone: settings.default_timezone,
        notifyAttendees: false,
        instant: true,
        source: "instant",
        clientRequestId: requestId,
      },
      actor
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not start the conference." };
  }

  const { meeting, providerError, duplicate } = result;

  if (duplicate) {
    const again = await priorAttempt(supabase, requestId);
    if (again) return again;
  }

  if (providerError || !meeting.meeting_url) {
    // An instant meeting that Zoom never created was never real: nobody was
    // invited and nothing is on a calendar. Remove the row rather than leave
    // a conference on the dashboard that cannot be joined.
    if (!duplicate) await supabase.from("meetings").delete().eq("id", meeting.id);
    return { ok: false, error: providerError ?? "Zoom did not return a join link. Nothing was created." };
  }

  touch(meeting);
  const meta = meeting.provider_metadata ?? {};
  return {
    ok: true,
    duplicate,
    meetingId: meeting.id,
    joinUrl: meeting.meeting_url,
    passcode: typeof meta.passcode === "string" ? meta.passcode : null,
    zoomMeetingId: meeting.provider_event_id,
    warning: typeof meta.plan_warning === "string" ? meta.plan_warning : null,
  };
}

/**
 * Attach a CRM contact (or a typed email) to a live instant conference and
 * email them the participant link.
 */
export async function inviteToConferenceAction(formData: FormData): Promise<ConferenceResult> {
  const { supabase, actor } = await requireAdmin();
  const id = uuidOrNull(str(formData, "meeting_id", 40));
  if (!id) return { ok: false, error: "That conference id is not valid." };

  const existing = await getMeetingById(supabase, id);
  if (!existing) return { ok: false, error: "That conference no longer exists." };
  if (!OPEN_MEETING_STATUSES.includes(existing.status)) {
    return { ok: false, error: "This conference has ended or was cancelled, so no invitation was sent." };
  }
  if (existing.provider !== "zoom" || !existing.provider_event_id || !existing.meeting_url) {
    return { ok: false, error: "This conference has no confirmed Zoom meeting yet." };
  }

  const contactKey = str(formData, "contact_key", 80);
  const typedEmail = str(formData, "email", 320).toLowerCase();
  const typedName = str(formData, "name", 200) || null;

  const contact = contactKey ? await contactFromKey(supabase, contactKey) : null;
  const email = contact?.email || typedEmail;
  if (!email || !EMAIL.test(email)) {
    return { ok: false, error: contact ? "That contact has no email address on file. Type one instead." : "Enter a valid email address." };
  }

  // The first invitee becomes the meeting's contact, which is what links it
  // to the CRM record and its timeline. Later invitees are extra attendees.
  const update: Record<string, unknown> = {};
  if (!existing.attendee_email && !existing.lead_id && !existing.customer_id) {
    Object.assign(update, {
      attendee_email: email,
      attendee_name: contact?.name ?? typedName,
      attendee_phone: contact?.phone ?? null,
      lead_id: contact?.leadId ?? null,
      customer_id: contact?.customerId ?? null,
      company_id: contact?.companyId ?? null,
    });
  } else if (email !== existing.attendee_email
    && !(existing.extra_attendees ?? []).some((a) => a.email === email)) {
    update.extra_attendees = [...(existing.extra_attendees ?? []), { email, name: contact?.name ?? typedName }];
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("meetings").update(update).eq("id", id);
    if (error) return { ok: false, error: `Could not record the invitee: ${error.message}` };
  }

  if (contact?.leadId) {
    await supabase.from("lead_events").insert({
      lead_id: contact.leadId,
      type: "appointment",
      body: `Invited to conference: ${existing.title}`,
      actor: actor ?? "system",
      meta: { kind: "meeting", meeting_id: id, action: "invited", provider: "zoom" },
    });
  }

  const refreshed = await getMeetingById(supabase, id);
  touch(refreshed ?? existing);

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: true, meetingId: id, emailed: [],
      emailNote: "Invitee recorded, but email is not configured (RESEND_API_KEY) — nothing was sent. Copy the link instead.",
    };
  }
  const sent = await sendMeetingEmail("invite", { ...(refreshed ?? existing), attendee_email: email, attendee_name: contact?.name ?? typedName });
  return {
    ok: true,
    meetingId: id,
    emailed: [{ to: email, sent }],
    emailNote: sent ? undefined : "Resend did not accept the email. Copy the link and send it by hand.",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Scheduled conference
// ═══════════════════════════════════════════════════════════════════════

export async function scheduleConferenceAction(formData: FormData): Promise<ConferenceResult> {
  const { supabase, actor } = await requireAdmin();
  const requestId = uuidOrNull(str(formData, "client_request_id", 40));
  const prior = await priorAttempt(supabase, requestId);
  if (prior) return prior;

  const settings = await getConferenceSettings();

  const category = categoryByKey(str(formData, "category", 60));
  const timezone = validTimezone(str(formData, "timezone", 60) || settings.default_timezone);
  const startAt = instantFrom(str(formData, "date", 12), str(formData, "time", 6), timezone);
  if (!startAt) return { ok: false, error: "That date and time did not look right. Use the pickers and try again." };
  if (new Date(startAt).getTime() < Date.now() - 5 * 60_000) {
    return { ok: false, error: "That time is in the past. Use Start Instant Conference to meet now." };
  }

  const minutesRaw = Number(str(formData, "duration", 6));
  const minutes = Number.isFinite(minutesRaw) && minutesRaw >= 5 && minutesRaw <= 480
    ? Math.round(minutesRaw) : category.minutes;
  const endAt = new Date(new Date(startAt).getTime() + minutes * 60_000).toISOString();

  // Who.
  const contactKey = str(formData, "contact_key", 80);
  const contact = contactKey ? await contactFromKey(supabase, contactKey) : null;
  const guestEmail = (str(formData, "guest_email", 320).toLowerCase() || contact?.email || "");
  if (!guestEmail || !EMAIL.test(guestEmail)) {
    return { ok: false, error: "A conference needs a guest email address for the invitation." };
  }
  const extraRaw = str(formData, "additional_attendees", 2000);
  const extras = Array.from(new Set(
    extraRaw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
  ));
  const badExtra = extras.find((e) => !EMAIL.test(e));
  if (badExtra) return { ok: false, error: `"${badExtra}" is not a valid email address.` };
  if (extras.length > 25) return { ok: false, error: "Add at most 25 additional attendees." };

  const partner = category.partnerKey
    ? CONFERENCE_PARTNERS.find((p) => p.key === category.partnerKey) ?? null
    : null;

  // Zoom has to be usable BEFORE a row is written, so an unconnected account
  // never leaves a half-made conference behind.
  const notReady = await zoomReady();
  if (notReady) return { ok: false, error: notReady };

  // Conflicts, with the configured buffer either side.
  if (settings.block_conflicts) {
    const buffer = settings.buffer_minutes * 60_000;
    const clashes = await conflictsIn(
      supabase,
      new Date(new Date(startAt).getTime() - buffer).toISOString(),
      new Date(new Date(endAt).getTime() + buffer).toISOString()
    );
    if (clashes.length > 0) {
      const first = clashes[0];
      const when = new Date(first.start_at).toLocaleString("en-US", {
        timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
      return {
        ok: false,
        error: `That slot overlaps "${first.title}" at ${when}${settings.buffer_minutes ? ` (with a ${settings.buffer_minutes}-minute buffer)` : ""}. Pick another time.`,
      };
    }
  }

  const title = str(formData, "title", 200)
    || `${category.label}${contact?.company ? ` — ${contact.company}` : ""}`;

  let result;
  try {
    result = await scheduleMeeting(
      supabase,
      {
        leadId: contact?.leadId ?? uuidOrNull(str(formData, "lead_id", 40)),
        customerId: contact?.customerId ?? uuidOrNull(str(formData, "customer_id", 40)),
        companyId: contact?.companyId ?? uuidOrNull(str(formData, "company_id", 40)),
        jobId: uuidOrNull(str(formData, "job_id", 40)),
        proposalId: uuidOrNull(str(formData, "proposal_id", 40)),
        title,
        meetingType: category.meetingType,
        description: partner ? `Partnership meeting with ${partner.name}.` : null,
        agenda: str(formData, "agenda", 2000) || null,
        provider: "zoom",
        startAt,
        endAt,
        timezone,
        attendeeName: str(formData, "guest_name", 200) || contact?.name || null,
        attendeeEmail: guestEmail,
        attendeePhone: contact?.phone ?? null,
        extraAttendees: extras.filter((e) => e !== guestEmail).map((email) => ({ email })),
        owner: actor,
        notifyAttendees: false,
        source: partner ? "partner" : "admin",
        clientRequestId: requestId,
      },
      actor
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not schedule the conference." };
  }

  const { meeting, providerError, duplicate } = result;
  if (duplicate) {
    // Lost a race with an identical submit: report THAT one's true state.
    const again = await priorAttempt(supabase, requestId);
    if (again) return again;
  }

  // Private, pre-meeting notes. Never sent to Zoom or to a guest.
  const notes = str(formData, "internal_notes", 4000);
  if (notes && !duplicate) {
    await supabase.from("meetings").update({ internal_notes: notes }).eq("id", meeting.id);
  }

  touch(meeting);

  if (providerError) {
    return {
      ok: false,
      saved: true,
      meetingId: meeting.id,
      error: `The conference was saved, but Zoom did not confirm it: ${providerError} Open it and press Retry once that is fixed. No invitation was sent.`,
    };
  }

  const meta = meeting.provider_metadata ?? {};
  let emailed: { to: string; sent: boolean }[] = [];
  let emailNote: string | undefined;
  if (!duplicate && settings.send_invites_by_email && formData.get("no_invite") !== "on") {
    const enriched = await getMeetingById(supabase, meeting.id);
    if (enriched) {
      const outcome = await emailInvites(enriched);
      emailed = outcome.emailed;
      emailNote = outcome.note;
    }
  } else if (!duplicate) {
    emailNote = "Invitation email was not sent (turned off). Copy the link to share it.";
  }

  return {
    ok: true,
    duplicate,
    meetingId: meeting.id,
    joinUrl: meeting.meeting_url,
    passcode: typeof meta.passcode === "string" ? meta.passcode : null,
    zoomMeetingId: meeting.provider_event_id,
    emailed,
    emailNote,
    warning: [
      typeof meta.plan_warning === "string" ? meta.plan_warning : null,
      partner && partner.syncStatus !== "active"
        ? `${partner.name} Conference Center sync is pending configuration — they receive the email invitation only.`
        : null,
    ].filter(Boolean).join(" ") || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════════════

export async function updateConferenceSettingsAction(formData: FormData): Promise<ConferenceResult> {
  const { supabase, actor } = await requireAdmin();

  const int = (key: string, min: number, max: number, fallback: number) => {
    const n = Number(str(formData, key, 6));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  const on = (key: string) => formData.get(key) === "on";
  const recording = str(formData, "zoom_auto_recording", 10);

  const { error, data } = await supabase
    .from("conference_settings")
    .update({
      default_timezone: validTimezone(str(formData, "default_timezone", 60) || BUSINESS_TZ),
      default_duration_minutes: int("default_duration_minutes", 5, 480, 30),
      instant_duration_minutes: int("instant_duration_minutes", 5, 480, 60),
      buffer_minutes: int("buffer_minutes", 0, 120, 0),
      block_conflicts: on("block_conflicts"),
      zoom_waiting_room: on("zoom_waiting_room"),
      zoom_join_before_host: on("zoom_join_before_host"),
      zoom_mute_upon_entry: on("zoom_mute_upon_entry"),
      zoom_host_video: on("zoom_host_video"),
      zoom_participant_video: on("zoom_participant_video"),
      zoom_auto_recording: ["none", "local", "cloud"].includes(recording) ? recording : "none",
      send_invites_by_email: on("send_invites_by_email"),
      updated_by: actor,
    })
    .eq("scope", CONFERENCE_SCOPE)
    .select("id");

  if (error) return { ok: false, error: `Could not save settings: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, error: "No settings row exists yet — apply the Conference Center migration first." };
  }
  revalidatePath("/admin/conference-center/settings");
  revalidatePath("/admin/conference-center");
  return { ok: true };
}

export async function disconnectZoomAction(): Promise<void> {
  await requireAdmin();
  const { revoked } = await disconnectZoom();
  revalidatePath("/admin/conference-center/settings");
  revalidatePath("/admin/conference-center");
  redirect(`/admin/conference-center/settings?zoom=disconnected${revoked ? "&revoked=1" : ""}`);
}
