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
import { fill, linesOf, paragraphsOf, resolveCopy, type CopySlot, type EmailCopy } from "@/lib/system-emails/copy";

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

  // A monthly-only invoice has nothing due up front. Showing "Amount due: $0"
  // there reads like a mistake, so the monthly total takes its place.
  const recurringOnly = isRecurringOnly(inv);
  if (!recurringOnly) {
    rows.push({
      label: "Amount due",
      value: money(outstandingCents(inv)),
      strong: true,
      note: inv.due_date ? `by ${formatDate(inv.due_date)}` : "on receipt",
    });
  }

  if (inv.recurring_cents > 0) {
    const per = `/${inv.recurring_interval}`;
    const recurringItems = items.filter((i) => i.item_kind === "recurring");
    // Each recurring service by name, so nothing is folded into one label.
    for (const item of recurringItems) {
      rows.push({ label: item.title, value: `${money(item.total_price_cents)}${per}` });
    }
    rows.push({
      label: recurringItems.length ? `Total per ${inv.recurring_interval}` : "Hosting & management",
      value: `${money(inv.recurring_cents)}${per}`,
      strong: recurringOnly,
      note: inv.recurring_starts_on
        ? `starts ${formatDate(inv.recurring_starts_on)}`
        : "billed separately",
    });
  }

  return rows;
}

/** Nothing due up front, only a recurring charge (hosting, management, and the like). */
function isRecurringOnly(inv: Invoice): boolean {
  return outstandingCents(inv) <= 0 && inv.amount_paid_cents <= 0 && inv.recurring_cents > 0;
}

function rowsAsText(rows: MoneyRow[]): string {
  return rows.map((r) => `${r.label}: ${r.value}${r.note ? ` (${r.note})` : ""}`).join("\n");
}

const FOOTNOTE_CLIENT =
  "You are receiving this because Tomorrow's Tech AI raised an invoice for you. The link above is private to you — please don't forward it.";

const SIGNOFF_TEXT = `— ${BRAND.signer}
${BRAND.signerRole}
${BRAND.site}
${BRAND.phone}`;

// ═══════════════════════════════════════════════════════════════════════
// Editable wording (System emails page). Defaults are the shipped text.
// ═══════════════════════════════════════════════════════════════════════

export const INVOICE_SLOTS: Record<"sent" | "receipt" | "reminder" | "admin", CopySlot[]> = {
  sent: [
    { key: "subject_due", label: "Subject (something due now)", default: "Invoice {invoice_number} — {amount_due} due" },
    { key: "subject_monthly", label: "Subject (monthly-only invoice)", default: "Invoice {invoice_number} — {monthly}" },
    { key: "subject_settled", label: "Subject (nothing left to pay)", default: "Invoice {invoice_number} — {title}" },
    { key: "intro", label: "Opening line", default: "{greeting} the work is done and here is the invoice for it — every line itemised, and a button to pay it by card if that is easiest.", multiline: true },
    { key: "intro_monthly", label: "Opening line (monthly-only invoice)", default: "{greeting} here is the invoice for your monthly services — every line itemised, and a button to set up payment by card if that is easiest.", multiline: true },
    { key: "button_pay", label: "Button (when there's something to pay)", default: "View and pay your invoice" },
    { key: "button_view", label: "Button (nothing to pay)", default: "View your invoice" },
    { key: "pay_heading", label: "How-to-pay heading", default: "Paying it" },
    { key: "pay_steps", label: "How-to-pay points (one per line)", default: "Pay by card on the invoice page — it opens straight into Stripe\nOr pay however we agreed; reply here and it will be marked off\nThe page updates the moment payment lands, so you always see the real balance", multiline: true },
    { key: "closing", label: "Closing line", default: "Anything on here that does not look right, reply to this email and we will fix it before you pay a penny.", multiline: true },
    { key: "footnote", label: "Footer note", default: "You are receiving this because Tomorrow's Tech AI raised an invoice for you. The link above is private to you — please don't forward it.", multiline: true },
  ],
  receipt: [
    { key: "subject", label: "Subject", default: "Payment received — invoice {invoice_number}" },
    { key: "heading_full", label: "Heading (paid in full)", default: "Thank you — paid in full" },
    { key: "heading_partial", label: "Heading (balance remains)", default: "Thank you — payment received" },
    { key: "intro", label: "Opening line", default: "{greeting} that has come through. Here is your record of it.", multiline: true },
    { key: "button", label: "Button", default: "View your invoice" },
    { key: "closing", label: "Closing line", default: "It is a pleasure working with you.", multiline: true },
  ],
  reminder: [
    { key: "subject", label: "Subject", default: "Reminder — invoice {invoice_number} ({amount_due})" },
    { key: "heading", label: "Heading", default: "{amount_due} still outstanding" },
    { key: "intro", label: "Opening line", default: "{greeting} a quick nudge about invoice {invoice_number}. {late_line}", multiline: true, help: "{late_line} says when it was due and how many days ago." },
    { key: "button", label: "Button", default: "View and pay your invoice" },
    { key: "closing", label: "Closing line", default: "If it has already been paid, or something on it needs changing, just reply and we will sort it out.", multiline: true },
  ],
  admin: [
    { key: "line_sent", label: "Line: invoice sent", default: "Invoice {invoice_number} went out to {client}." },
    { key: "line_viewed", label: "Line: invoice opened", default: "{client} opened invoice {invoice_number}." },
    { key: "line_paid", label: "Line: paid in full", default: "{client} paid invoice {invoice_number} in full." },
    { key: "line_partial", label: "Line: part-paid", default: "{client} part-paid invoice {invoice_number}." },
  ],
};

function baseVars(inv: Invoice) {
  const name = firstName(inv);
  return {
    first_name: name,
    greeting: name ? `Hi ${name},` : "Hi,",
    invoice_number: inv.invoice_number,
    title: inv.title,
    business_name: inv.client_business_name ?? "",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// The invoice itself.
// ═══════════════════════════════════════════════════════════════════════

export function buildInvoiceEmail(
  inv: Invoice,
  items: InvoiceItem[],
  url: string,
  note?: string | null,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(INVOICE_SLOTS.sent, copy);
  const rows = moneyRows(inv, items);
  const due = outstandingCents(inv);
  const trimmedNote = note?.trim() || null;
  const vars = {
    ...baseVars(inv),
    amount_due: formatMoney(due, inv.currency),
    monthly: inv.recurring_cents > 0 ? `${formatMoney(inv.recurring_cents, inv.currency)}/${inv.recurring_interval}` : "",
    due_date: inv.due_date ? formatDate(inv.due_date) : "on receipt",
  };
  const f = (t: string) => fill(t, vars);
  const intro = paragraphsOf(f(isRecurringOnly(inv) ? c.intro_monthly : c.intro));
  const steps = linesOf(f(c.pay_steps));
  const closing = paragraphsOf(f(c.closing));

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
      ...intro.map((p) => paragraph(esc(p))),
      factPanel(rows),
      button(f(due > 0 || inv.recurring_cents > 0 ? c.button_pay : c.button_view), url),
      linkFallback(url),
      trimmedNote ? quote(trimmedNote) : "",
      divider(),
      subheading(f(c.pay_heading)),
      bullets(steps),
      inv.due_date
        ? fineprint(`This invoice is due by ${formatDate(inv.due_date)}.`)
        : fineprint("This invoice is due on receipt."),
      ...closing.map((p) => paragraph(esc(p))),
      signoff(),
    ].filter(Boolean),
    footnote: f(c.footnote),
  });

  const text = `${intro.join("\n\n")}

${url}

Invoice: ${inv.invoice_number}
For: ${inv.title}
${inv.issue_date ? `Issued: ${formatDate(inv.issue_date)}` : ""}
${inv.due_date ? `Due: ${formatDate(inv.due_date)}` : "Due: on receipt"}

${rowsAsText(rows)}
${trimmedNote ? `\n${trimmedNote}\n` : ""}
${f(c.pay_heading)}:

${steps.map((line) => `  - ${line}`).join("\n")}

${closing.join("\n\n")}

${SIGNOFF_TEXT}`;

  return {
    subject: f(due > 0 ? c.subject_due : inv.recurring_cents > 0 ? c.subject_monthly : c.subject_settled),
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
  receiptUrl?: string | null,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(INVOICE_SLOTS.receipt, copy);
  const money = (cents: number) => formatMoney(cents, inv.currency);
  const remaining = outstandingCents(inv);
  const vars = { ...baseVars(inv), amount_paid: money(amountCents), amount_remaining: money(remaining) };
  const f = (t: string) => fill(t, vars);
  const intro = paragraphsOf(f(c.intro));
  const closing = paragraphsOf(f(c.closing));

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
      heading(f(remaining > 0 ? c.heading_partial : c.heading_full)),
      ...intro.map((p) => paragraph(esc(p))),
      factPanel(rows),
      button(f(c.button), url),
      linkFallback(url),
      receiptUrl ? paragraph(`Stripe's own receipt is here: <a href="${esc(receiptUrl)}">${esc(receiptUrl)}</a>`, { dim: true }) : "",
      remaining > 0
        ? fineprint(`A balance of ${money(remaining)} remains on this invoice.`)
        : "",
      ...closing.map((p) => paragraph(esc(p))),
      signoff(),
    ].filter(Boolean),
    footnote: FOOTNOTE_CLIENT,
  });

  const text = `${intro.join("\n\n")}

${money(amountCents)} received against invoice ${inv.invoice_number}.

${rowsAsText(rows)}

Your invoice: ${url}
${receiptUrl ? `Stripe receipt: ${receiptUrl}` : ""}

${closing.join("\n\n")}

${SIGNOFF_TEXT}`;

  return { subject: f(c.subject), html, text };
}

// ═══════════════════════════════════════════════════════════════════════
// A nudge on something overdue. Firm, never cross.
// ═══════════════════════════════════════════════════════════════════════

export function buildInvoiceReminderEmail(
  inv: Invoice,
  items: InvoiceItem[],
  url: string,
  daysLate: number,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(INVOICE_SLOTS.reminder, copy);
  const due = outstandingCents(inv);
  const rows = moneyRows(inv, items);

  const lateLine =
    daysLate > 0
      ? `It was due on ${formatDate(inv.due_date)}, which is ${daysLate} day${daysLate === 1 ? "" : "s"} ago.`
      : `It is due on ${formatDate(inv.due_date)}.`;
  const vars = { ...baseVars(inv), amount_due: formatMoney(due, inv.currency), late_line: lateLine, days_late: daysLate, due_date: formatDate(inv.due_date) };
  const f = (t: string) => fill(t, vars);
  const intro = paragraphsOf(f(c.intro));
  const closing = paragraphsOf(f(c.closing));

  const html = renderEmail({
    preheader: `${inv.invoice_number} — ${formatMoney(due, inv.currency)} still outstanding.`,
    headerMeta: inv.invoice_number,
    tone: "alert",
    blocks: [
      eyebrow("Reminder"),
      heading(f(c.heading)),
      ...intro.map((p) => paragraph(esc(p))),
      factPanel(rows),
      button(f(c.button), url),
      linkFallback(url),
      ...closing.map((p) => paragraph(esc(p), { dim: true })),
      signoff(),
    ].filter(Boolean),
    footnote: FOOTNOTE_CLIENT,
  });

  const text = `${intro.join("\n\n")}

${rowsAsText(rows)}

${f(c.button)}: ${url}

${closing.join("\n\n")}

${SIGNOFF_TEXT}`;

  return { subject: f(c.subject), html, text };
}

// ═══════════════════════════════════════════════════════════════════════
// Internal.
// ═══════════════════════════════════════════════════════════════════════

export type AdminInvoiceEvent = "sent" | "viewed" | "paid" | "partial";

export function buildAdminInvoiceEmail(
  kind: AdminInvoiceEvent,
  inv: Invoice,
  detail?: string | null,
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(INVOICE_SLOTS.admin, copy);
  const money = (cents: number) => formatMoney(cents, inv.currency);
  const client = inv.client_business_name || inv.client_contact_name || inv.client_email || "a client";
  const line = fill(c[`line_${kind}`], { ...baseVars(inv), client });

  const html = renderEmail({
    preheader: line,
    headerMeta: inv.invoice_number,
    tone: kind === "paid" ? "success" : "default",
    blocks: [
      eyebrow("Invoice"),
      heading(line),
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

  const text = `${line}

Client: ${client}
Total: ${money(inv.total_cents)}
Collected: ${money(inv.amount_paid_cents)}
Outstanding: ${money(outstandingCents(inv))}
${detail ?? ""}`;

  return { subject: line, html, text };
}
