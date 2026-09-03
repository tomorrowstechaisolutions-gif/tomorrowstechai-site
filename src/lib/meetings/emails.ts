import "server-only";
import { Resend } from "resend";
import {
  BRAND, C, renderEmail, eyebrow, heading, paragraph, factPanel, button,
  linkFallback, fineprint, signoff, esc, escMultiline,
} from "@/lib/email/brand";
import { PROVIDER_LABELS, TYPE_LABELS } from "./config";
import type { MeetingWithLinks } from "./types";

/**
 * Meeting email, through the same Resend account and the same branded shell
 * every other message uses. No new email infrastructure.
 *
 * Google Calendar still sends the OFFICIAL invitation — the one with the .ics
 * attachment that lands in the client's calendar. These are the human ones:
 * a nudge with the link in it, a reminder, and a follow-up after the fact.
 * Sending both is deliberate; a calendar invite is easy to miss in a busy
 * inbox and impossible to reply to.
 */

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function fromEmail(): string {
  return process.env.CONTACT_FROM_EMAIL || "Tomorrow's Tech AI <hello@tomorrowstechai.com>";
}

function firstName(meeting: MeetingWithLinks): string {
  const name = (meeting.attendee_name || meeting.contactName || "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

function whenLong(meeting: MeetingWithLinks): string {
  return new Date(meeting.start_at).toLocaleString("en-US", {
    timeZone: meeting.timezone,
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

function rows(meeting: MeetingWithLinks) {
  return [
    { label: "What", value: TYPE_LABELS[meeting.meeting_type] },
    { label: "When", value: whenLong(meeting), strong: true },
    { label: "How long", value: `${meeting.duration_minutes} minutes` },
    {
      label: "Where",
      value: PROVIDER_LABELS[meeting.provider],
      note: meeting.location ?? undefined,
    },
  ];
}

export type MeetingEmailKind = "invite" | "reminder" | "follow_up";

const COPY: Record<MeetingEmailKind, { eyebrow: string; subjectPrefix: string }> = {
  invite: { eyebrow: "You're booked in", subjectPrefix: "" },
  reminder: { eyebrow: "Coming up", subjectPrefix: "Reminder — " },
  follow_up: { eyebrow: "Thanks for your time", subjectPrefix: "Following up — " },
};

/**
 * Sends one of the three. Returns false rather than throwing when Resend is
 * not configured, because an email that could not go out must never undo a
 * meeting that already exists.
 */
export async function sendMeetingEmail(
  kind: MeetingEmailKind,
  meeting: MeetingWithLinks,
  note?: string | null
): Promise<boolean> {
  const client = resend();
  const to = meeting.attendee_email;
  if (!client || !to) return false;

  const name = firstName(meeting);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const copy = COPY[kind];
  const trimmedNote = note?.trim() || null;
  const joinable = Boolean(meeting.meeting_url);

  const lede =
    kind === "invite"
      ? `${esc(greeting)} we're set for <strong style="color:${C.text};">${esc(whenLong(meeting))}</strong>. Everything you need is below.`
      : kind === "reminder"
        ? `${esc(greeting)} just a nudge that we're speaking <strong style="color:${C.text};">${esc(whenLong(meeting))}</strong>.`
        : `${esc(greeting)} thank you for your time. Here's what we covered and what happens next.`;

  const blocks = [
    eyebrow(copy.eyebrow),
    heading(meeting.title),
    paragraph(lede),
    kind === "follow_up" ? "" : factPanel(rows(meeting)),
    trimmedNote ? paragraph(escMultiline(trimmedNote)) : "",
    joinable && kind !== "follow_up" ? button("Join the meeting", meeting.meeting_url as string) : "",
    joinable && kind !== "follow_up" ? linkFallback(meeting.meeting_url as string) : "",
    meeting.agenda && kind !== "follow_up"
      ? paragraph(`<strong style="color:${C.text};">On the agenda</strong><br />${escMultiline(meeting.agenda)}`, { dim: true })
      : "",
    kind === "follow_up" && meeting.next_steps
      ? paragraph(`<strong style="color:${C.text};">Next steps</strong><br />${escMultiline(meeting.next_steps)}`)
      : "",
    fineprint(
      kind === "follow_up"
        ? "Anything I have missed, just reply to this email."
        : "Need a different time? Reply to this email and we will move it."
    ),
    signoff(),
  ].filter(Boolean);

  const html = renderEmail({
    preheader:
      kind === "follow_up"
        ? `Notes and next steps from ${meeting.title}.`
        : `${TYPE_LABELS[meeting.meeting_type]} · ${whenLong(meeting)}${joinable ? " · link inside" : ""}`,
    blocks,
    tone: kind === "follow_up" ? "success" : "default",
  });

  const text = `${greeting}

${kind === "follow_up" ? "Thank you for your time." : meeting.title}

What:     ${TYPE_LABELS[meeting.meeting_type]}
When:     ${whenLong(meeting)}
How long: ${meeting.duration_minutes} minutes
Where:    ${PROVIDER_LABELS[meeting.provider]}${meeting.location ? ` — ${meeting.location}` : ""}
${meeting.meeting_url ? `\nJoin: ${meeting.meeting_url}\n` : ""}${trimmedNote ? `\n${trimmedNote}\n` : ""}${meeting.agenda ? `\nAgenda:\n${meeting.agenda}\n` : ""}${kind === "follow_up" && meeting.next_steps ? `\nNext steps:\n${meeting.next_steps}\n` : ""}
— ${BRAND.signer}
${BRAND.signerRole}
${BRAND.site}
${BRAND.phone}`;

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to,
      subject: `${copy.subjectPrefix}${meeting.title}`,
      html,
      text,
    });
    return !res.error;
  } catch (error) {
    console.error("Meeting email failed:", error);
    return false;
  }
}
