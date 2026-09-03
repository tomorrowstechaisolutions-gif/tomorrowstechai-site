/**
 * What every invoice email says, and what it looks like.
 *
 * Split out from emails.ts deliberately, the same way the proposal templates
 * are: sending needs `server-only` and the Resend client, composing needs
 * neither, so these can be rendered to a file and looked at rather than
 * reviewed by sending real mail to a real client and hoping.
 *
 * Every message carries a full plain-text alternative built from the same
 * rows, so the two halves can never quote different numbers.
 *
 * The font stack in brand.ts uses SINGLE quotes. Don't introduce a double
 * quote into any inline style here — it closes the attribute early and every
 * declaration after it is silently dropped.
 */

import { formatMoney, formatDate, outstandingCents } from "./pricing";
import type { Invoice, InvoiceItem } from "./types";
import {
  BRAND, renderEmail, eyebrow, heading, paragraph, subheading,
  factPanel, button, linkFallback, bullets, quote, divider, fineprint,
  signoff, esc,
} from "@/lib/email/brand";

export type BuiltEmail = { subject: string; html: string; text: string };

function firstName(inv: Invoice): string {
  const name = (inv.client_contact_name ?? "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

type MoneyRow = { label: string; value: string; strong?: boolean; note?: string };

/** The figures, once. Both the panel and the text version are built from this. */
export function moneyRows(inv: Invoice, items: InvoiceItem[]): MoneyRow[] {
  const rows: MoneyRow[] = [];
  const money = (cents: number) => formatMoney(cents, inv.currency);

  for (const item of items.filter((i) => i.item_kind === "one_time")) {
    rows.push({
      label: item.title,
      value: money(item.total_price_cents),
      note: item.quantity !== 1 ? `${item.quantity} × ${money(item.unit_price_cents)}` : undefined,
    });
  }

  if (rows.length === 0 && inv.total_cents > 0) {
    rows.push({ label: inv.title, value: money(inv.total_cents) });
  }

  if (inv.discount_cents > 0) {
    rows.push({ label: "Discount", value: `− ${money(inv.discount_cents)}` });
  }

  if (inv.amount_paid_cents > 0) {
    rows.push({ label: "Already paid", value: `− ${money(inv.amount_paid_cents)}` });
  }

  rows.push({
    label: "Amount due",
    value: money(outstandingCents(inv)),
    strong: true,
    note: inv.due_date ? `by ${formatDate(inv.due_date)}` : "on receipt",
  });

  if (inv.recurring_cents > 0) {
    rows.push({
      label: "Hosting & management",
      value: `${money(inv.recurring_cents)}/${inv.recurring_interval}`,
      note: inv.recurring_starts_on
        ? `starts ${formatDate(inv.recurring_starts_on)}`
        : "billed separately",
    });
  }

  return rows;
}

function rowsAsText(rows: MoneyRow[]): string {
  return rows.map((r) => `${r.label}: ${r.value}${r.note ? ` (${r.note})` : ""}`).join("\n");
}

const HOW_TO_PAY = [
  "Pay by card on the invoice page — it opens straight into Stripe",
  "Or pay however we agreed; reply here and it will be marked off",
  "The page updates the moment payment lands, so you always see the real balance",
];

const FOOTNOTE_CLIENT =
  "You are receiving this because Tomorrow's Tech AI raised an invoice for you. The link above is private to you — please don't forward it.";

const SIGNOFF_TEXT = `— ${BRAND.signer}
${BRAND.signerRole}
${BRAND.site}
${BRAND.phone}`;

// ═══════════════════════════════════════════════════════════════════════
// The invoice itself.
// ═══════════════════════════════════════════════════════════════════════

export function buildInvoiceEmail(
  inv: Invoice,
  items: InvoiceItem[],
  url: string,
  note?: string | null
): BuiltEmail {
  const name = firstName(inv);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const rows = moneyRows(inv, items);
  const due = outstandingCents(inv);
  const trimmedNote = note?.trim() || null;

  const preheader = [
    inv.invoice_number,
    `${formatMoney(due, inv.currency)} due`,
    inv.due_date ? `by ${formatDate(inv.due_date)}` : "on receipt",
    inv.recurring_cents > 0
      ? `then ${formatMoney(inv.recurring_cents, inv.currency)}/${inv.recurring_interval}`
      : null,
  ].filter(Boolean).join("  ·  ");

  const html = renderEmail({
    preheader,
    headerMeta: inv.invoice_number,
    blocks: [
      eyebrow("Invoice"),
      heading(inv.title),
      paragraph(
        `${esc(greeting)} the work is done and here is the invoice for it — every line itemised, and a button to pay it by card if that is easiest.`
      ),
      factPanel(rows),
      button(due > 0 ? "View and pay your invoice" : "View your invoice", url),
      linkFallback(url),
      trimmedNote ? quote(trimmedNote) : "",
      divider(),
      subheading("Paying it"),
      bullets(HOW_TO_PAY),
      inv.due_date
        ? fineprint(`This invoice is due by ${formatDate(inv.due_date)}.`)
        : fineprint("This invoice is due on receipt."),
      paragraph("Anything on here that does not look right, reply to this email and we will fix it before you pay a penny."),
      signoff(),
    ].filter(Boolean),
    footnote: FOOTNOTE_CLIENT,
  });

  const text = `${greeting}

Your invoice is ready to view and pay online:

${url}

Invoice: ${inv.invoice_number}
For: ${inv.title}
${inv.issue_date ? `Issued: ${formatDate(inv.issue_date)}` : ""}
${inv.due_date ? `Due: ${formatDate(inv.due_date)}` : "Due: on receipt"}

${rowsAsText(rows)}
${trimmedNote ? `\n${trimmedNote}\n` : ""}
Paying it:

${HOW_TO_PAY.map((line) => `  - ${line}`).join("\n")}

Anything on here that does not look right, reply to this email and we will fix
it before you pay a penny.

${SIGNOFF_TEXT}`;

  return {
    subject:
      due > 0
        ? `Invoice ${inv.invoice_number} — ${formatMoney(due, inv.currency)} due`
        : `Invoice ${inv.invoice_number} — ${inv.title}`,
    html,
    text,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// The receipt.
// ═══════════════════════════════════════════════════════════════════════

export function buildInvoiceReceiptEmail(
  inv: Invoice,
  amountCents: number,
  url: string,
  receiptUrl?: string | null
): BuiltEmail {
  const name = firstName(inv);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const money = (cents: number) => formatMoney(cents, inv.currency);
  const remaining = outstandingCents(inv);

  const rows: MoneyRow[] = [
    { label: "Paid", value: money(amountCents), strong: true },
    { label: "Invoice", value: inv.invoice_number },
    { label: "For", value: inv.title },
  ];
  if (remaining > 0) {
    rows.push({ label: "Still outstanding", value: money(remaining) });
  }
  if (inv.recurring_cents > 0) {
    rows.push({
      label: "Hosting & management",
      value: `${money(inv.recurring_cents)}/${inv.recurring_interval}`,
      note: inv.recurring_starts_on ? `from ${formatDate(inv.recurring_starts_on)}` : undefined,
    });
  }

  const html = renderEmail({
    preheader: `${money(amountCents)} received — thank you. Invoice ${inv.invoice_number}.`,
    headerMeta: inv.invoice_number,
    tone: "success",
    blocks: [
      eyebrow("Payment received"),
      heading(remaining > 0 ? "Thank you — payment received" : "Thank you — paid in full"),
      paragraph(`${esc(greeting)} that has come through. Here is your record of it.`),
      factPanel(rows),
      button("View your invoice", url),
      linkFallback(url),
      receiptUrl ? paragraph(`Stripe's own receipt is here: <a href="${esc(receiptUrl)}">${esc(receiptUrl)}</a>`, { dim: true }) : "",
      remaining > 0
        ? fineprint(`A balance of ${money(remaining)} remains on this invoice.`)
        : "",
      paragraph("It is a pleasure working with you."),
      signoff(),
    ].filter(Boolean),
    footnote: FOOTNOTE_CLIENT,
  });

  const text = `${greeting}

${money(amountCents)} received against invoice ${inv.invoice_number} — thank you.

${rowsAsText(rows)}

Your invoice: ${url}
${receiptUrl ? `Stripe receipt: ${receiptUrl}` : ""}

${SIGNOFF_TEXT}`;

  return {
    subject: `Payment received — invoice ${inv.invoice_number}`,
    html,
    text,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// A nudge on something overdue. Firm, never cross.
// ═══════════════════════════════════════════════════════════════════════

export function buildInvoiceReminderEmail(
  inv: Invoice,
  items: InvoiceItem[],
  url: string,
  daysLate: number
): BuiltEmail {
  const name = firstName(inv);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const due = outstandingCents(inv);
  const rows = moneyRows(inv, items);

  const lateLine =
    daysLate > 0
      ? `It was due on ${formatDate(inv.due_date)}, which is ${daysLate} day${daysLate === 1 ? "" : "s"} ago.`
      : `It is due on ${formatDate(inv.due_date)}.`;

  const html = renderEmail({
    preheader: `${inv.invoice_number} — ${formatMoney(due, inv.currency)} still outstanding.`,
    headerMeta: inv.invoice_number,
    tone: "alert",
    blocks: [
      eyebrow("Reminder"),
      heading(`${formatMoney(due, inv.currency)} still outstanding`),
      paragraph(`${esc(greeting)} a quick nudge about invoice ${esc(inv.invoice_number)}. ${esc(lateLine)}`),
      factPanel(rows),
      button("View and pay your invoice", url),
      linkFallback(url),
      paragraph("If it has already been paid, or something on it needs changing, just reply and we will sort it out.", { dim: true }),
      signoff(),
    ].filter(Boolean),
    footnote: FOOTNOTE_CLIENT,
  });

  const text = `${greeting}

A quick nudge about invoice ${inv.invoice_number}. ${lateLine}

${rowsAsText(rows)}

View and pay: ${url}

If it has already been paid, or something on it needs changing, just reply and
we will sort it out.

${SIGNOFF_TEXT}`;

  return {
    subject: `Reminder — invoice ${inv.invoice_number} (${formatMoney(due, inv.currency)})`,
    html,
    text,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Internal.
// ═══════════════════════════════════════════════════════════════════════

export type AdminInvoiceEvent = "sent" | "viewed" | "paid" | "partial";

export function buildAdminInvoiceEmail(
  kind: AdminInvoiceEvent,
  inv: Invoice,
  detail?: string | null
): BuiltEmail {
  const money = (cents: number) => formatMoney(cents, inv.currency);
  const client = inv.client_business_name || inv.client_contact_name || inv.client_email || "a client";

  const line: Record<AdminInvoiceEvent, string> = {
    sent: `Invoice ${inv.invoice_number} went out to ${client}.`,
    viewed: `${client} opened invoice ${inv.invoice_number}.`,
    paid: `${client} paid invoice ${inv.invoice_number} in full.`,
    partial: `${client} part-paid invoice ${inv.invoice_number}.`,
  };

  const html = renderEmail({
    preheader: line[kind],
    headerMeta: inv.invoice_number,
    tone: kind === "paid" ? "success" : "default",
    blocks: [
      eyebrow("Invoice"),
      heading(line[kind]),
      factPanel([
        { label: "Client", value: client },
        { label: "Total", value: money(inv.total_cents) },
        { label: "Collected", value: money(inv.amount_paid_cents) },
        { label: "Outstanding", value: money(outstandingCents(inv)), strong: true },
        ...(inv.recurring_cents > 0
          ? [{ label: "Recurring", value: `${money(inv.recurring_cents)}/${inv.recurring_interval}` }]
          : []),
      ]),
      detail ? paragraph(esc(detail), { dim: true }) : "",
    ].filter(Boolean),
  });

  const text = `${line[kind]}

Client: ${client}
Total: ${money(inv.total_cents)}
Collected: ${money(inv.amount_paid_cents)}
Outstanding: ${money(outstandingCents(inv))}
${detail ?? ""}`;

  return { subject: `${line[kind]}`, html, text };
}
