/**
 * Pricing, computed in one place and never in the browser.
 *
 * The public page posts a token and a name — never an amount. Everything the
 * client is charged is recomputed here from the stored rows immediately
 * before a checkout session is created, so a tampered form body can change
 * nothing about what Stripe is asked for.
 */

import type { PaymentMode } from "./config";
import type { ProposalItem } from "./types";

export type PriceBreakdown = {
  /** Billable, non-optional lines, before any discount. */
  subtotalCents: number;
  discountCents: number;
  /** subtotal − discount, floored at zero. */
  oneTimeCents: number;
  totalCents: number;
  recurringCents: number;
  depositCents: number;
  /** What Stripe is asked for at signature. Zero means no card is collected. */
  dueNowCents: number;
  /** Whatever is left after the amount due now. */
  balanceCents: number;
};

export function lineTotal(item: {
  quantity: number;
  unit_price_cents: number;
}): number {
  return Math.max(0, Math.round(item.quantity * item.unit_price_cents));
}

/**
 * The single source of every figure the proposal prints.
 *
 * Optional lines are shown but never counted — that is what makes an add-on
 * safe to display. `discount` lines are stored as positive amounts and
 * subtracted here, so the database never holds a negative price.
 */
export function computePricing(input: {
  items: Pick<ProposalItem, "item_type" | "quantity" | "unit_price_cents" | "is_billable" | "is_optional">[];
  /** Set when the admin typed a build price directly instead of itemising. */
  basePriceCents?: number;
  recurringCents: number;
  depositCents: number;
  paymentMode: PaymentMode;
}): PriceBreakdown {
  let itemised = 0;
  let discount = 0;

  for (const item of input.items) {
    if (item.is_optional || !item.is_billable) continue;
    const amount = lineTotal(item);
    if (item.item_type === "discount") discount += amount;
    else if (item.item_type === "recurring") continue;
    else itemised += amount;
  }

  const subtotalCents = Math.max(0, (input.basePriceCents ?? 0) + itemised);
  const discountCents = Math.min(discount, subtotalCents);
  const oneTimeCents = Math.max(0, subtotalCents - discountCents);
  const totalCents = oneTimeCents;

  const depositCents = Math.min(Math.max(0, input.depositCents), totalCents);

  const dueNowCents =
    input.paymentMode === "invoice_later" ? 0
      : input.paymentMode === "full" ? totalCents
      : depositCents;

  return {
    subtotalCents,
    discountCents,
    oneTimeCents,
    totalCents,
    recurringCents: Math.max(0, input.recurringCents),
    depositCents,
    dueNowCents,
    balanceCents: Math.max(0, totalCents - dueNowCents),
  };
}

/** $399, $1,250.50 — the one formatter the proposal and its emails share. */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
