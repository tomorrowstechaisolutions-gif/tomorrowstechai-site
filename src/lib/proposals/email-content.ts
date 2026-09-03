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

const WHATS_ON_THE_PAGE = [
  "The full scope of work, line by line, and what is deliberately not in it",
  "The price, in full — and confirmation that nothing is due when you sign",
  "Ownership and software license terms, in plain language before the legal wording",
  "The complete Website Development, Hosting & Software License Agreement",
  "A signature box. No printing, no scanning, nothing to post back",
];

const FOOTNOTE_CLIENT =
  "You are receiving this because a proposal was prepared for you by Tomorrow's Tech AI. The link above is private to you — please don't forward it.";

const SIGNOFF_TEXT = `— ${BRAND.signer}
${BRAND.signerRole}
${BRAND.site}
${BRAND.phone}`;

// ═══════════════════════════════════════════════════════════════════════
// The proposal itself.
// ═══════════════════════════════════════════════════════════════════════

export function buildProposalEmail(
  p: Proposal,
  url: string,
  note?: string | null
): BuiltEmail {
  const name = firstName(p);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const rows = moneyRows(p);
  const expires = expiryDate(p);
  const trimmedNote = note?.trim() || null;

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
      paragraph(
        `${esc(greeting)} everything we talked about is written down here — what gets built, what it costs, who owns what, and the agreement in full.`
      ),
      paragraph("Read it at your own pace. If it looks right, you can sign it on the page.", { dim: true }),
      factPanel(rows),
      button("Read and sign your proposal", url),
      linkFallback(url),
      trimmedNote ? quote(trimmedNote) : "",
      divider(),
      subheading("What's on the page"),
      bullets(WHATS_ON_THE_PAGE),
      expires ? fineprint(`This proposal is open for acceptance until ${expires}.`) : "",
      paragraph("Anything you want changed before you sign, just reply to this email and we will sort it out."),
      signoff(),
    ].filter(Boolean),
    footnote: FOOTNOTE_CLIENT,
  });

  const text = `${greeting}

Your proposal is ready to read and sign online:

${url}

Proposal: ${p.proposal_number}
Project: ${p.title}

${rowsAsText(rows)}
${expires ? `\nThis proposal is open for acceptance until ${expires}.\n` : ""}${trimmedNote ? `\n${trimmedNote}\n` : ""}
What's on the page:

${WHATS_ON_THE_PAGE.map((line) => `  - ${line}`).join("\n")}

Anything you want changed before you sign, just reply to this email and we
will sort it out.

${SIGNOFF_TEXT}`;

  return { subject: `Your proposal is ready — ${p.title}`, html, text };
}

// ═══════════════════════════════════════════════════════════════════════
// Their copy of what they just signed.
// ═══════════════════════════════════════════════════════════════════════

export function buildSignedEmail(
  p: Proposal,
  signature: ProposalSignature,
  url: string
): BuiltEmail {
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

  const next =
    "We will be in touch shortly with what we need from you to get started. An invoice follows separately — nothing is owed at the moment you sign.";

  const html = renderEmail({
    preheader: `${p.proposal_number} signed on ${signedAt}. Your copy is kept at the same link.`,
    headerMeta: p.proposal_number,
    tone: "success",
    blocks: [
      eyebrow("Signed & recorded"),
      heading("Thank you — that's official"),
      paragraph(
        `${esc(name ? `Hi ${name},` : "Hi,")} your agreement for <strong style="color:${C.text};">${esc(p.title)}</strong> is signed and on file. Nothing else is needed from you to make it binding.`
      ),
      factPanel(rows),
      paragraph(esc(next), { dim: true }),
      button("Open your signed copy", url),
      linkFallback(url),
      divider(),
      fineprint(
        "Your signed copy stays at that link permanently — readable and printable whenever you want it. Your name, email, the time, your IP address and the exact agreement version were recorded with the signature."
      ),
      signoff(),
    ],
    footnote: FOOTNOTE_CLIENT,
  });

  const text = `Hi ${name},

Thank you — your agreement is signed and recorded.

Proposal: ${p.proposal_number}
Project: ${p.title}
Signed: ${signedAt}
Agreement version: ${signature.agreement_version}

${rowsAsText(moneyRows(p, "Due now"))}

${next}

Your signed copy stays available at the same link, and you can read or print
it at any time:

${url}

${SIGNOFF_TEXT}`;

  return { subject: `Signed — ${p.title} (${p.proposal_number})`, html, text };
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

const ADMIN_COPY: Record<
  AdminEventKind,
  { label: string; title: string; tone: "default" | "success" | "alert" }
> = {
  viewed:   { label: "Opened",   title: "They are reading it", tone: "default" },
  signed:   { label: "Signed",   title: "Signed and locked",   tone: "success" },
  paid:     { label: "Paid",     title: "Money landed",        tone: "success" },
  declined: { label: "Declined", title: "They said no",        tone: "alert"   },
};

export function buildAdminEmail(
  kind: AdminEventKind,
  p: Proposal,
  detail?: string | null
): BuiltEmail {
  const copy = ADMIN_COPY[kind];
  const who = p.client_business_name || p.client_contact_name || "client";
  const trimmedDetail = detail?.trim() || null;
  const value = formatMoney(p.total_cents, p.currency);

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
    preheader: `${copy.label} · ${who} · ${p.proposal_number} · ${value}`,
    headerMeta: p.proposal_number,
    tone: copy.tone,
    blocks: [
      eyebrow(`${copy.label} · ${p.proposal_number}`),
      heading(copy.title),
      paragraph(`<strong style="color:${C.text};">${esc(who)}</strong>`, { dim: true }),
      factPanel(rows),
      trimmedDetail ? quote(trimmedDetail) : "",
      fineprint("Open it in the admin under Proposals."),
    ].filter(Boolean),
    footnote: "Internal notification from the Tomorrow's Tech AI Command Center.",
  });

  const text = `${copy.label.toUpperCase()} — ${p.proposal_number}

Client:   ${p.client_business_name || "—"}
Contact:  ${p.client_contact_name || "—"} ${p.client_email ? `<${p.client_email}>` : ""}
Project:  ${p.title}
Package:  ${p.package_name || "—"}

${rowsAsText(moneyRows(p))}
${trimmedDetail ? `\n${trimmedDetail}\n` : ""}
Open it in the admin under Proposals.`;

  return { subject: `${copy.label} — ${who} · ${p.proposal_number} · ${value}`, html, text };
}
