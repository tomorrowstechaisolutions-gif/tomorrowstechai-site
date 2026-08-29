/**
 * Ad Studio helpers — Meta's field limits, the tracked destination URL, and
 * the small vocabulary the admin screens share.
 *
 * The limits matter: John shipped a 27-character headline into a 25-character
 * field and Ads Manager silently flagged it. The counters in the UI come from
 * here so that can't happen again.
 */

export const AD_STATUSES = ["draft", "ready", "live", "paused", "archived"] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

export const AD_FORMATS = [
  { key: "feed_4x5", label: "Feed 4:5 (1080×1350)", note: "Takes the most room in a phone feed. Default." },
  { key: "feed_1x1", label: "Feed 1:1 (1080×1080)", note: "Safe everywhere, smaller on mobile." },
  { key: "story_9x16", label: "Story 9:16 (1080×1920)", note: "Keep text out of the top and bottom 14%." },
  { key: "reel_9x16", label: "Reel 9:16 (1080×1920)", note: "Video placements." },
  { key: "other", label: "Other", note: "" },
] as const;

export type AdFormat = (typeof AD_FORMATS)[number]["key"];

/** Meta's standard call-to-action buttons for a website traffic / leads ad. */
export const CTA_LABELS = [
  "Learn More",
  "Get Quote",
  "Sign Up",
  "Book Now",
  "Contact Us",
  "Get Offer",
  "Send Message",
  "Apply Now",
  "Subscribe",
] as const;

/**
 * Meta's limits, and the softer numbers that actually matter.
 * `truncatesAt` is where the field gets cut off or hidden behind "See more"
 * on a phone — well before the hard limit in most cases.
 */
export const AD_LIMITS = {
  primary_text: { max: 2200, truncatesAt: 125, label: "Primary text" },
  headline: { max: 255, truncatesAt: 25, label: "Headline" },
  description: { max: 255, truncatesAt: 30, label: "Description" },
} as const;

export type AdField = keyof typeof AD_LIMITS;

export type FieldState = {
  count: number;
  tone: "ok" | "warn" | "over";
  hint: string;
};

/**
 * Grades a field by the number that matters — where it visually truncates —
 * rather than the hard limit, which almost nobody hits.
 */
export function gradeField(field: AdField, value: string): FieldState {
  const { max, truncatesAt, label } = AD_LIMITS[field];
  const count = value.length;

  if (count > max) {
    return { count, tone: "over", hint: `Over Meta's ${max} limit — this will be rejected.` };
  }
  if (count > truncatesAt) {
    const overBy = count - truncatesAt;
    return {
      count,
      tone: "warn",
      hint:
        field === "primary_text"
          ? `${overBy} characters past the "See more" fold. Everything important should be in the first ${truncatesAt}.`
          : `${overBy} over ${truncatesAt} — ${label.toLowerCase()} will be clipped on most placements.`,
    };
  }
  return { count, tone: "ok", hint: `Fits. ${truncatesAt - count} to spare.` };
}

const DEFAULT_ORIGIN = "https://www.tomorrowstechai.com";

/**
 * Builds the destination URL.
 *
 * The `{{...}}` values are Meta's own dynamic placeholders — Meta substitutes
 * the real ad set, ad and placement at delivery time. That is what lets the
 * campaign dashboard report cost per lead per ad instead of lumping every
 * click under "facebook".
 *
 * utm_term carries {{ad.name}}, which is why the ad's `name` here must match
 * the ad's name in Ads Manager exactly.
 */
export function buildDestinationUrl(opts: {
  path?: string;
  campaign?: string;
  origin?: string;
  /** Swap Meta's placeholders for real values — used for the preview link. */
  resolved?: { adset?: string; ad?: string; placement?: string };
}): string {
  const origin = (opts.origin ?? DEFAULT_ORIGIN).replace(/\/+$/, "");
  const path = `/${(opts.path ?? "/business-launch").replace(/^\/+/, "")}`;

  const campaignSlug = slugifyCampaign(opts.campaign ?? "$399 Business Launch");

  const params = new URLSearchParams({
    utm_source: "facebook",
    utm_medium: "paid_social",
    utm_campaign: campaignSlug,
  });

  // URLSearchParams would percent-encode the braces, and Meta needs them raw.
  const dynamic = [
    `utm_content=${opts.resolved?.adset ?? "{{adset.name}}"}`,
    `utm_term=${opts.resolved?.ad ?? "{{ad.name}}"}`,
    `placement=${opts.resolved?.placement ?? "{{placement}}"}`,
  ].join("&");

  return `${origin}${path}?${params.toString()}&${dynamic}`;
}

/** "$399 Business Launch" -> "business-launch-399" */
export function slugifyCampaign(campaign: string): string {
  const digits = campaign.match(/\d+/)?.[0];
  const words = campaign
    .replace(/[$\d]/g, " ")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join("-");
  return digits ? `${words}-${digits}` : words || "campaign";
}

export const STATUS_TONE: Record<AdStatus, "live" | "ready" | "muted"> = {
  draft: "muted",
  ready: "ready",
  live: "live",
  paused: "muted",
  archived: "muted",
};
