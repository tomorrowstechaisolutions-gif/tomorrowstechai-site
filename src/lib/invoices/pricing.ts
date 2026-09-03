/**
 * Invoice arithmetic, computed in one place and never in the browser.
 *
 * The client's page posts a token and nothing else. Every figure Stripe is
 * asked for is recomputed here from the stored lines immediately beforehand,
 * so a tampered form body can change nothing about what is charged.
 *
 * One-time and recurring are totalled separately on purpose. An invoice for
 * "the build, plus hosting from next month" is two different promises about
 * money: one is a bill, the other is a subscription, and adding them into a
 * single number would misstate both.
 */

import type { InvoiceItemKind } from "./config";

export type InvoiceLine = {
  item_kind: InvoiceItemKind;
  quantity: number;
  unit_price_cents: number;
};

export type InvoiceTotals = {
  /** One-time lines before any discount. */
  subtotalCents: number;
  discountCents: number;
  /** subtotal − discount, floored at zero. This is what is owed today. */
  totalCents: number;
  /** The monthly (or yearly) lines, summed. Not part of totalCents. */
  recurringCents: number;
};

export function lineTotal(line: { quantity: number; unit_price_cents: number }): number {
  return Math.max(0, Math.round(line.quantity * line.unit_price_cents));
}

export function computeInvoice(lines: InvoiceLine[]): InvoiceTotals {
  let subtotal = 0;
  let discount = 0;
  let recurring = 0;

  for (const line of lines) {
    const amount = lineTotal(line);
    if (line.item_kind === "discount") discount += amount;
    else if (line.item_kind === "recurring") recurring += amount;
    else subtotal += amount;
  }

  const discountCents = Math.min(discount, subtotal);

  return {
    subtotalCents: subtotal,
    discountCents,
    totalCents: Math.max(0, subtotal - discountCents),
    recurringCents: recurring,
  };
}

/** What is still owed on the one-time side. Never negative. */
export function outstandingCents(inv: {
  total_cents: number;
  amount_paid_cents: number;
}): number {
  return Math.max(0, inv.total_cents - inv.amount_paid_cents);
}

/**
 * Overdue is a fact about the calendar, not a status somebody set.
 *
 * Deliberately derived rather than stored: a nightly job that stamps rows
 * `overdue` would be one more thing to run, and it would be wrong for the
 * hours between midnight and whenever it ran.
 */
export function isOverdue(inv: {
  status: string;
  due_date: string | null;
  total_cents: number;
  amount_paid_cents: number;
}): boolean {
  if (!inv.due_date) return false;
  if (inv.status !== "sent" && inv.status !== "partial") return false;
  if (outstandingCents(inv) <= 0) return false;
  return new Date(`${inv.due_date}T23:59:59Z`).getTime() < Date.now();
}

/** How many days past due, for the "12 days overdue" line. Zero if not. */
export function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate}T23:59:59Z`).getTime();
  const diff = Date.now() - due;
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}

/** $399, $1,250.50 — the one formatter the invoice and its emails share. */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "Sep 3, 2026" from a bare YYYY-MM-DD, without a timezone slipping a day. */
export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
