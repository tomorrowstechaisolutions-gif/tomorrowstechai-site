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

function build(input: {
  subject: string;
  preheader: string;
  eyebrowText: string;
  headingText: string;
  greeting: string;
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
      paragraph(esc(input.greeting)),
      ...input.paragraphs.map((p) => paragraph(esc(p))),
      closingBlock(),
    ],
  });
  const text = [input.greeting, ...input.paragraphs, CLOSING_TEXT].join("\n\n");
  return { subject: input.subject, html, text };
}

export function buildBusinessConfirmation(firstName: string): BuiltEmail {
  return build({
    subject: "We Received Your Central Texas AI Initiative Interest",
    preheader: "Thank you for expressing interest in the proposed Central Texas AI pilot.",
    eyebrowText: "Expression of interest received",
    headingText: "Thank you for your interest",
    greeting: greetingName(firstName),
    paragraphs: [
      `Thank you for expressing interest in the ${INITIATIVE_NAME}.`,
      "We are currently developing the proposed pilot program and identifying Central Texas businesses that may be interested in participating.",
      "Submitting this form does not guarantee program acceptance or funding. It helps us better understand local business needs and demonstrate regional demand as we continue developing partnerships and funding opportunities.",
      "A member of the Tomorrow’s Tech AI team may contact you for additional information.",
      "Thank you for helping us build a stronger Central Texas business community.",
    ],
    footnote:
      "You received this because you submitted the business interest form at tomorrowstechai.com/central-texas-ai. This is a one-time confirmation, not a marketing subscription.",
  });
}

export function buildPartnerConfirmation(firstName: string): BuiltEmail {
  return build({
    subject: "Central Texas AI Partnership Inquiry Received",
    preheader: "We have received your partnership inquiry for the proposed Central Texas AI pilot.",
    eyebrowText: "Partnership inquiry received",
    headingText: "Thank you for reaching out",
    greeting: greetingName(firstName),
    paragraphs: [
      `Thank you for reaching out regarding the ${INITIATIVE_NAME}.`,
      "Tomorrow’s Tech AI is currently developing the proposed regional pilot and exploring partnerships with economic-development organizations, workforce groups, educational institutions, nonprofits, public-sector organizations, and other regional stakeholders.",
      "We have received your partnership inquiry and will review the information you provided.",
      "A member of our team may contact you to discuss potential areas of collaboration.",
      "Thank you,",
    ],
    footnote:
      "You received this because you submitted the partnership inquiry form at tomorrowstechai.com/central-texas-ai. This is a one-time confirmation, not a marketing subscription.",
  });
}

function detailValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s || "—";
}

/** Internal notice to John. Every field the visitor typed, plus the admin link. */
export function buildAdminNotice(input: {
  kind: InitiativeKind;
  details: Record<string, unknown>;
  email: string;
  phone: string;
  leadId: string | null;
  duplicate: boolean;
  confirmationSent: boolean;
}): BuiltEmail {
  const isPartner = input.kind === "partner";
  const who = String(input.details[isPartner ? "organization_name" : "business_name"] ?? "Unknown");
  const subject = `${isPartner ? "Partner inquiry" : "Business interest"} · ${who} · Central Texas AI${input.duplicate ? " [RETURNING]" : ""}`;
  const adminUrl = input.leadId ? `https://tomorrowstechai.com/admin/leads/${input.leadId}` : null;

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
    input.duplicate ? "This contact already existed. Their original source was kept; the initiative tags were added." : "",
    input.confirmationSent ? "The confirmation email was sent." : "The confirmation email did NOT send — check Resend.",
  ].filter(Boolean);

  const html = renderEmail({
    preheader: `${who} submitted the ${isPartner ? "partner" : "business"} form.`,
    tone: isPartner ? "success" : "default",
    headerMeta: "Internal",
    blocks: [
      eyebrow(isPartner ? "Central Texas AI · Partner inquiry" : "Central Texas AI · Business interest"),
      heading(who),
      factPanel(shortRows),
      ...longRows.map((r) => paragraph(`<strong style="color:${C.dim};">${esc(r.label)}</strong><br />${esc(r.value)}`)),
      divider(),
      ...notes.map((n) => paragraph(esc(n), { dim: true })),
      adminUrl
        ? paragraph(`<a href="${esc(adminUrl)}" style="color:${C.blueBright};">Open in the admin</a>`)
        : paragraph(esc("Not saved to the database — this email is the only copy."), { dim: true }),
    ],
  });

  const text = [
    subject,
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    "",
    ...notes,
    adminUrl ? `Open in the admin: ${adminUrl}` : "Not saved to the database — this email is the only copy.",
  ].join("\n");

  return { subject, html, text };
}
