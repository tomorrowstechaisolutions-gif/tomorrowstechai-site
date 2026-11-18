/**
 * What the Central Texas AI Initiative emails say, and how they look.
 *
 * No `server-only` and no Resend here — the same split as proposals and
 * requests — so every message can be rendered to a file and looked at
 * without sending anything. Each builder returns html and a plain-text
 * alternative made from the same lines, so the two can never disagree.
 *
 * The wording is deliberately careful: the initiative is a PROPOSED pilot.
 * Nothing here may read as acceptance, approval, funding, or a promise of
 * free services.
 */

import {
  C, renderEmail, eyebrow, heading, paragraph, factPanel, divider, esc,
} from "@/lib/email/brand";
import { INITIATIVE_NAME, INITIATIVE_URL, DETAIL_LABELS, type InitiativeKind } from "./config";
import { fill, paragraphsOf, resolveCopy, type CopySlot, type EmailCopy } from "@/lib/system-emails/copy";

export type BuiltEmail = { subject: string; html: string; text: string };

const SITE_LABEL = "tomorrowstechai.com/central-texas-ai";

function greetingName(firstName: string): string {
  const first = firstName.trim().split(/\s+/)[0] ?? "";
  return first ? `Hi ${first},` : "Hi,";
}

/** The sign-off the initiative uses: the company and the program, not a person. */
function closingBlock(): string {
  return `<tr><td style="padding:8px 32px 34px 32px;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;font-size:15px;line-height:1.6;color:${C.text};">
    <strong>Tomorrow&rsquo;s Tech AI</strong><br />
    <span style="color:${C.dim};">${esc(INITIATIVE_NAME)}</span><br />
    <a href="${esc(INITIATIVE_URL)}" style="color:${C.blueBright};text-decoration:none;">${esc(SITE_LABEL)}</a>
  </td></tr>`;
}

const CLOSING_TEXT = `Tomorrow's Tech AI\n${INITIATIVE_NAME}\n${SITE_LABEL}`;

// ═══════════════════════════════════════════════════════════════════════
// Editable wording (System emails page). Defaults are the shipped text.
// Keep any edit careful: a PROPOSED pilot, never acceptance or funding.
// ═══════════════════════════════════════════════════════════════════════

export const CTAI_SLOTS: Record<"business" | "partner" | "admin", CopySlot[]> = {
  business: [
    { key: "subject", label: "Subject", default: "We Received Your Central Texas AI Initiative Interest" },
    { key: "eyebrow", label: "Label above the heading", default: "Expression of interest received" },
    { key: "heading", label: "Heading", default: "Thank you for your interest" },
    { key: "body", label: "Message", default: "{greeting}\n\nThank you for expressing interest in the {initiative_name}.\n\nWe are currently developing the proposed pilot program and identifying Central Texas businesses that may be interested in participating.\n\nSubmitting this form does not guarantee program acceptance or funding. It helps us better understand local business needs and demonstrate regional demand as we continue developing partnerships and funding opportunities.\n\nA member of the Tomorrow’s Tech AI team may contact you for additional information.\n\nThank you for helping us build a stronger Central Texas business community.", multiline: true },
    { key: "footnote", label: "Footer note", default: "You received this because you submitted the business interest form at tomorrowstechai.com/central-texas-ai. This is a one-time confirmation, not a marketing subscription.", multiline: true },
  ],
  partner: [
    { key: "subject", label: "Subject", default: "Central Texas AI Partnership Inquiry Received" },
    { key: "eyebrow", label: "Label above the heading", default: "Partnership inquiry received" },
    { key: "heading", label: "Heading", default: "Thank you for reaching out" },
    { key: "body", label: "Message", default: "{greeting}\n\nThank you for reaching out regarding the {initiative_name}.\n\nTomorrow’s Tech AI is currently developing the proposed regional pilot and exploring partnerships with economic-development organizations, workforce groups, educational institutions, nonprofits, public-sector organizations, and other regional stakeholders.\n\nWe have received your partnership inquiry and will review the information you provided.\n\nA member of our team may contact you to discuss potential areas of collaboration.\n\nThank you,", multiline: true },
    { key: "footnote", label: "Footer note", default: "You received this because you submitted the partnership inquiry form at tomorrowstechai.com/central-texas-ai. This is a one-time confirmation, not a marketing subscription.", multiline: true },
  ],
  admin: [
    { key: "subject_business", label: "Subject (business form)", default: "Business interest · {who} · Central Texas AI{returning}", help: "{returning} adds \" [RETURNING]\" when the contact already existed." },
    { key: "subject_partner", label: "Subject (partner form)", default: "Partner inquiry · {who} · Central Texas AI{returning}", help: "{returning} adds \" [RETURNING]\" when the contact already existed." },
    { key: "eyebrow_business", label: "Label (business form)", default: "Central Texas AI · Business interest" },
    { key: "eyebrow_partner", label: "Label (partner form)", default: "Central Texas AI · Partner inquiry" },
    { key: "note_returning", label: "Note: contact already existed", default: "This contact already existed. Their original source was kept; the initiative tags were added." },
    { key: "note_sent", label: "Note: confirmation sent", default: "The confirmation email was sent." },
    { key: "note_not_sent", label: "Note: confirmation failed", default: "The confirmation email did NOT send — check Resend." },
    { key: "admin_link", label: "Admin link text", default: "Open in the admin" },
    { key: "not_saved", label: "When it was not saved", default: "Not saved to the database — this email is the only copy." },
  ],
};

function build(input: {
  subject: string;
  preheader: string;
  eyebrowText: string;
  headingText: string;
  /** The greeting is the first paragraph. */
  paragraphs: string[];
  footnote: string;
}): BuiltEmail {
  const html = renderEmail({
    preheader: input.preheader,
    footnote: input.footnote,
    headerMeta: "Central Texas AI",
    blocks: [
      eyebrow(input.eyebrowText),
      heading(input.headingText),
      ...input.paragraphs.map((p) => paragraph(esc(p))),
      closingBlock(),
    ],
  });
  const text = [...input.paragraphs, CLOSING_TEXT].join("\n\n");
  return { subject: input.subject, html, text };
}

function confirmation(
  slots: CopySlot[],
  firstName: string,
  preheader: string,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(slots, copy);
  const first = firstName.trim().split(/\s+/)[0] ?? "";
  const f = (t: string) =>
    fill(t, { greeting: greetingName(firstName), first_name: first, initiative_name: INITIATIVE_NAME });
  return build({
    subject: f(c.subject),
    preheader,
    eyebrowText: f(c.eyebrow),
    headingText: f(c.heading),
    paragraphs: paragraphsOf(f(c.body)),
    footnote: f(c.footnote),
  });
}

export function buildBusinessConfirmation(firstName: string, copy?: Partial<EmailCopy> | null): BuiltEmail {
  return confirmation(
    CTAI_SLOTS.business,
    firstName,
    "Thank you for expressing interest in the proposed Central Texas AI pilot.",
    copy
  );
}

export function buildPartnerConfirmation(firstName: string, copy?: Partial<EmailCopy> | null): BuiltEmail {
  return confirmation(
    CTAI_SLOTS.partner,
    firstName,
    "We have received your partnership inquiry for the proposed Central Texas AI pilot.",
    copy
  );
}

function detailValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s || "—";
}

/** Internal notice to John. Every field the visitor typed, plus the admin link. */
export function buildAdminNotice(
  input: {
    kind: InitiativeKind;
    details: Record<string, unknown>;
    email: string;
    phone: string;
    leadId: string | null;
    duplicate: boolean;
    confirmationSent: boolean;
  },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(CTAI_SLOTS.admin, copy);
  const isPartner = input.kind === "partner";
  const who = String(input.details[isPartner ? "organization_name" : "business_name"] ?? "Unknown");
  const f = (t: string) =>
    fill(t, { who, returning: input.duplicate ? " [RETURNING]" : "", email: input.email, initiative_name: INITIATIVE_NAME });
  const subject = f(isPartner ? c.subject_partner : c.subject_business);
  const adminUrl = input.leadId ? `https://tomorrowstechai.com/admin/leads/${input.leadId}` : null;
  const adminLink = f(c.admin_link);
  const notSaved = f(c.not_saved);

  const rows = [
    ...DETAIL_LABELS[input.kind].map(([key, label]) => ({ label, value: detailValue(input.details[key]) })),
    { label: "Email", value: input.email },
    { label: "Phone", value: input.phone },
  ];

  // Long answers (challenge, message) do not fit a two-column fact panel.
  const longKeys = new Set(["challenge", "message", "modernization", "partnership_interest"]);
  const shortRows = rows.filter((r) => !DETAIL_LABELS[input.kind].some(([k, l]) => l === r.label && longKeys.has(k)));
  const longRows = rows.filter((r) => !shortRows.includes(r));

  const notes = [
    input.duplicate ? f(c.note_returning) : "",
    input.confirmationSent ? f(c.note_sent) : f(c.note_not_sent),
  ].filter(Boolean);

  const html = renderEmail({
    preheader: `${who} submitted the ${isPartner ? "partner" : "business"} form.`,
    tone: isPartner ? "success" : "default",
    headerMeta: "Internal",
    blocks: [
      eyebrow(f(isPartner ? c.eyebrow_partner : c.eyebrow_business)),
      heading(who),
      factPanel(shortRows),
      ...longRows.map((r) => paragraph(`<strong style="color:${C.dim};">${esc(r.label)}</strong><br />${esc(r.value)}`)),
      divider(),
      ...notes.map((n) => paragraph(esc(n), { dim: true })),
      adminUrl
        ? paragraph(`<a href="${esc(adminUrl)}" style="color:${C.blueBright};">${esc(adminLink)}</a>`)
        : paragraph(esc(notSaved), { dim: true }),
    ],
  });

  const text = [
    subject,
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    "",
    ...notes,
    adminUrl ? `${adminLink}: ${adminUrl}` : notSaved,
  ].join("\n");

  return { subject, html, text };
}
