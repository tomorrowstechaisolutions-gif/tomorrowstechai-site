/**
 * The audit rule catalogue.
 *
 * Every rule here is decidable from the HTML the site actually served. There
 * is deliberately nothing in this file that needs Google, a rank tracker or a
 * paid API — this is the half of the SEO screen that works on day one.
 *
 * The prose lives here rather than in the database row, so re-wording an
 * issue does not mean rewriting history: a stored issue is a `code` plus the
 * specifics, and the sentence is looked up at render time.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type RuleCode =
  | "unreachable"
  | "noindex"
  | "missing_title"
  | "missing_description"
  | "title_too_long"
  | "title_too_short"
  | "description_too_long"
  | "description_too_short"
  | "duplicate_title"
  | "duplicate_description"
  | "missing_canonical"
  | "canonical_mismatch"
  | "missing_og_image"
  | "missing_h1"
  | "multiple_h1"
  | "thin_content"
  | "no_schema"
  | "slow_response";

export type Rule = {
  code: RuleCode;
  severity: Severity;
  /** What is wrong, in one line. */
  title: string;
  /** Why it matters — the sentence that justifies spending time on it. */
  why: string;
  /** What to do. Also what an AI proposal for this issue would be asked to do. */
  fix: string;
  /** Whether an AI proposal can plausibly draft the fix. */
  aiFixable: boolean;
};

/** Google truncates around here. Not a hard limit — a display budget. */
export const TITLE_MAX = 60;
export const TITLE_MIN = 25;
export const DESCRIPTION_MAX = 160;
export const DESCRIPTION_MIN = 70;
export const THIN_CONTENT_WORDS = 300;
export const SLOW_RESPONSE_MS = 1200;

export const RULES: Record<RuleCode, Rule> = {
  unreachable: {
    code: "unreachable",
    severity: "critical",
    title: "Page did not load",
    why: "A page in your sitemap that does not answer is a page Google will drop, and a link somewhere that goes nowhere.",
    fix: "Check the route still exists and the deployment is healthy.",
    aiFixable: false,
  },
  noindex: {
    code: "noindex",
    severity: "critical",
    title: "Page tells Google not to index it",
    why: "It is listed in your sitemap, so you are asking Google to crawl it and refusing to let it appear. One of the two is wrong.",
    fix: "Remove the noindex, or take the page out of the sitemap.",
    aiFixable: false,
  },
  missing_title: {
    code: "missing_title",
    severity: "critical",
    title: "No title tag",
    why: "The title is the clickable line in the search result. Without one Google writes its own, usually badly.",
    fix: "Add a title of 25-60 characters that leads with what the page is for.",
    aiFixable: true,
  },
  missing_description: {
    code: "missing_description",
    severity: "high",
    title: "No meta description",
    why: "Google falls back to scraping a sentence off the page. It is the free ad copy under your link and it is being written by a robot.",
    fix: "Add a description of 70-160 characters that gives someone a reason to click.",
    aiFixable: true,
  },
  title_too_long: {
    code: "title_too_long",
    severity: "medium",
    title: "Title will be cut off",
    why: "Past about 60 characters Google truncates with an ellipsis, and the end of your sentence never gets read.",
    fix: "Trim to 60 characters, keeping the important words first.",
    aiFixable: true,
  },
  title_too_short: {
    code: "title_too_short",
    severity: "low",
    title: "Title is very short",
    why: "There is room for more, and unused room is a keyword you did not rank for.",
    fix: "Extend toward 50-60 characters with the terms people actually search.",
    aiFixable: true,
  },
  description_too_long: {
    code: "description_too_long",
    severity: "medium",
    title: "Description will be cut off",
    why: "Past about 160 characters the rest is replaced with an ellipsis, so any call to action at the end is invisible.",
    fix: "Trim to 160 characters and move the reason to click to the front.",
    aiFixable: true,
  },
  description_too_short: {
    code: "description_too_short",
    severity: "low",
    title: "Description is very short",
    why: "A short description wastes the largest piece of copy you control in a search result.",
    fix: "Extend toward 140-160 characters.",
    aiFixable: true,
  },
  duplicate_title: {
    code: "duplicate_title",
    severity: "high",
    title: "Title is used on another page",
    why: "Two pages competing on the same title means Google picks one and buries the other, and you do not get to choose which.",
    fix: "Give each page a title describing what only that page does.",
    aiFixable: true,
  },
  duplicate_description: {
    code: "duplicate_description",
    severity: "high",
    title: "Description is used on another page",
    why: "It signals the two pages are the same, which is the argument for de-indexing one of them.",
    fix: "Write a description specific to this page.",
    aiFixable: true,
  },
  missing_canonical: {
    code: "missing_canonical",
    severity: "medium",
    title: "No canonical URL",
    why: "Without one, any URL that reaches this page — with tracking parameters, with or without a trailing slash — can be indexed as a separate page splitting the same ranking.",
    fix: "Add a self-referencing canonical.",
    aiFixable: true,
  },
  canonical_mismatch: {
    code: "canonical_mismatch",
    severity: "high",
    title: "Canonical points at a different page",
    why: "This page is telling Google the real version is somewhere else, so this one will not rank at all. Usually a copy-paste.",
    fix: "Point the canonical at this page, unless it genuinely is a duplicate.",
    aiFixable: true,
  },
  missing_og_image: {
    code: "missing_og_image",
    severity: "medium",
    title: "No social share image",
    why: "Shared in a message, on Facebook or on LinkedIn, this page appears as a grey box. It does not affect ranking; it affects whether anyone clicks.",
    fix: "Add an og:image, 1200x630.",
    aiFixable: false,
  },
  missing_h1: {
    code: "missing_h1",
    severity: "high",
    title: "No H1 heading",
    why: "The H1 is the strongest on-page signal of what a page is about, and the first thing a screen reader announces.",
    fix: "Add one H1 that states the subject of the page.",
    aiFixable: true,
  },
  multiple_h1: {
    code: "multiple_h1",
    severity: "low",
    title: "More than one H1",
    why: "Several competing top-level headings dilute the signal and make the page harder to navigate by keyboard.",
    fix: "Keep one H1 and demote the rest to H2.",
    aiFixable: true,
  },
  thin_content: {
    code: "thin_content",
    severity: "medium",
    title: "Very little text",
    why: "Under a few hundred words there is not enough for Google to understand the page, and not enough to answer the question that brought someone to it.",
    fix: "Add substance: what it is, who it is for, what it costs, what happens next.",
    aiFixable: true,
  },
  no_schema: {
    code: "no_schema",
    severity: "medium",
    title: "No structured data",
    why: "Schema is how a page earns the rich result — stars, FAQs, prices — instead of a plain blue link.",
    fix: "Add JSON-LD appropriate to the page: Service, FAQPage, Article, LocalBusiness.",
    aiFixable: true,
  },
  slow_response: {
    code: "slow_response",
    severity: "medium",
    title: "Slow to respond",
    why: "Server response time is the part of page speed you control outright, and it delays everything that follows it.",
    fix: "Check what the page does before it renders — a slow query, an uncached fetch.",
    aiFixable: false,
  },
};

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * The health score.
 *
 * Derived from the open issues on the latest run, never stored — the same
 * reasoning as client health. Fix a title and the number moves on the next
 * crawl rather than waiting for something to remember to recompute it.
 */
export function healthScore(issues: { severity: Severity }[]): number {
  const deducted = issues.reduce((total, i) => total + SEVERITY_WEIGHT[i.severity], 0);
  return Math.max(0, Math.min(100, 100 - deducted));
}

export function healthBand(score: number): {
  band: "excellent" | "good" | "average" | "poor";
  label: string;
} {
  if (score >= 90) return { band: "excellent", label: "Excellent" };
  if (score >= 75) return { band: "good", label: "Good" };
  if (score >= 50) return { band: "average", label: "Needs work" };
  return { band: "poor", label: "Poor" };
}
