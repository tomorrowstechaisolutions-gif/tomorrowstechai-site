import { HOSTING_FROM_CENTS, OFFER_PRICE_CENTS } from "@/lib/campaign/config";
import { STARTER_PRICE_CENTS } from "@/lib/campaign/starter";
import { PRO_PRICE_CENTS } from "@/lib/campaign/professional";
import { ECOM_PRICE_CENTS } from "@/lib/campaign/ecommerce";

/**
 * The offers whose price is fixed in code as well as in the catalog.
 *
 * The catalog (catalog_items.from_cents) prices the public cards and the
 * service picker on proposals and invoices. But the ad-funnel packages are
 * also priced in code: the campaign pages, the Stripe checkout link, the
 * proposal templates and the chatbot all read the constants below, because
 * the price is part of the advertised offer itself ("$399 Business Launch",
 * the ttai_business_launch_399 Stripe price).
 *
 * So editing one of these in the admin changes the card and nothing else.
 * Until checkout reads the catalog, this list is how the admin says so out
 * loud instead of letting the card and the charge quietly disagree.
 */
export type CodePricedOffer = {
  /** catalog_items.slug */
  slug: string;
  label: string;
  /** What the code charges and advertises, in cents. */
  codeCents: number;
  /** Where the code price is used, for the warning text. */
  usedBy: string;
};

export const CODE_PRICED_OFFERS: CodePricedOffer[] = [
  {
    slug: "website-starter",
    label: "Starter Website",
    codeCents: STARTER_PRICE_CENTS,
    usedBy: "the /starter-website page, the Starter proposal template and the chatbot",
  },
  {
    slug: "website-classic",
    label: "Classic Business Website",
    codeCents: OFFER_PRICE_CENTS,
    usedBy: "the /business-launch page, the Stripe checkout link, the Classic proposal template and the chatbot",
  },
  {
    slug: "website-professional",
    label: "Professional Business Website",
    codeCents: PRO_PRICE_CENTS,
    usedBy: "the /professional-website page, the Professional proposal template and the chatbot",
  },
  {
    slug: "website-ecommerce",
    label: "E-Commerce Website",
    codeCents: ECOM_PRICE_CENTS,
    usedBy: "the /ecommerce-website page, the E-Commerce proposal template and the chatbot",
  },
  {
    slug: "managed-hosting",
    label: "Managed Hosting",
    codeCents: HOSTING_FROM_CENTS,
    usedBy: "the hosting subscription Stripe starts with a website package, and every campaign page",
  },
];

export type PriceDrift = CodePricedOffer & { catalogCents: number };

/**
 * Catalog rows whose price no longer matches what the code charges.
 *
 * A slug missing from `rows` is not drift: the row may be archived or the
 * query filtered. Only a row that exists with a different number is reported.
 */
export function findPriceDrift(
  rows: readonly { slug: string | null; from_cents: number | null }[],
  offers: readonly CodePricedOffer[] = CODE_PRICED_OFFERS
): PriceDrift[] {
  const bySlug = new Map<string, number>();
  for (const row of rows) {
    if (row.slug && typeof row.from_cents === "number") bySlug.set(row.slug, row.from_cents);
  }
  const drift: PriceDrift[] = [];
  for (const offer of offers) {
    const catalogCents = bySlug.get(offer.slug);
    if (catalogCents !== undefined && catalogCents !== offer.codeCents) {
      drift.push({ ...offer, catalogCents });
    }
  }
  return drift;
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
