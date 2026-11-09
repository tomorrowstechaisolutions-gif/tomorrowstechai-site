/**
 * Field Notes → CRM attribution. Pure functions only (no I/O), shared by the
 * article CTAs, the /contact page and /api/contact, and unit-tested with mock
 * data. See docs/field-notes-crm-tracking-plan.md.
 *
 * Only people who submit the contact form become CRM records. Anonymous
 * reading activity never reaches this code.
 */

export const CTA_POSITIONS = ["rail", "inline", "end", "body"] as const;
export type CtaPosition = (typeof CTA_POSITIONS)[number];

const ARTICLE_PATH = /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SERVICE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX = 300;

/** Link from an article to the contact form, tagged with where it came from. */
export function articleContactHref(service: string, articlePath: string, cta: CtaPosition): string {
  const q = new URLSearchParams({ service, from: articlePath, cta });
  return `/contact?${q.toString()}`;
}

/** Accepts only a real Field Notes article path, e.g. "/blog/my-post". */
export function cleanArticlePath(value: unknown): string | null {
  return typeof value === "string" && ARTICLE_PATH.test(value) ? value : null;
}

export function cleanCta(value: unknown): CtaPosition | null {
  return typeof value === "string" && (CTA_POSITIONS as readonly string[]).includes(value)
    ? (value as CtaPosition)
    : null;
}

export function cleanService(value: unknown): string | null {
  return typeof value === "string" && value.length <= 80 && SERVICE.test(value) ? value : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Strip control characters, trim, cap length.
  const v = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX);
  return v.length ? v : null;
}

/** A same-site path only: no scheme, no protocol-relative "//host". */
function cleanPath(value: unknown): string | null {
  const v = cleanText(value);
  return v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : null;
}

function cleanUrl(value: unknown): string | null {
  const v = cleanText(value);
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, MAX) : null;
  } catch {
    return null;
  }
}

/** The campaign fields the browser may send; everything else is ignored. */
export type LeadAttribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  referrer: string | null;
  /** First page of the visit (from the session attribution store). */
  session_landing_page: string | null;
};

export function sanitizeAttribution(raw: unknown): LeadAttribution {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    utm_source: cleanText(r.utm_source),
    utm_medium: cleanText(r.utm_medium),
    utm_campaign: cleanText(r.utm_campaign),
    utm_content: cleanText(r.utm_content),
    utm_term: cleanText(r.utm_term),
    fbclid: cleanText(r.fbclid),
    gclid: cleanText(r.gclid),
    referrer: cleanUrl(r.referrer),
    session_landing_page: cleanPath(r.landing_page),
  };
}

/**
 * What the /contact page tells the form about where the visitor came from.
 * `sourcePage` is the article when a valid one is given, else the default.
 */
export function resolveSourcePage(
  params: { from?: unknown; cta?: unknown },
  fallback: string
): { sourcePage: string; cta: CtaPosition | null; fromArticle: boolean } {
  const article = cleanArticlePath(params.from);
  return {
    sourcePage: article ?? fallback,
    cta: article ? cleanCta(params.cta) : null,
    fromArticle: article !== null,
  };
}

type OfferIn = {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  category?: unknown;
  price?: unknown;
  sourcePage?: unknown;
  cta?: unknown;
} | null | undefined;

/**
 * Turns a contact submission into the lead fields and the lead-event meta
 * written by /api/contact. Existing behaviour for non-article inquiries is
 * unchanged: landing_page stays the offer's source page (default /contact)
 * and campaign stays the offer name; campaign UTMs fill their own columns.
 */
export function buildContactLeadFields(offer: OfferIn, attributionRaw: unknown) {
  const a = sanitizeAttribution(attributionRaw);
  const offerSource = cleanPath(offer?.sourcePage);
  const article = cleanArticlePath(offerSource);
  const cta = article ? cleanCta(offer?.cta) : null;

  const lead = {
    landing_page: offerSource ?? "/contact",
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    utm_content: a.utm_content,
    utm_term: a.utm_term,
    fbclid: a.fbclid,
    gclid: a.gclid,
    referrer: a.referrer,
  };

  const eventMeta = {
    source_page: offerSource ?? "/contact",
    source_article: article,
    cta,
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    session_landing_page: a.session_landing_page,
  };

  return { lead, eventMeta };
}
