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
import { chicagoDayEnd } from "@/lib/time/chicago";

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

/** Today's date in Chicago as YYYY-MM-DD, the calendar the business runs on. */
function chicagoToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type RecurringFacts = {
  status: string;
  total_cents: number;
  amount_paid_cents: number;
  recurring_cents: number;
  recurring_starts_on: string | null;
};

/** The recurring line has a start date that is still ahead of today. */
export function recurringStartsLater(
  inv: { recurring_cents: number; recurring_starts_on: string | null },
  now: Date = new Date()
): boolean {
  if (inv.recurring_cents <= 0 || !inv.recurring_starts_on) return false;
  return inv.recurring_starts_on > chicagoToday(now);
}

/**
 * Nothing more can be set up from this invoice.
 *
 * A paid invoice is finished. A monthly-only invoice has a one-time total of
 * zero, so "paid" can never come from the one-time side: money against it, or
 * the paid stamp the webhook sets when its subscription starts, is what says
 * the subscription is running. Without this the page would offer a second
 * subscription to a client who already has one.
 */
export function invoiceSettled(inv: RecurringFacts): boolean {
  if (inv.status === "paid") return true;
  if (inv.total_cents <= 0 && inv.amount_paid_cents > 0) return true;
  return outstandingCents(inv) <= 0 && inv.recurring_cents <= 0;
}

/**
 * What the card is charged the moment checkout completes.
 *
 * The outstanding one-time balance, plus the first recurring period when the
 * recurring line starts today (or has no start date, or the date has passed).
 * A recurring line that starts later is not charged until that date. This is
 * the same sum Stripe arrives at from the checkout session, so the page and
 * the email can state it before the client gets there.
 */
export function dueTodayCents(inv: RecurringFacts, now: Date = new Date()): number {
  if (invoiceSettled(inv)) return 0;
  const firstPeriod =
    inv.recurring_cents > 0 && !recurringStartsLater(inv, now) ? inv.recurring_cents : 0;
  return outstandingCents(inv) + firstPeriod;
}

/**
 * The moment the first recurring charge is taken, as Unix seconds, or null
 * when it bills straight away.
 *
 * Noon UTC on the start date: early morning in Chicago, and the same calendar
 * day in both, so "the 1st" is the 1st wherever it is read. Stripe renews on
 * this day of the month from then on.
 */
export function recurringStartUnix(
  inv: { recurring_cents: number; recurring_starts_on: string | null },
  now: Date = new Date()
): number | null {
  if (!recurringStartsLater(inv, now)) return null;
  return Math.floor(new Date(`${inv.recurring_starts_on}T12:00:00Z`).getTime() / 1000);
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
  // Overdue once the due date is over in Central time. End of day in UTC
  // would turn an invoice overdue at about 6pm on the day it is due.
  return chicagoDayEnd(inv.due_date).getTime() <= Date.now();
}

/** How many days past due, for the "12 days overdue" line. Zero if not. */
export function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = chicagoDayEnd(dueDate).getTime();
  const diff = Date.now() - due;
  return diff < 0 ? 0 : Math.floor(diff / 86_400_000);
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
