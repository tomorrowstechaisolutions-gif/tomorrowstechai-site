/**
 * The campaign landing pages share one lead form, one tracking component and
 * one API route. Without this registry each of them would hardcode "$399
 * Business Launch" — which is exactly what they did until the $149 Starter
 * page needed the same machinery, and it would have reported every Starter
 * lead to Meta as a $399 conversion.
 */

import { slugifyCampaign } from "./ads";
import {
  CAMPAIGN_ID,
  CAMPAIGN_NAME,
  HOSTING_DISCLOSURE,
  HOSTING_FROM,
  OFFER_PRICE,
  TURNAROUND_DAYS,
} from "./config";
import {
  STARTER_CAMPAIGN_ID,
  STARTER_CAMPAIGN_NAME,
  STARTER_HOSTING,
  STARTER_HOSTING_DISCLOSURE,
  STARTER_PRICE,
  STARTER_TURNAROUND_DAYS,
} from "./starter";
import {
  PRO_CAMPAIGN_ID,
  PRO_CAMPAIGN_NAME,
  PRO_HOSTING,
  PRO_HOSTING_DISCLOSURE,
  PRO_PRICE,
  PRO_TURNAROUND,
} from "./professional";
import {
  ECOM_CAMPAIGN_ID,
  ECOM_CAMPAIGN_NAME,
  ECOM_HOSTING,
  ECOM_HOSTING_DISCLOSURE,
  ECOM_PRICE,
  ECOM_TURNAROUND,
} from "./ecommerce";

export type Offer = {
  id: string;
  name: string;
  price: number;
  currency: string;
  /** Where the form sends them once the lead is in. */
  thankYouPath: string;
  /** GA4 event names. Meta's are shared; GA's are per campaign by convention. */
  gaViewEvent: string;
  gaLeadEvent: string;
  gaContactEvent: string;
  /** The monthly after launch. Same $29 today, but read it from the package. */
  hosting: number;
  /** What that $29 actually buys -- NOT the same sentence on every tier. */
  hostingDisclosure: string;
  /** Human turnaround phrase, or null where it is deliberately unstated. */
  turnaround: string | null;
};

export const BUSINESS_LAUNCH_OFFER: Offer = {
  id: CAMPAIGN_ID,
  name: CAMPAIGN_NAME,
  price: OFFER_PRICE,
  currency: "USD",
  thankYouPath: "/business-launch/thank-you",
  gaViewEvent: "business_launch_view",
  gaLeadEvent: "business_launch_lead",
  gaContactEvent: "business_launch_contact",
  hosting: HOSTING_FROM,
  hostingDisclosure: HOSTING_DISCLOSURE,
  turnaround: `${TURNAROUND_DAYS} days`,
};

export const STARTER_OFFER: Offer = {
  id: STARTER_CAMPAIGN_ID,
  name: STARTER_CAMPAIGN_NAME,
  price: STARTER_PRICE,
  currency: "USD",
  thankYouPath: "/starter-website/thank-you",
  gaViewEvent: "starter_website_view",
  gaLeadEvent: "starter_website_lead",
  gaContactEvent: "starter_website_contact",
  hosting: STARTER_HOSTING,
  hostingDisclosure: STARTER_HOSTING_DISCLOSURE,
  turnaround: `${STARTER_TURNAROUND_DAYS} business days`,
};

export const PROFESSIONAL_OFFER: Offer = {
  id: PRO_CAMPAIGN_ID,
  name: PRO_CAMPAIGN_NAME,
  price: PRO_PRICE,
  currency: "USD",
  thankYouPath: "/professional-website/thank-you",
  gaViewEvent: "professional_website_view",
  gaLeadEvent: "professional_website_lead",
  gaContactEvent: "professional_website_contact",
  hosting: PRO_HOSTING,
  hostingDisclosure: PRO_HOSTING_DISCLOSURE,
  turnaround: PRO_TURNAROUND,
};

export const ECOMMERCE_OFFER: Offer = {
  id: ECOM_CAMPAIGN_ID,
  name: ECOM_CAMPAIGN_NAME,
  price: ECOM_PRICE,
  currency: "USD",
  thankYouPath: "/ecommerce-website/thank-you",
  gaViewEvent: "ecommerce_website_view",
  gaLeadEvent: "ecommerce_website_lead",
  gaContactEvent: "ecommerce_website_contact",
  hosting: ECOM_HOSTING,
  hostingDisclosure: ECOM_HOSTING_DISCLOSURE,
  turnaround: ECOM_TURNAROUND,
};

export const OFFERS: Offer[] = [
  BUSINESS_LAUNCH_OFFER,
  STARTER_OFFER,
  PROFESSIONAL_OFFER,
  ECOMMERCE_OFFER,
];

/**
 * Resolves what the visitor's form said they were looking at. Falls back to
 * Business Launch because that is where every historical lead came from, and a
 * lead with the wrong campaign is better than a lead that fails to save.
 */
export function offerByName(name: string | null | undefined): Offer {
  return OFFERS.find((o) => o.name === name) ?? BUSINESS_LAUNCH_OFFER;
}

/**
 * Resolves the offer from the free text Meta hands back with a lead -- the
 * campaign, ad set and ad names.
 *
 * A Meta Instant Form lead never touches a landing page, so there is no
 * `offer_name` in a request body to read. The ad's own name is the only signal
 * that exists, which is why the campaign must be named after the offer:
 * `slugifyCampaign("$149 Starter Website")` -> "starter-website-149".
 *
 * Checked most specific first -- the full slug, then the campaign id, then a
 * bare price -- so an ad called "starter-website-149" can never be read as the
 * $399 offer just because it also mentions a number.
 */
export function offerFromAdNames(
  ...names: (string | null | undefined)[]
): Offer {
  const hay = names.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return BUSINESS_LAUNCH_OFFER;

  return (
    OFFERS.find((o) => hay.includes(slugifyCampaign(o.name))) ??
    OFFERS.find((o) => hay.includes(o.id)) ??
    OFFERS.find((o) => hay.includes(String(o.price))) ??
    BUSINESS_LAUNCH_OFFER
  );
}
