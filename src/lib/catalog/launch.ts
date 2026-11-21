import { CODE_PRICED_OFFERS, findPriceDrift, type CodePricedOffer, type PriceDrift } from "./price-drift";

/**
 * Launch pricing.
 *
 * The ad-funnel offers are priced in code (see price-drift): the campaign
 * pages, the checkout, the proposal templates and the chatbot all charge and
 * advertise that number. The catalog now carries the regular, list price.
 * When the list price is higher than what the code charges, the offer is on
 * a launch price: the site keeps charging and showing the code price, and
 * shows the list price beside it as the regular price.
 *
 * So the catalog price of one of these offers is never what a visitor pays.
 * Raising it changes the "regular price" line and nothing else.
 */

/** Shown wherever a launch price is. A public promise: change the number here when the offer changes. */
export const LAUNCH_NOTE = "Launch price for our first 10 clients";

export type LaunchPrice = { chargeCents: number; listCents: number };

/** What is charged and what is listed, when this offer is on a launch price. Null when it is not. */
export function launchPrice(
  slug: string | null | undefined,
  catalogCents: number | null | undefined,
  offers: readonly CodePricedOffer[] = CODE_PRICED_OFFERS
): LaunchPrice | null {
  if (!slug || typeof catalogCents !== "number") return null;
  const offer = offers.find((o) => o.slug === slug);
  if (!offer || offer.codeCents >= catalogCents) return null;
  return { chargeCents: offer.codeCents, listCents: catalogCents };
}

type Row = { slug: string | null; from_cents: number | null };

/** Offers whose catalog price is above what is charged: launch offers, working as intended. */
export function launchOffers(rows: readonly Row[]): PriceDrift[] {
  return findPriceDrift(rows).filter((d) => d.catalogCents > d.codeCents);
}

/** Offers whose catalog price is below what is charged: the card promises less than the checkout takes. */
export function realDrift(rows: readonly Row[]): PriceDrift[] {
  return findPriceDrift(rows).filter((d) => d.catalogCents < d.codeCents);
}

/**
 * How a service's price is shown to members and the public.
 *
 * A service with no price, or one billed by quote, is a custom quote. With a
 * price it is "fixed" unless "starting at" was chosen. Without this, a price
 * saved on a quote-only service stayed hidden behind "Custom quote".
 */
export function pricingModeFor(billingType: string, priceCents: number, chosen: string): "fixed" | "starting_at" | "custom_quote" {
  if (billingType === "custom_quote" || !(priceCents > 0)) return "custom_quote";
  return chosen === "starting_at" ? "starting_at" : "fixed";
}
