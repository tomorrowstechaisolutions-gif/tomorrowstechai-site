/**
 * What every meeting email says, and what it looks like.
 *
 * Split out from emails.ts the same way the invoice emails are: sending needs
 * `server-only` and the Resend client, composing needs neither, so the
 * System emails page can preview these with sample data.
 *
 * The meeting itself (title, time, length, where, join link, agenda, next
 * steps, the note typed when sending) is data and always comes from the
 * record. Only the wording around it is editable.
 */

import {
  BRAND, C, renderEmail, eyebrow, heading, paragraph, factPanel, button,
  linkFallback, fineprint, signoff, esc, escMultiline,
} from "@/lib/email/brand";
import { fill, resolveCopy, type CopySlot, type CopyVars, type EmailCopy } from "@/lib/system-emails/copy";
import { PROVIDER_LABELS, TYPE_LABELS } from "./config";
import type { MeetingWithLinks } from "./types";

export type BuiltEmail = { subject: string; html: string; text: string };

export type MeetingEmailKind = "invite" | "reminder" | "follow_up";

function firstName(meeting: MeetingWithLinks): string {
  const name = (meeting.attendee_name || meeting.contactName || "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

export function whenLong(meeting: MeetingWithLinks): string {
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

// ═══════════════════════════════════════════════════════════════════════
// Editable wording (System emails page). Defaults are the shipped text.
// ═══════════════════════════════════════════════════════════════════════

const AGENDA_SLOT: CopySlot = { key: "agenda_heading", label: "Agenda heading (shown when there's an agenda)", default: "On the agenda" };
const BUTTON_SLOT: CopySlot = { key: "button", label: "Join button (shown when there's a meeting link)", default: "Join the meeting" };
const MOVE_SLOT: CopySlot = { key: "fineprint", label: "Small print", default: "Need a different time? Reply to this email and we will move it." };

export const MEETING_SLOTS: Record<MeetingEmailKind, CopySlot[]> = {
  invite: [
    { key: "subject", label: "Subject", default: "{title}" },
    { key: "eyebrow", label: "Small label above the title", default: "You're booked in" },
    { key: "lede", label: "Opening line", default: "{greeting} we're set for {when}. Everything you need is below.", help: "{when} prints in bold." },
    BUTTON_SLOT,
    AGENDA_SLOT,
    MOVE_SLOT,
  ],
  reminder: [
    { key: "subject", label: "Subject", default: "Reminder — {title}" },
    { key: "eyebrow", label: "Small label above the title", default: "Coming up" },
    { key: "lede", label: "Opening line", default: "{greeting} just a nudge that we're speaking {when}.", help: "{when} prints in bold." },
    BUTTON_SLOT,
    AGENDA_SLOT,
    MOVE_SLOT,
  ],
  follow_up: [
    { key: "subject", label: "Subject", default: "Following up — {title}" },
    { key: "preheader", label: "Inbox preview line", default: "Notes and next steps from {title}." },
    { key: "eyebrow", label: "Small label above the title", default: "Thanks for your time" },
    { key: "lede", label: "Opening line", default: "{greeting} thank you for your time. Here's what we covered and what happens next." },
    { key: "text_opening", label: "Opening line (plain-text version)", default: "Thank you for your time." },
    { key: "next_steps_heading", label: "Next-steps heading (shown when next steps are filled in)", default: "Next steps" },
    { key: "fineprint", label: "Small print", default: "Anything I have missed, just reply to this email." },
  ],
};

/**
 * Body copy goes into element content, not an attribute, so only &, < and >
 * need escaping — which keeps the shipped apostrophes byte-for-byte.
 */
function escText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Builds one of the three. `note` is the optional message typed when sending;
 * `copy` is any edited wording from the System emails page.
 */
export function buildMeetingEmail(
  kind: MeetingEmailKind,
  meeting: MeetingWithLinks,
  note?: string | null,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(MEETING_SLOTS[kind], copy);
  const name = firstName(meeting);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const trimmedNote = note?.trim() || null;
  const joinable = Boolean(meeting.meeting_url);
  const when = whenLong(meeting);
  const followUp = kind === "follow_up";

  const vars: CopyVars = {
    greeting,
    first_name: name,
    title: meeting.title,
    when,
    meeting_type: TYPE_LABELS[meeting.meeting_type],
    company: meeting.companyName ?? "",
  };
  const f = (t: string) => fill(t, vars);
  // Same fill-ins, made safe for HTML; {when} is set in bold.
  const htmlVars: CopyVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
  htmlVars.when = `<strong style="color:${C.text};">${esc(when)}</strong>`;
  const h = (t: string) => fill(escText(t), htmlVars);

  const blocks = [
    eyebrow(f(c.eyebrow)),
    heading(meeting.title),
    paragraph(h(c.lede)),
    followUp ? "" : factPanel(rows(meeting)),
    trimmedNote ? paragraph(escMultiline(trimmedNote)) : "",
    joinable && !followUp ? button(f(c.button), meeting.meeting_url as string) : "",
    joinable && !followUp ? linkFallback(meeting.meeting_url as string) : "",
    meeting.agenda && !followUp
      ? paragraph(`<strong style="color:${C.text};">${h(c.agenda_heading)}</strong><br />${escMultiline(meeting.agenda)}`, { dim: true })
      : "",
    followUp && meeting.next_steps
      ? paragraph(`<strong style="color:${C.text};">${h(c.next_steps_heading)}</strong><br />${escMultiline(meeting.next_steps)}`)
      : "",
    fineprint(f(c.fineprint)),
    signoff(),
  ].filter(Boolean);

  const html = renderEmail({
    preheader: followUp
      ? f(c.preheader)
      : `${TYPE_LABELS[meeting.meeting_type]} · ${when}${joinable ? " · link inside" : ""}`,
    blocks,
    tone: followUp ? "success" : "default",
  });

  const text = `${greeting}

${followUp ? f(c.text_opening) : meeting.title}

What:     ${TYPE_LABELS[meeting.meeting_type]}
When:     ${when}
How long: ${meeting.duration_minutes} minutes
Where:    ${PROVIDER_LABELS[meeting.provider]}${meeting.location ? ` — ${meeting.location}` : ""}
${meeting.meeting_url ? `\nJoin: ${meeting.meeting_url}\n` : ""}${trimmedNote ? `\n${trimmedNote}\n` : ""}${meeting.agenda ? `\nAgenda:\n${meeting.agenda}\n` : ""}${followUp && meeting.next_steps ? `\n${f(c.next_steps_heading)}:\n${meeting.next_steps}\n` : ""}
— ${BRAND.signer}
${BRAND.signerRole}
${BRAND.site}
${BRAND.phone}`;

  return { subject: f(c.subject), html, text };
}
