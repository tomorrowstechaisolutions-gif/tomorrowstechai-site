import "server-only";
import { Resend } from "resend";
import { emailCopy } from "@/lib/system-emails/store";
import { buildMeetingEmail, type MeetingEmailKind } from "./email-content";
import type { MeetingWithLinks } from "./types";

export type { MeetingEmailKind } from "./email-content";

/**
 * Meeting email, through the same Resend account and the same branded shell
 * every other message uses. No new email infrastructure.
 *
 * Google Calendar still sends the OFFICIAL invitation — the one with the .ics
 * attachment that lands in the client's calendar. These are the human ones:
 * a nudge with the link in it, a reminder, and a follow-up after the fact.
 * Sending both is deliberate; a calendar invite is easy to miss in a busy
 * inbox and impossible to reply to.
 *
 * What each one says lives in email-content.ts (pure, so the System emails
 * page can preview it); edited wording is read here right before sending.
 */

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function fromEmail(): string {
  return process.env.CONTACT_FROM_EMAIL || "Tomorrow's Tech AI <hello@tomorrowstechai.com>";
}

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

  try {
    const built = buildMeetingEmail(kind, meeting, note, await emailCopy(`meeting.${kind}`));
    const res = await client.emails.send({
      from: fromEmail(),
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
    });
    return !res.error;
  } catch (error) {
    console.error("Meeting email failed:", error);
    return false;
  }
}
