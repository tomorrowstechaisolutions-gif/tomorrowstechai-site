/**
 * What the website-form emails say: the lead-magnet download email to the
 * visitor, and the owner notifications for downloads, newsletter sign-ups
 * and the contact form.
 *
 * These have always gone out as plain text, and still do: the routes send
 * `subject` and `text` only. `html` is a plain rendering of the same text so
 * the System emails page has something to preview.
 *
 * Pure: no server-only, no env. Anything env-derived (the audience id) is
 * passed in.
 */

import { esc } from "@/lib/email/brand";
import { fill, paragraphsOf, resolveCopy, type CopySlot, type EmailCopy } from "@/lib/system-emails/copy";
import type { BuiltEmail } from "@/lib/system-emails/types";

export type { BuiltEmail };

export const SITE = "https://tomorrowstechai.com";

// ═══════════════════════════════════════════════════════════════════════
// Lead magnets. A whitelist: each id maps to the asset and its email.
// ═══════════════════════════════════════════════════════════════════════

export type Magnet = {
  id: string;
  title: string;
  pdfPath: string;
  /** Short name for the owner notification subject. */
  shortName: string;
  /** Prefix of this magnet's editable slots (forms.magnet_download). */
  slotPrefix: string;
};

export const MAGNETS: Record<string, Magnet> = {
  "operations-audit": {
    id: "operations-audit",
    title: "The Operations Audit Checklist",
    pdfPath: "/downloads/operations-audit-checklist.pdf",
    shortName: "Operations Audit",
    slotPrefix: "audit",
  },
  "ai-field-guide": {
    id: "ai-field-guide",
    title: "Your Best Next Hire Is AI",
    pdfPath: "/downloads/your-best-next-hire-is-ai.pdf",
    shortName: "AI Field Guide",
    slotPrefix: "guide",
  },
  // The Business AI Series — the Academy's free library (src/lib/academy/library.ts).
  "ai-business-bot-playbook": {
    id: "ai-business-bot-playbook",
    title: "The AI Business Bot Playbook",
    pdfPath: "/downloads/ai-business-bot-playbook.pdf",
    shortName: "Vol 01 Bot Playbook",
    slotPrefix: "vol01",
  },
  "art-of-voice-prompting": {
    id: "art-of-voice-prompting",
    title: "The Art of Voice Prompting",
    pdfPath: "/downloads/the-art-of-voice-prompting.pdf",
    shortName: "Vol 02 Voice Prompting",
    slotPrefix: "vol02",
  },
  "ai-business-blueprint": {
    id: "ai-business-blueprint",
    title: "The AI Business Blueprint",
    pdfPath: "/downloads/the-ai-business-blueprint.pdf",
    shortName: "Vol 03 Blueprint",
    slotPrefix: "vol03",
  },
  "human-advantage": {
    id: "human-advantage",
    title: "The Human Advantage",
    pdfPath: "/downloads/the-human-advantage.pdf",
    shortName: "Vol 04 Human Advantage",
    slotPrefix: "vol04",
  },
};

/** The three Business AI Series emails share one shape; only the wording differs. */
function seriesSlots(prefix: string, name: string, subject: string, body: string): CopySlot[] {
  return [
    { key: `${prefix}_subject`, label: `${name}: subject`, default: subject },
    { key: `${prefix}_greeting`, label: `${name}: greeting (name known)`, default: "Hey {first_name}," },
    { key: `${prefix}_greeting_anon`, label: `${name}: greeting (no name)`, default: "Hey," },
    {
      key: `${prefix}_body`, label: `${name}: email`, multiline: true,
      help: "{download_url} is the PDF link, {contact_url} the booking page. The sign-off is added after this.",
      default: body,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════
// Editable wording (System emails page). Defaults are the shipped text.
// ═══════════════════════════════════════════════════════════════════════

export const FORM_SLOTS: Record<"magnet" | "ownerMagnet" | "newsletter" | "contact", CopySlot[]> = {
  magnet: [
    { key: "audit_subject", label: "Operations Audit: subject", default: "Your Operations Audit Checklist · Tomorrow’s Tech AI" },
    { key: "audit_greeting", label: "Operations Audit: greeting (name known)", default: "Hi {first_name}," },
    { key: "audit_greeting_anon", label: "Operations Audit: greeting (no name)", default: "Hey," },
    {
      key: "audit_body", label: "Operations Audit: email", multiline: true,
      help: "{download_url} is the PDF link, {contact_url} the booking page. The sign-off is added after this.",
      default: `{greeting}

Here's the checklist you asked for:

{download_url}

12 questions. About 5 minutes to score. The third page tells you what to do with the result.

If 8 or more of the questions land easily — your operation is genuinely ready for AI. If 3 or fewer — the foundation needs work first. Either way, the answers are useful.

If you want a 30-minute walk-through of these questions against your specific operation, just reply to this email or book a slot directly: {contact_url}`,
    },
    { key: "guide_subject", label: "AI Field Guide: subject", default: "Your AI Field Guide is here · Tomorrow’s Tech AI" },
    { key: "guide_greeting", label: "AI Field Guide: greeting (name known)", default: "Hey {first_name}," },
    { key: "guide_greeting_anon", label: "AI Field Guide: greeting (no name)", default: "Hey," },
    {
      key: "guide_body", label: "AI Field Guide: email", multiline: true,
      help: "{download_url} is the PDF link, {contact_url} the booking page. The sign-off is added after this.",
      default: `{greeting}

Here's the field guide:

{download_url}

6 pages. Plain English. No code. By Friday you can have a real workflow running.

The fastest win for most owners is page 4 — the 7-day playbook. Pick one task that drains your week, give it 20 minutes a day, follow the steps. By Friday you'll have a workflow saved that pays back every week from then on.

If you want a guide to walk the path with you — the right tools for your business, done-with-you workflows, and a short live training — that's exactly what we do. Just reply or grab a 30-minute slot: {contact_url}

Build smarter. Scale faster.`,
    },
    ...seriesSlots("vol01", "Vol 01 Bot Playbook", "Your AI Business Bot Playbook · Tomorrow’s Tech AI", `{greeting}

Here's Volume 01, The AI Business Bot Playbook:

{download_url}

15 assistant blueprints you can copy into ChatGPT, Claude or whatever you use. Start with one. Pick a task you repeat every week, paste the blueprint, add your business details from page 4, and test it on something real.

If you want to go further than a prompt, the Academy is where I teach the whole process: tomorrowstechai.com/academy

And if you'd rather have it built for you, reply here or grab a slot: {contact_url}`),
    ...seriesSlots("vol02", "Vol 02 Voice Prompting", "The Art of Voice Prompting · Tomorrow’s Tech AI", `{greeting}

Here's Volume 02, The Art of Voice Prompting:

{download_url}

The whole thing comes down to the S.P.E.A.K. Method: State your objective, Provide context, Express your expectations, Ask for clarification, Keep refining.

Try the 15-minute experiment on page 19. Same task, typed short and then spoken out loud with S.P.E.A.K. Compare the two. That's usually all it takes.

The full S.P.E.A.K. course lives in the Academy: tomorrowstechai.com/academy

Better communication. Better intelligence.`),
    ...seriesSlots("vol03", "Vol 03 Blueprint", "Your AI Business Blueprint · Tomorrow’s Tech AI", `{greeting}

Here's Volume 03, The AI Business Blueprint:

{download_url}

Start with the readiness score on page 5, then the opportunity worksheet on page 19. One workflow, one owner, one measurable problem. That's the whole trick.

If you fill in the worksheet and want a second set of eyes on it, bring it to a call: {contact_url}

More training at tomorrowstechai.com/academy`),
    ...seriesSlots("vol04", "Vol 04 Human Advantage", "The Human Advantage · Tomorrow’s Tech AI", `{greeting}

Here's Volume 04, The Human Advantage:

{download_url}

This one is for founders and consultants. No titles, no hype. Start with the 30-day action plan on page 17 and the opener on page 12, then go have real conversations with real owners.

If you want to talk through what you're building, reply here or grab a slot: {contact_url}

Less hype. More substance.`),
  ],
  ownerMagnet: [
    { key: "subject", label: "Subject", default: "New lead magnet download ({magnet_name})" },
    { key: "intro", label: "First line", default: "New download of \"{magnet_title}\":" },
    { key: "audience_line", label: "Line above the audience link", default: "This contact has been added to your Resend audience:" },
  ],
  newsletter: [
    { key: "subject", label: "Subject", default: "New newsletter subscriber" },
    { key: "intro", label: "First line", default: "New subscriber to Tomorrow’s Tech AI field notes:" },
    { key: "list_line", label: "Line above the list link", default: "View the full list:" },
  ],
  contact: [
    { key: "subject", label: "Subject (company given)", default: "New inquiry from {name} · {company}" },
    { key: "subject_nocompany", label: "Subject (no company)", default: "New inquiry from {name}" },
    { key: "intro", label: "First line", default: "New contact form submission on tomorrowstechai.com" },
  ],
};

const SIGNOFF_TEXT = `— John
Founder, Tomorrow’s Tech AI
${SITE}`;

/** These are plain-text emails; the HTML is only for previewing them. */
function textAsHtml(text: string): string {
  return `<pre style="margin:0;padding:24px;white-space:pre-wrap;word-break:break-word;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;font-size:15px;line-height:1.6;color:#111827;background:#ffffff;">${esc(text)}</pre>`;
}

function audienceUrl(audienceId: string): string {
  return `https://resend.com/audiences/${audienceId}/contacts`;
}

// ═══════════════════════════════════════════════════════════════════════
// To the visitor.
// ═══════════════════════════════════════════════════════════════════════

export function buildMagnetDownloadEmail(
  magnet: Magnet,
  firstName: string,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(FORM_SLOTS.magnet, copy);
  const p = magnet.slotPrefix;
  const base = {
    first_name: firstName,
    download_url: `${SITE}${magnet.pdfPath}`,
    contact_url: `${SITE}/contact`,
    magnet_title: magnet.title,
  };
  const greeting = fill(firstName ? c[`${p}_greeting`] : c[`${p}_greeting_anon`], base);
  const body = paragraphsOf(fill(c[`${p}_body`], { ...base, greeting }));
  const text = [...body, SIGNOFF_TEXT].join("\n\n");
  return { subject: fill(c[`${p}_subject`], base), html: textAsHtml(text), text };
}

// ═══════════════════════════════════════════════════════════════════════
// To John.
// ═══════════════════════════════════════════════════════════════════════

export function buildOwnerMagnetEmail(
  opts: { magnet: Magnet; email: string; firstName: string; ip: string; audienceId: string },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(FORM_SLOTS.ownerMagnet, copy);
  const vars = { magnet_name: opts.magnet.shortName, magnet_title: opts.magnet.title, email: opts.email, first_name: opts.firstName };
  const f = (t: string) => fill(t, vars);
  const text = `${f(c.intro)}

Email: ${opts.email}
${opts.firstName ? `Name: ${opts.firstName}` : ""}
From IP: ${opts.ip}

${f(c.audience_line)}
${audienceUrl(opts.audienceId)}`;
  return { subject: f(c.subject), html: textAsHtml(text), text };
}

export function buildOwnerNewsletterEmail(
  opts: { email: string; ip: string; audienceId: string },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(FORM_SLOTS.newsletter, copy);
  const f = (t: string) => fill(t, { email: opts.email });
  const text = `${f(c.intro)}\n\n${opts.email}\n\nFrom: ${opts.ip}\n\n${f(c.list_line)}\n${audienceUrl(opts.audienceId)}`;
  return { subject: f(c.subject), html: textAsHtml(text), text };
}

export function buildOwnerContactEmail(
  opts: { name: string; email: string; company?: string | null; message: string },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(FORM_SLOTS.contact, copy);
  const vars = { name: opts.name, email: opts.email, company: opts.company ?? "" };
  const f = (t: string) => fill(t, vars);
  const text = [
    f(c.intro),
    ``,
    `Name: ${opts.name}`,
    `Email: ${opts.email}`,
    opts.company ? `Company: ${opts.company}` : null,
    ``,
    `Message:`,
    opts.message,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject: f(opts.company ? c.subject : c.subject_nocompany), html: textAsHtml(text), text };
}
