/**
 * Pricing, computed in one place and never in the browser.
 *
 * A proposal quotes a price. It does not collect one — there is no card, no
 * deposit and no "due today" anywhere in this module. Signing is agreement;
 * money is asked for on the invoice that follows the work. That split is
 * deliberate and it is why the deposit/due-now arithmetic that used to live
 * here is gone rather than merely switched off.
 *
 * The stored `deposit_amount_cents` and `payment_mode` columns survive on the
 * table for the rows that predate the change. Nothing reads them.
 */

import type { ProposalItem } from "./types";

export type PriceBreakdown = {
  /** Billable, non-optional lines, before any discount. */
  subtotalCents: number;
  discountCents: number;
  /** subtotal − discount, floored at zero. */
  oneTimeCents: number;
  totalCents: number;
  recurringCents: number;
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

  return {
    subtotalCents,
    discountCents,
    oneTimeCents,
    totalCents: oneTimeCents,
    recurringCents: Math.max(0, input.recurringCents),
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
