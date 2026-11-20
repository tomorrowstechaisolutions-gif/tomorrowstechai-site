/**
 * What a client action request says, and what it looks like.
 *
 * Split from emails.ts for the reason email-content.ts in proposals is:
 * composing needs no `server-only` and no Resend client, so every variant can
 * be rendered to a file and looked at — scripts/preview-emails.sh — instead of
 * being reviewed by sending real mail to a real client and hoping.
 *
 * Every message carries a full plain-text alternative built from the same
 * template object, so the two halves can never say different things.
 */

import {
  BRAND, C, renderEmail, eyebrow, heading, paragraph, subheading,
  factPanel, button, linkFallback, bullets, quote, divider, fineprint,
  signoff, esc,
} from "@/lib/email/brand";
import { fill, paragraphsOf, resolveCopy, type CopySlot, type EmailCopy } from "@/lib/system-emails/copy";
import { NEVER_ASK, type RequestTemplate } from "./config";
import type { ClientRequest } from "./types";

export type BuiltEmail = { subject: string; html: string; text: string };

function firstName(r: ClientRequest): string {
  const name = (r.to_name ?? "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

function longDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "America/Chicago" });
}

function minutesLabel(m: number): string {
  if (m < 60) return `About ${m} minutes`;
  const h = Math.round((m / 60) * 10) / 10;
  return `About ${h === 1 ? "an hour" : `${h} hours`}`;
}

type Fact = { label: string; value: string; strong?: boolean; note?: string };

/**
 * The facts, once. The panel and the text version are both built from this,
 * which is what stops the email quoting a deadline the text half does not.
 */
function facts(r: ClientRequest, t: RequestTemplate): Fact[] {
  const rows: Fact[] = [
    { label: "Time it takes", value: minutesLabel(t.minutes) },
    { label: "Who can do it", value: "Only you", note: "It has to be in your name" },
  ];
  if (r.due_at) {
    rows.push({ label: "We would like it by", value: longDate(r.due_at), strong: true });
  }
  return rows;
}

function factsAsText(rows: Fact[]): string {
  return rows
    .map((row) => `  ${row.label}: ${row.value}${row.note ? ` (${row.note})` : ""}`)
    .join("\n");
}

function stepLines(t: RequestTemplate): string[] {
  return t.steps.map((s, i) => `${i + 1}. ${s.title}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Editable wording (System emails page). Defaults are the shipped text.
//
// Each request type's own words (its title, opening paragraph, steps and
// "why") live in config.ts. These slots are the wording around them.
// ═══════════════════════════════════════════════════════════════════════════

const FOOTNOTE_DEFAULT = "You are receiving this because {company} is building or maintaining your website.";
const EXPIRY_DEFAULT =
  "This link is yours alone — please do not forward it. It stays open until {expires_on}, and we can always send a fresh one.";

export const REQUEST_SLOTS: Record<"sent" | "reminder" | "completed" | "admin", CopySlot[]> = {
  sent: [
    { key: "subject", label: "Subject", default: "{title} — a quick thing we need from you" },
    { key: "intro", label: "Opening", default: "{greeting}\n\n{intro}", multiline: true, help: "{intro} is the request type's own opening paragraph." },
    { key: "steps_heading", label: "Steps heading", default: "What is involved" },
    { key: "steps_note", label: "Under the steps (dimmed)", default: "The page below walks you through each step, and there is a short form at the bottom for the few details we need back. You can stop halfway and come back to it.", multiline: true },
    { key: "button", label: "Button", default: "Open your checklist" },
    { key: "why_heading", label: "Why heading", default: "Why this one is on you" },
    { key: "expiry", label: "Private-link line", default: EXPIRY_DEFAULT },
    { key: "footnote", label: "Footer note", default: FOOTNOTE_DEFAULT },
  ],
  reminder: [
    { key: "subject", label: "Subject", default: "Still need this from you: {request}" },
    { key: "eyebrow", label: "Label above the title", default: "Still waiting on this one" },
    { key: "opening_started", label: "Opening (they made a start)", default: "{greeting}\n\nYou made a start on this — thank you. There is a little left, and once it is in we can pick straight back up.", multiline: true },
    { key: "opening_waiting", label: "Opening (not started)", default: "{greeting}\n\nJust floating this back to the top of your inbox. I sent it over on {sent_on}.", multiline: true },
    { key: "opening_waiting_undated", label: "Opening (not started, no sent date)", default: "{greeting}\n\nJust floating this back to the top of your inbox.", multiline: true },
    { key: "holding_line", label: "What it is holding up", default: "Until it is done, {blocks} — so it is worth {time} whenever you get a clear moment.", multiline: true, help: "{blocks} and {time} come from the request type." },
    { key: "button_started", label: "Button (they made a start)", default: "Pick up where you left off" },
    { key: "button", label: "Button (not started)", default: "Open your checklist" },
    { key: "phone_line", label: "Phone offer (dimmed)", default: "If something about it is not working, or you would rather I just did it with you on the phone, call me on {phone} and we will get it off your plate.", multiline: true },
    { key: "expiry", label: "Private-link line", default: EXPIRY_DEFAULT },
    { key: "footnote", label: "Footer note", default: FOOTNOTE_DEFAULT },
  ],
  completed: [
    { key: "subject", label: "Subject", default: "Got it — {noun} received" },
    { key: "eyebrow", label: "Label above the heading", default: "Got it" },
    { key: "heading", label: "Heading", default: "That is off your plate" },
    { key: "intro", label: "Opening", default: "{greeting}\n\nWe have everything we need on the {noun}{in_as_of}. Nothing else is needed from you on this one.", multiline: true, help: "{in_as_of} reads \", in as of <date>\" (empty when there is no date)." },
    { key: "next", label: "What happens next (dimmed)", default: "I will check it over and come back to you if anything looks off. Otherwise the next thing you hear from me will be progress.", multiline: true },
    { key: "button", label: "Button", default: "See what you sent" },
    { key: "footnote", label: "Footer note", default: FOOTNOTE_DEFAULT },
  ],
  admin: [
    { key: "subject", label: "Subject", default: "{who} {what} — {request}" },
    { key: "what_opened", label: "What they did: opened", default: "opened their request", help: "Follows the client's name." },
    { key: "what_started", label: "What they did: started", default: "started filling it in", help: "Follows the client's name." },
    { key: "what_completed", label: "What they did: finished", default: "finished their request", help: "Follows the client's name." },
    { key: "eyebrow_completed", label: "Label (finished)", default: "Ball is back with you" },
    { key: "eyebrow_activity", label: "Label (opened / started)", default: "Client activity" },
    { key: "nothing_yet", label: "When nothing is filled in", default: "Nothing filled in yet." },
    { key: "completed_note", label: "Closing line (finished)", default: "Open the client record in the admin to see the whole thing." },
  ],
};

function baseVars(r: ClientRequest, t: RequestTemplate) {
  const first = firstName(r);
  return {
    first_name: first,
    greeting: first ? `Hi ${first},` : "Hi,",
    title: t.title,
    request: t.pickerLabel,
    noun: t.noun,
    company: BRAND.name,
    phone: BRAND.phone,
    expires_on: longDate(r.token_expires_at),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// The request itself
// ═══════════════════════════════════════════════════════════════════════════

export function buildRequestEmail(
  r: ClientRequest,
  t: RequestTemplate,
  url: string,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(REQUEST_SLOTS.sent, copy);
  const rows = facts(r, t);
  const f = (s: string) => fill(s, { ...baseVars(r, t), intro: t.emailIntro });
  const intro = paragraphsOf(f(c.intro));
  const stepsNote = paragraphsOf(f(c.steps_note));

  const blocks = [
    eyebrow(t.eyebrow),
    heading(t.title),
    ...intro.map((p) => paragraph(esc(p))),
    r.note ? quote(r.note) : "",
    factPanel(rows),
    subheading(f(c.steps_heading)),
    bullets(stepLines(t)),
    ...stepsNote.map((p) => paragraph(esc(p), { dim: true })),
    button(f(c.button), url),
    linkFallback(url),
    divider(),
    subheading(f(c.why_heading)),
    paragraph(esc(t.why), { dim: true }),
    fineprint(f(c.expiry)),
    fineprint(NEVER_ASK()),
    signoff(),
  ].filter(Boolean);

  const html = renderEmail({
    preheader: `${t.title} — ${minutesLabel(t.minutes).toLowerCase()}, and then we can carry on.`,
    blocks,
    tone: t.tone,
    footnote: f(c.footnote),
  });

  const text = [
    t.eyebrow.toUpperCase(),
    "",
    t.title,
    "",
    ...intro,
    "",
    r.note ? `${r.note}\n` : "",
    factsAsText(rows),
    "",
    f(c.steps_heading).toUpperCase(),
    ...stepLines(t),
    "",
    "Full instructions and the short form we need back:",
    url,
    "",
    f(c.why_heading).toUpperCase(),
    t.why,
    "",
    f(c.expiry),
    NEVER_ASK(),
    "",
    `— ${BRAND.signer}`,
    BRAND.signerRole,
    `${BRAND.phone} · ${BRAND.email}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject: f(c.subject), html, text };
}

// ═══════════════════════════════════════════════════════════════════════════
// The nudge
//
// Deliberately shorter than the original and deliberately not cross. It says
// what is waiting, offers the phone as an out, and repeats the link — which
// is the actual reason most of these go unanswered: the first email is four
// screens down the inbox.
// ═══════════════════════════════════════════════════════════════════════════

export function buildReminderEmail(
  r: ClientRequest,
  t: RequestTemplate,
  url: string,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(REQUEST_SLOTS.reminder, copy);
  const sentOn = r.sent_at ? longDate(r.sent_at) : null;
  const started = r.status === "started" || r.steps_done.length > 0;
  const f = (s: string) =>
    fill(s, {
      ...baseVars(r, t),
      sent_on: sentOn ?? "",
      blocks: t.blocks,
      time: minutesLabel(t.minutes).toLowerCase().replace("about ", ""),
    });

  const opening = paragraphsOf(
    f(started ? c.opening_started : sentOn ? c.opening_waiting : c.opening_waiting_undated)
  );
  const holding = paragraphsOf(f(c.holding_line));
  const phoneLine = paragraphsOf(f(c.phone_line));

  const blocks = [
    eyebrow(f(c.eyebrow)),
    heading(t.title),
    ...opening.map((p) => paragraph(esc(p))),
    ...holding.map((p) => paragraph(esc(p))),
    r.note ? quote(r.note) : "",
    button(f(started ? c.button_started : c.button), url),
    linkFallback(url),
    ...phoneLine.map((p) => paragraph(esc(p), { dim: true })),
    fineprint(f(c.expiry)),
    signoff(),
  ].filter(Boolean);

  const html = renderEmail({
    preheader: `${t.title} — still open, and it is holding the rest up.`,
    blocks,
    tone: "alert",
    footnote: f(c.footnote),
  });

  const text = [
    f(c.eyebrow).toUpperCase(),
    "",
    t.title,
    "",
    ...opening,
    "",
    ...holding,
    "",
    r.note ? `${r.note}\n` : "",
    url,
    "",
    ...phoneLine,
    "",
    f(c.expiry),
    "",
    `— ${BRAND.signer}`,
    `${BRAND.phone} · ${BRAND.email}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject: f(c.subject), html, text };
}

// ═══════════════════════════════════════════════════════════════════════════
// Their receipt
//
// Sent the moment they finish. It exists so the client knows the ball moved
// back to us — the single most common thing a small-business owner worries
// about after filling in a form is whether it went anywhere.
// ═══════════════════════════════════════════════════════════════════════════

export function buildRequestCompletedEmail(
  r: ClientRequest,
  t: RequestTemplate,
  url: string,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(REQUEST_SLOTS.completed, copy);
  const f = (s: string) =>
    fill(s, {
      ...baseVars(r, t),
      in_as_of: r.completed_at ? `, in as of ${longDate(r.completed_at)}` : "",
    });
  const intro = paragraphsOf(f(c.intro));
  const next = paragraphsOf(f(c.next));

  const blocks = [
    eyebrow(f(c.eyebrow)),
    heading(f(c.heading)),
    ...intro.map((p) => paragraph(esc(p))),
    ...next.map((p) => paragraph(esc(p), { dim: true })),
    button(f(c.button), url),
    linkFallback(url),
    signoff(),
  ];

  const html = renderEmail({
    preheader: `Received — the ${t.noun} is done and nothing else is needed from you.`,
    blocks,
    tone: "success",
    footnote: f(c.footnote),
  });

  const text = [
    f(c.eyebrow).toUpperCase(),
    "",
    f(c.heading),
    "",
    ...intro.flatMap((p) => [p, ""]),
    ...next.flatMap((p) => [p, ""]),
    url,
    "",
    `— ${BRAND.signer}`,
    `${BRAND.phone} · ${BRAND.email}`,
  ].join("\n");

  return { subject: f(c.subject), html, text };
}

// ═══════════════════════════════════════════════════════════════════════════
// John's copy
// ═══════════════════════════════════════════════════════════════════════════

export type RequestAdminEventKind = "opened" | "started" | "completed";

export function buildRequestAdminEmail(
  kind: RequestAdminEventKind,
  r: ClientRequest,
  t: RequestTemplate,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(REQUEST_SLOTS.admin, copy);
  const who = (r.to_name ?? r.to_email).trim();
  const vars = { ...baseVars(r, t), who };
  const what = fill(c[`what_${kind}`], vars);
  const f = (s: string) => fill(s, { ...vars, what });

  const answered = Object.entries(r.payload)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => {
      const field = t.fields.find((fl) => fl.key === k);
      return { label: field?.label ?? k, value: String(v).slice(0, 120) };
    });

  const blocks = [
    eyebrow(f(kind === "completed" ? c.eyebrow_completed : c.eyebrow_activity)),
    heading(`${who} ${what}`),
    factPanel([
      { label: "Request", value: t.pickerLabel, strong: true },
      { label: "Client", value: who },
      { label: "Steps ticked", value: `${r.steps_done.length} of ${t.steps.length}` },
    ]),
    answered.length
      ? bullets(answered.map((a) => `${a.label}: ${a.value}`))
      : paragraph(esc(f(c.nothing_yet)), { dim: true }),
    kind === "completed"
      ? paragraph(esc(f(c.completed_note)), { dim: true })
      : "",
    signoff(),
  ].filter(Boolean);

  const html = renderEmail({
    preheader: `${who} — ${what} (${t.pickerLabel})`,
    blocks,
    tone: kind === "completed" ? "success" : "default",
    headerMeta: t.pickerLabel,
  });

  const text = [
    `${who} ${what}`,
    "",
    `Request: ${t.pickerLabel}`,
    `Steps ticked: ${r.steps_done.length} of ${t.steps.length}`,
    "",
    ...(answered.length ? answered.map((a) => `- ${a.label}: ${a.value}`) : [f(c.nothing_yet)]),
  ].join("\n");

  return { subject: f(c.subject), html, text };
}

/** Kept so an unused-import lint never tempts anyone to drop the token file. */
export const EMAIL_SURFACE_COLOR = C.card;
