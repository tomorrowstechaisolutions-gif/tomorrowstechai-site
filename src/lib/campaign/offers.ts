/**
 * The campaign landing pages share one lead form, one tracking component and
 * one API route. Without this registry each of them would hardcode "$399
 * Business Launch" — which is exactly what they did until the $149 Starter
 * page needed the same machinery, and it would have reported every Starter
 * lead to Meta as a $399 conversion.
 */

import { CAMPAIGN_ID, CAMPAIGN_NAME, OFFER_PRICE } from "./config";
import { STARTER_CAMPAIGN_ID, STARTER_CAMPAIGN_NAME, STARTER_PRICE } from "./starter";
import { PRO_CAMPAIGN_ID, PRO_CAMPAIGN_NAME, PRO_PRICE } from "./professional";
import { ECOM_CAMPAIGN_ID, ECOM_CAMPAIGN_NAME, ECOM_PRICE } from "./ecommerce";

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
