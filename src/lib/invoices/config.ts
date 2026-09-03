/**
 * The invoice vocabulary: statuses, what may follow what, payment terms and
 * the line kinds.
 *
 * A plain module on purpose — a `"use server"` file may export nothing but
 * async functions, so every constant both the form and the action need has to
 * live somewhere like this.
 *
 * Where the invoice sits in the business:
 *
 *     proposal  →  both parties accept  →  the work happens  →  INVOICE
 *
 * The proposal is the agreement. The invoice is the bill, and it comes last.
 * Payment is usually taken up front through the proposal's own checkout — but
 * not always, and the whole point of this module is that "not always" is a
 * supported path rather than a thing John has to do in his head.
 */

// ── Status ───────────────────────────────────────────────────────────

export const INVOICE_STATUSES = [
  "draft", "sent", "partial", "paid", "expired", "void", "refunded",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Part paid",
  paid: "Paid",
  expired: "Expired",
  void: "Void",
  refunded: "Refunded",
};

/** Reuses the `.cc-chip` tones already defined for the admin. */
export const STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "t-muted",
  sent: "t-info",
  partial: "t-warn",
  paid: "t-ok",
  expired: "t-risk",
  void: "t-muted",
  refunded: "t-risk",
};

/**
 * What may follow what.
 *
 * `partial` and `paid` are not in anybody's gift — the database sets them
 * from the sum of invoice_payments, so they are reachable here only so an
 * admin correction is not rejected out of hand. A paid invoice may be
 * refunded or voided and nothing else: its amounts are frozen by a trigger,
 * and the fix for a wrong paid invoice is a new one.
 */
export const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft:    ["sent", "void"],
  sent:     ["partial", "paid", "expired", "void", "draft"],
  partial:  ["paid", "void", "sent"],
  paid:     ["refunded", "void"],
  expired:  ["sent", "draft", "void"],
  void:     ["draft"],
  refunded: ["void"],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Finished, one way or another. Nothing is owed on these. */
export const CLOSED_INVOICE_STATUSES: InvoiceStatus[] = ["paid", "void", "refunded"];

/** The client link is live for these. */
export const LIVE_INVOICE_STATUSES: InvoiceStatus[] = ["sent", "partial", "paid"];

// ── Where an invoice came from ───────────────────────────────────────

export const INVOICE_SOURCES = [
  "manual", "proposal", "checkout", "upsell", "hosting",
] as const;
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];

export const SOURCE_LABELS: Record<InvoiceSource, string> = {
  manual: "Written by hand",
  proposal: "From a proposal",
  checkout: "Checkout link",
  upsell: "Upsell link",
  hosting: "Hosting",
};

// ── Lines ────────────────────────────────────────────────────────────

export const ITEM_KINDS = ["one_time", "recurring", "discount"] as const;
export type InvoiceItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABELS: Record<InvoiceItemKind, string> = {
  one_time: "One-time",
  recurring: "Monthly",
  discount: "Discount",
};

// ── Terms ────────────────────────────────────────────────────────────

/**
 * How long the client has. `due_on_receipt` is the default because that is
 * what the agreement says (2.2 Payment Timing), and because a small shop that
 * quietly gives net-30 to everyone is a small shop with a cash-flow problem.
 */
export const PAYMENT_TERMS = ["due_on_receipt", "net_7", "net_14", "net_30", "paid_upfront"] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

export const TERM_LABELS: Record<PaymentTerm, string> = {
  due_on_receipt: "Due on receipt",
  net_7: "Net 7 — due in a week",
  net_14: "Net 14 — due in two weeks",
  net_30: "Net 30 — due in a month",
  paid_upfront: "Already paid up front",
};

export const TERM_DAYS: Record<PaymentTerm, number> = {
  due_on_receipt: 0,
  net_7: 7,
  net_14: 14,
  net_30: 30,
  paid_upfront: 0,
};

/** The due date a term implies, as a YYYY-MM-DD string. */
export function dueDateFor(term: PaymentTerm, issueDate: string): string {
  const base = new Date(`${issueDate}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + TERM_DAYS[term]);
  return base.toISOString().slice(0, 10);
}

// ── Payment methods ──────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  "stripe", "card", "cash", "check", "bank_transfer", "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "Stripe",
  card: "Card",
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank transfer",
  other: "Other",
};

/**
 * The default wording at the bottom of every invoice.
 *
 * Kept in step with clause 2.2 of the service agreement — if that changes,
 * this changes, because a client holding two different sentences about when
 * money is due is a dispute waiting to happen.
 */
export const DEFAULT_TERMS =
  "Payment is due on receipt unless another date is stated above. Work may be paused, launch withheld and managed services suspended while undisputed amounts are overdue. Hosting and management bill monthly and can be cancelled at any time — cancelling stops future charges and does not refund the month in progress.";

export const DEFAULT_FOOTER =
  "Thank you — it is a pleasure building for you. Questions about anything on this invoice: john@tomorrowstechai.com.";
