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
import { NEVER_ASK, type RequestTemplate } from "./config";
import type { ClientRequest } from "./types";

export type BuiltEmail = { subject: string; html: string; text: string };

function firstName(r: ClientRequest): string {
  const name = (r.to_name ?? "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

function greeting(r: ClientRequest): string {
  const first = firstName(r);
  return first ? `Hi ${esc(first)},` : "Hi,";
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

function expiryLine(r: ClientRequest): string {
  return `This link is yours alone — please do not forward it. It stays open until ${longDate(
    r.token_expires_at
  )}, and we can always send a fresh one.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// The request itself
// ═══════════════════════════════════════════════════════════════════════════

export function buildRequestEmail(
  r: ClientRequest,
  t: RequestTemplate,
  url: string
): BuiltEmail {
  const rows = facts(r, t);

  const blocks = [
    eyebrow(t.eyebrow),
    heading(t.title),
    paragraph(greeting(r)),
    paragraph(esc(t.emailIntro)),
    r.note ? quote(r.note) : "",
    factPanel(rows),
    subheading("What is involved"),
    bullets(stepLines(t)),
    paragraph(
      `The page below walks you through each step, and there is a short form at ` +
        `the bottom for the few details we need back. You can stop halfway and ` +
        `come back to it.`,
      { dim: true }
    ),
    button("Open your checklist", url),
    linkFallback(url),
    divider(),
    subheading("Why this one is on you"),
    paragraph(esc(t.why), { dim: true }),
    fineprint(expiryLine(r)),
    fineprint(NEVER_ASK),
    signoff(),
  ].filter(Boolean);

  const html = renderEmail({
    preheader: `${t.title} — ${minutesLabel(t.minutes).toLowerCase()}, and then we can carry on.`,
    blocks,
    tone: t.tone,
    footnote: `You are receiving this because ${BRAND.name} is building or maintaining your website.`,
  });

  const text = [
    t.eyebrow.toUpperCase(),
    "",
    t.title,
    "",
    firstName(r) ? `Hi ${firstName(r)},` : "Hi,",
    "",
    t.emailIntro,
    "",
    r.note ? `${r.note}\n` : "",
    factsAsText(rows),
    "",
    "WHAT IS INVOLVED",
    ...stepLines(t),
    "",
    "Full instructions and the short form we need back:",
    url,
    "",
    "WHY THIS ONE IS ON YOU",
    t.why,
    "",
    expiryLine(r),
    NEVER_ASK,
    "",
    `— ${BRAND.signer}`,
    BRAND.signerRole,
    `${BRAND.phone} · ${BRAND.email}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject: `${t.title} — a quick thing we need from you`, html, text };
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
  url: string
): BuiltEmail {
  const sentOn = r.sent_at ? longDate(r.sent_at) : null;
  const started = r.status === "started" || r.steps_done.length > 0;

  const opening = started
    ? `You made a start on this — thank you. There is a little left, and once it is in we can pick straight back up.`
    : `Just floating this back to the top of your inbox.${
        sentOn ? ` I sent it over on ${esc(sentOn)}.` : ""
      }`;

  const blocks = [
    eyebrow("Still waiting on this one"),
    heading(t.title),
    paragraph(greeting(r)),
    paragraph(opening),
    paragraph(
      `Until it is done, ${esc(t.blocks)} — so it is worth ${esc(
        minutesLabel(t.minutes).toLowerCase().replace("about ", "")
      )} whenever you get a clear moment.`
    ),
    r.note ? quote(r.note) : "",
    button(started ? "Pick up where you left off" : "Open your checklist", url),
    linkFallback(url),
    paragraph(
      `If something about it is not working, or you would rather I just did it ` +
        `with you on the phone, call me on ${esc(BRAND.phone)} and we will get it ` +
        `off your plate.`,
      { dim: true }
    ),
    fineprint(expiryLine(r)),
    signoff(),
  ].filter(Boolean);

  const html = renderEmail({
    preheader: `${t.title} — still open, and it is holding the rest up.`,
    blocks,
    tone: "alert",
    footnote: `You are receiving this because ${BRAND.name} is building or maintaining your website.`,
  });

  const text = [
    "STILL WAITING ON THIS ONE",
    "",
    t.title,
    "",
    firstName(r) ? `Hi ${firstName(r)},` : "Hi,",
    "",
    started
      ? "You made a start on this — thank you. There is a little left, and once it is in we can pick straight back up."
      : `Just floating this back to the top of your inbox.${sentOn ? ` I sent it over on ${sentOn}.` : ""}`,
    "",
    `Until it is done, ${t.blocks}.`,
    "",
    r.note ? `${r.note}\n` : "",
    url,
    "",
    `If something about it is not working, or you would rather I did it with you on the phone, call me on ${BRAND.phone}.`,
    "",
    expiryLine(r),
    "",
    `— ${BRAND.signer}`,
    `${BRAND.phone} · ${BRAND.email}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject: `Still need this from you: ${t.pickerLabel}`, html, text };
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
  url: string
): BuiltEmail {
  const blocks = [
    eyebrow("Got it"),
    heading("That is off your plate"),
    paragraph(greeting(r)),
    paragraph(
      `We have everything we need on the ${esc(t.noun)}${
        r.completed_at ? `, in as of ${esc(longDate(r.completed_at))}` : ""
      }. Nothing else is needed from you on this one.`
    ),
    paragraph(
      `I will check it over and come back to you if anything looks off. Otherwise ` +
        `the next thing you hear from me will be progress.`,
      { dim: true }
    ),
    button("See what you sent", url),
    linkFallback(url),
    signoff(),
  ];

  const html = renderEmail({
    preheader: `Received — the ${t.noun} is done and nothing else is needed from you.`,
    blocks,
    tone: "success",
    footnote: `You are receiving this because ${BRAND.name} is building or maintaining your website.`,
  });

  const text = [
    "GOT IT",
    "",
    "That is off your plate",
    "",
    firstName(r) ? `Hi ${firstName(r)},` : "Hi,",
    "",
    `We have everything we need on the ${t.noun}. Nothing else is needed from you on this one.`,
    "",
    "I will check it over and come back to you if anything looks off.",
    "",
    url,
    "",
    `— ${BRAND.signer}`,
    `${BRAND.phone} · ${BRAND.email}`,
  ].join("\n");

  return { subject: `Got it — ${t.noun} received`, html, text };
}

// ═══════════════════════════════════════════════════════════════════════════
// John's copy
// ═══════════════════════════════════════════════════════════════════════════

export type RequestAdminEventKind = "opened" | "started" | "completed";

const ADMIN_HEADLINES: Record<RequestAdminEventKind, string> = {
  opened: "opened their request",
  started: "started filling it in",
  completed: "finished their request",
};

export function buildRequestAdminEmail(
  kind: RequestAdminEventKind,
  r: ClientRequest,
  t: RequestTemplate
): BuiltEmail {
  const who = (r.to_name ?? r.to_email).trim();

  const answered = Object.entries(r.payload)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => {
      const field = t.fields.find((f) => f.key === k);
      return { label: field?.label ?? k, value: String(v).slice(0, 120) };
    });

  const blocks = [
    eyebrow(kind === "completed" ? "Ball is back with you" : "Client activity"),
    heading(`${who} ${ADMIN_HEADLINES[kind]}`),
    factPanel([
      { label: "Request", value: t.pickerLabel, strong: true },
      { label: "Client", value: who },
      { label: "Steps ticked", value: `${r.steps_done.length} of ${t.steps.length}` },
    ]),
    answered.length
      ? bullets(answered.map((a) => `${a.label}: ${a.value}`))
      : paragraph("Nothing filled in yet.", { dim: true }),
    kind === "completed"
      ? paragraph(`Open the client record in the admin to see the whole thing.`, { dim: true })
      : "",
    signoff(),
  ].filter(Boolean);

  const html = renderEmail({
    preheader: `${who} — ${ADMIN_HEADLINES[kind]} (${t.pickerLabel})`,
    blocks,
    tone: kind === "completed" ? "success" : "default",
    headerMeta: t.pickerLabel,
  });

  const text = [
    `${who} ${ADMIN_HEADLINES[kind]}`,
    "",
    `Request: ${t.pickerLabel}`,
    `Steps ticked: ${r.steps_done.length} of ${t.steps.length}`,
    "",
    ...(answered.length ? answered.map((a) => `- ${a.label}: ${a.value}`) : ["Nothing filled in yet."]),
  ].join("\n");

  return {
    subject: `${who} ${ADMIN_HEADLINES[kind]} — ${t.pickerLabel}`,
    html,
    text,
  };
}

/** Kept so an unused-import lint never tempts anyone to drop the token file. */
export const EMAIL_SURFACE_COLOR = C.card;
