import "server-only";

/**
 * Which leads arrived from organic search.
 *
 * This is the one search metric that is provable without Google: the lead
 * form records the referrer, and a referrer whose host is a search engine is
 * evidence, not an inference.
 *
 * Deliberately strict. A lead with no referrer and no UTMs is "direct or
 * unknown" — it might well be organic, and counting it would inflate the one
 * number on this screen that is actually trustworthy.
 */

const SEARCH_HOSTS = [
  "google.",
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.",
  "ecosia.org",
  "search.brave.com",
  "startpage.com",
  "qwant.com",
  "baidu.com",
  "yandex.",
];

export type LeadAttribution = "organic" | "paid" | "referral" | "direct";

export function attributionOf(lead: {
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  fbclid: string | null;
  gclid: string | null;
  source: string;
}): LeadAttribution {
  // A click ID or a paid medium settles it before the referrer is consulted:
  // an ad clicked from a Google search page still carries a google referrer.
  if (lead.gclid || lead.fbclid) return "paid";
  const medium = (lead.utm_medium ?? "").toLowerCase();
  if (["cpc", "ppc", "paid", "paidsocial", "paid_social", "display"].includes(medium)) return "paid";
  if (lead.utm_source && medium && medium !== "organic") return "paid";

  if (!lead.referrer) return "direct";

  let host = "";
  try {
    host = new URL(lead.referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }

  if (SEARCH_HOSTS.some((h) => host.includes(h))) return "organic";

  // Our own pages referring to each other is not a referral.
  if (host.includes("tomorrowstechai.com")) return "direct";

  return "referral";
}

export function isOrganic(lead: Parameters<typeof attributionOf>[0]): boolean {
  return attributionOf(lead) === "organic";
}
