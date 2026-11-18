/**
 * What every proposal email says, and what it looks like.
 *
 * Split out from emails.ts deliberately. Sending needs `server-only` and the
 * Resend client; composing needs neither, and keeping them apart means the
 * templates can be rendered to a file and looked at — see
 * scripts/preview-emails.sh — instead of being reviewed by sending real mail
 * to a real client and hoping.
 *
 * Every message carries a full plain-text alternative. It is what a text-only
 * client shows, what a screen reader reaches first, and what stops a message
 * that is all markup from reading as spam to a filter. Both halves are built
 * from the same rows, so they can never quote different numbers.
 */

import { formatMoney } from "./pricing";
import type { Proposal, ProposalSignature } from "./types";
import {
  BRAND, C, renderEmail, eyebrow, heading, paragraph, subheading,
  factPanel, button, linkFallback, bullets, quote, divider, fineprint,
  signoff, esc,
} from "@/lib/email/brand";
import { fill, linesOf, paragraphsOf, resolveCopy, type CopySlot, type EmailCopy } from "@/lib/system-emails/copy";

export type BuiltEmail = { subject: string; html: string; text: string };

function firstName(p: Proposal): string {
  const name = (p.client_contact_name ?? "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

function longDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "America/Chicago" });
}

/** `valid_until` is a date, not an instant — read at midday to dodge the zone. */
function expiryDate(p: Proposal): string | null {
  return p.valid_until ? longDate(new Date(`${p.valid_until}T12:00:00Z`)) : null;
}

type MoneyRow = { label: string; value: string; strong?: boolean; note?: string };

/**
 * The figures, once. Both the panel and the text version are built from this.
 *
 * The last row always says Nothing, because a proposal quotes and does not
 * collect. It is still printed rather than left out: "due now: nothing" is
 * the reassurance, and a price with no due line beside it invites the
 * question this email exists to answer.
 */
function moneyRows(p: Proposal, dueLabel = "Due when you sign"): MoneyRow[] {
  const rows: MoneyRow[] = [
    { label: "Website build", value: formatMoney(p.total_cents, p.currency), note: "one-time" },
  ];

  if (p.recurring_price_cents > 0) {
    rows.push({
      label: "Hosting",
      value: `${formatMoney(p.recurring_price_cents, p.currency)}/${p.recurring_interval}`,
      note: "begins after launch",
    });
  }

  rows.push({
    label: dueLabel,
    value: "Nothing",
    strong: true,
    note: "invoiced separately",
  });

  return rows;
}

function rowsAsText(rows: MoneyRow[]): string {
  return rows.map((r) => `${r.label}: ${r.value}${r.note ? ` (${r.note})` : ""}`).join("\n");
}

const SIGNOFF_TEXT = `— ${BRAND.signer}
${BRAND.signerRole}
${BRAND.site}
${BRAND.phone}`;

// ═══════════════════════════════════════════════════════════════════════
// Editable wording (System emails page). Defaults are the shipped text.
// ═══════════════════════════════════════════════════════════════════════

export const PROPOSAL_SLOTS: Record<"sent" | "signed" | "admin", CopySlot[]> = {
  sent: [
    { key: "subject", label: "Subject", default: "Your proposal is ready — {title}" },
    { key: "intro", label: "Opening line", default: "{greeting} everything we talked about is written down here — what gets built, what it costs, who owns what, and the agreement in full.", multiline: true },
    { key: "intro_note", label: "Second line (dimmed)", default: "Read it at your own pace. If it looks right, you can sign it on the page.", multiline: true },
    { key: "button", label: "Button", default: "Read and sign your proposal" },
    { key: "page_heading", label: "What's-on-the-page heading", default: "What's on the page" },
    { key: "page_points", label: "What's-on-the-page points (one per line)", default: "The full scope of work, line by line, and what is deliberately not in it\nThe price, in full — and confirmation that nothing is due when you sign\nOwnership and software license terms, in plain language before the legal wording\nThe complete Website Development, Hosting & Software License Agreement\nA signature box. No printing, no scanning, nothing to post back", multiline: true },
    { key: "expiry", label: "Open-until line (only when it has an expiry date)", default: "This proposal is open for acceptance until {expires}." },
    { key: "closing", label: "Closing line", default: "Anything you want changed before you sign, just reply to this email and we will sort it out.", multiline: true },
    { key: "footnote", label: "Footer note", default: "You are receiving this because a proposal was prepared for you by Tomorrow's Tech AI. The link above is private to you — please don't forward it.", multiline: true },
  ],
  signed: [
    { key: "subject", label: "Subject", default: "Signed — {title} ({proposal_number})" },
    { key: "heading", label: "Heading", default: "Thank you — that's official" },
    { key: "intro", label: "Opening line", default: "{greeting} your agreement for {title} is signed and on file. Nothing else is needed from you to make it binding.", multiline: true, help: "{title} shows in bold in the email." },
    { key: "next", label: "What happens next", default: "We will be in touch shortly with what we need from you to get started. An invoice follows separately — nothing is owed at the moment you sign.", multiline: true },
    { key: "button", label: "Button", default: "Open your signed copy" },
    { key: "record_note", label: "Small print", default: "Your signed copy stays at that link permanently — readable and printable whenever you want it. Your name, email, the time, your IP address and the exact agreement version were recorded with the signature.", multiline: true },
    { key: "footnote", label: "Footer note", default: "You are receiving this because a proposal was prepared for you by Tomorrow's Tech AI. The link above is private to you — please don't forward it.", multiline: true },
  ],
  admin: [
    { key: "subject", label: "Subject", default: "{label} — {client} · {proposal_number} · {value}" },
    { key: "label_viewed", label: "Status word: opened", default: "Opened" },
    { key: "heading_viewed", label: "Heading: opened", default: "They are reading it" },
    { key: "label_signed", label: "Status word: signed", default: "Signed" },
    { key: "heading_signed", label: "Heading: signed", default: "Signed and locked" },
    { key: "label_paid", label: "Status word: paid", default: "Paid" },
    { key: "heading_paid", label: "Heading: paid", default: "Money landed" },
    { key: "label_declined", label: "Status word: declined", default: "Declined" },
    { key: "heading_declined", label: "Heading: declined", default: "They said no" },
    { key: "admin_line", label: "Where to find it", default: "Open it in the admin under Proposals." },
    { key: "footnote", label: "Footer note", default: "Internal notification from the Tomorrow's Tech AI Command Center." },
  ],
};

function baseVars(p: Proposal) {
  const name = firstName(p);
  return {
    first_name: name,
    greeting: name ? `Hi ${name},` : "Hi,",
    title: p.title,
    proposal_number: p.proposal_number,
    business_name: p.client_business_name ?? "",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// The proposal itself.
// ═══════════════════════════════════════════════════════════════════════

export function buildProposalEmail(
  p: Proposal,
  url: string,
  note?: string | null,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(PROPOSAL_SLOTS.sent, copy);
  const rows = moneyRows(p);
  const expires = expiryDate(p);
  const trimmedNote = note?.trim() || null;
  const vars = { ...baseVars(p), expires: expires ?? "" };
  const f = (t: string) => fill(t, vars);
  const intro = paragraphsOf(f(c.intro));
  const introNote = paragraphsOf(f(c.intro_note));
  const points = linesOf(f(c.page_points));
  const closing = paragraphsOf(f(c.closing));

  const preheader = [
    p.proposal_number,
    `${formatMoney(p.total_cents, p.currency)} one-time`,
    p.recurring_price_cents > 0
      ? `${formatMoney(p.recurring_price_cents, p.currency)}/${p.recurring_interval} hosting`
      : null,
    expires ? `open until ${expires}` : null,
  ].filter(Boolean).join("  ·  ");

  const html = renderEmail({
    preheader,
    headerMeta: p.proposal_number,
    blocks: [
      eyebrow("Proposal"),
      heading(p.title),
      ...intro.map((x) => paragraph(esc(x))),
      ...introNote.map((x) => paragraph(esc(x), { dim: true })),
      factPanel(rows),
      button(f(c.button), url),
      linkFallback(url),
      trimmedNote ? quote(trimmedNote) : "",
      divider(),
      subheading(f(c.page_heading)),
      bullets(points),
      expires ? fineprint(f(c.expiry)) : "",
      ...closing.map((x) => paragraph(esc(x))),
      signoff(),
    ].filter(Boolean),
    footnote: f(c.footnote),
  });

  const text = `${intro.join("\n\n")}

Your proposal is ready to read and sign online:

${url}

Proposal: ${p.proposal_number}
Project: ${p.title}

${rowsAsText(rows)}
${expires ? `\n${f(c.expiry)}\n` : ""}${trimmedNote ? `\n${trimmedNote}\n` : ""}
${f(c.page_heading)}:

${points.map((line) => `  - ${line}`).join("\n")}

${closing.join("\n\n")}

${SIGNOFF_TEXT}`;

  return { subject: f(c.subject), html, text };
}

// ═══════════════════════════════════════════════════════════════════════
// Their copy of what they just signed.
// ═══════════════════════════════════════════════════════════════════════

export function buildSignedEmail(
  p: Proposal,
  signature: ProposalSignature,
  url: string,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(PROPOSAL_SLOTS.signed, copy);
  const name = signature.signer_name.split(/\s+/)[0];
  const signedAt = new Date(signature.signed_at).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Chicago",
  });

  const rows: MoneyRow[] = [
    { label: "Signed", value: signedAt },
    { label: "Agreement version", value: signature.agreement_version },
    ...moneyRows(p, "Due now"),
  ];

  const vars = {
    ...baseVars(p),
    first_name: name,
    greeting: name ? `Hi ${name},` : "Hi,",
    signed_at: signedAt,
  };
  const f = (t: string) => fill(t, vars);
  // The opening line is escaped as typed, then filled with escaped values —
  // except the title, which keeps its bold.
  const htmlVars = {
    ...Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)])),
    title: `<strong style="color:${C.text};">${esc(p.title)}</strong>`,
  };
  const introHtml = paragraphsOf(c.intro).map((x) => fill(esc(x), htmlVars));
  const intro = paragraphsOf(f(c.intro));
  const next = paragraphsOf(f(c.next));

  const html = renderEmail({
    preheader: `${p.proposal_number} signed on ${signedAt}. Your copy is kept at the same link.`,
    headerMeta: p.proposal_number,
    tone: "success",
    blocks: [
      eyebrow("Signed & recorded"),
      heading(f(c.heading)),
      ...introHtml.map((x) => paragraph(x)),
      factPanel(rows),
      ...next.map((x) => paragraph(esc(x), { dim: true })),
      button(f(c.button), url),
      linkFallback(url),
      divider(),
      fineprint(f(c.record_note)),
      signoff(),
    ],
    footnote: f(c.footnote),
  });

  const text = `${intro.join("\n\n")}

Proposal: ${p.proposal_number}
Project: ${p.title}
Signed: ${signedAt}
Agreement version: ${signature.agreement_version}

${rowsAsText(moneyRows(p, "Due now"))}

${next.join("\n\n")}

Your signed copy stays available at the same link, and you can read or print
it at any time:

${url}

${SIGNOFF_TEXT}`;

  return { subject: f(c.subject), html, text };
}

// ═══════════════════════════════════════════════════════════════════════
// There is no proposal payment email.
//
// buildPaymentEmail() used to live here. A proposal never collects now, so a
// receipt for one cannot exist; buildInvoiceReceiptEmail() in
// src/lib/invoices/email-content.ts is the receipt this business sends.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// Internal notification. Says what happened and what it is worth.
// ═══════════════════════════════════════════════════════════════════════

export type AdminEventKind = "viewed" | "signed" | "paid" | "declined";

const ADMIN_TONE: Record<AdminEventKind, "default" | "success" | "alert"> = {
  viewed: "default",
  signed: "success",
  paid: "success",
  declined: "alert",
};

export function buildAdminEmail(
  kind: AdminEventKind,
  p: Proposal,
  detail?: string | null,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(PROPOSAL_SLOTS.admin, copy);
  const who = p.client_business_name || p.client_contact_name || "client";
  const trimmedDetail = detail?.trim() || null;
  const value = formatMoney(p.total_cents, p.currency);
  const vars = { ...baseVars(p), client: who, value };
  const label = fill(c[`label_${kind}`], vars);
  const f = (t: string) => fill(t, { ...vars, label });

  const rows: MoneyRow[] = [
    { label: "Client", value: p.client_business_name || "—" },
    {
      label: "Contact",
      value: p.client_contact_name || "—",
      note: p.client_email || undefined,
    },
    { label: "Project", value: p.title },
    { label: "Package", value: p.package_name || "—" },
    ...moneyRows(p),
  ];

  const html = renderEmail({
    preheader: `${label} · ${who} · ${p.proposal_number} · ${value}`,
    headerMeta: p.proposal_number,
    tone: ADMIN_TONE[kind],
    blocks: [
      eyebrow(`${label} · ${p.proposal_number}`),
      heading(f(c[`heading_${kind}`])),
      paragraph(`<strong style="color:${C.text};">${esc(who)}</strong>`, { dim: true }),
      factPanel(rows),
      trimmedDetail ? quote(trimmedDetail) : "",
      fineprint(f(c.admin_line)),
    ].filter(Boolean),
    footnote: f(c.footnote),
  });

  const text = `${label.toUpperCase()} — ${p.proposal_number}

Client:   ${p.client_business_name || "—"}
Contact:  ${p.client_contact_name || "—"} ${p.client_email ? `<${p.client_email}>` : ""}
Project:  ${p.title}
Package:  ${p.package_name || "—"}

${rowsAsText(moneyRows(p))}
${trimmedDetail ? `\n${trimmedDetail}\n` : ""}
${f(c.admin_line)}`;

  return { subject: f(c.subject), html, text };
}
