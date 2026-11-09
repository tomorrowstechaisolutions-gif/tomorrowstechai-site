/**
 * Field Notes — the article contract.
 *
 * `ArticleRecord` is the one shape every content provider hands to the blog.
 * Today the only provider reads src/content/posts.ts. When the Admin Center
 * learns to publish, a second provider will map approved Content Studio rows
 * (content_items, content_type = 'blog') onto this same shape, so the pages,
 * feed, sitemap and structured data never need to know where a post came from.
 * See docs/field-notes-content-architecture.md.
 */

export type ArticleStatus = "draft" | "scheduled" | "published" | "archived";

export type CategorySlug =
  | "ai-news"
  | "hardware"
  | "private-ai"
  | "business-automation"
  | "technology-guides"
  | "industry-insights";

/** How close a source is to the facts it supports. */
export type SourceKind = "primary" | "secondary" | "vendor" | "dataset" | "other";

export type ArticleSource = {
  /** Stable id, cited in the body as [^id]. Lowercase letters, digits, hyphens. */
  id: string;
  title: string;
  publisher: string;
  url?: string;
  author?: string;
  /** ISO date (YYYY-MM-DD) the source itself was published. */
  publishedAt?: string;
  /** ISO date we last checked it. Required for web sources that can change. */
  accessedAt?: string;
  kind: SourceKind;
  note?: string;
};

export type ArticleImage = {
  /** Path under /public or an allow-listed https URL. */
  src: string;
  /** Describes what the image shows. Never just the headline. */
  alt: string;
  /** Who made or owns it, e.g. "Illustration: Tomorrow's Tech AI". */
  credit?: string;
  creditUrl?: string;
  caption?: string;
};

/**
 * A technical figure the article states. `verified` means an editor checked it
 * against every listed source; unverified specs must be presented as reported
 * claims, never as fact.
 */
export type TechSpec = {
  label: string;
  value: string;
  sourceIds: string[];
  verified: boolean;
  note?: string;
};

/** Sources that disagree. Shown to readers instead of picking a side silently. */
export type Discrepancy = {
  topic: string;
  accounts: { sourceId: string; claim: string }[];
  /** What we concluded and why, if anything. Absent means unresolved. */
  resolution?: string;
};

export type ArticleCta = {
  /** Passed to /contact?service=. Lowercase words joined by hyphens. */
  service: string;
  label: string;
  blurb: string;
};

export type ArticleSeo = {
  title?: string;
  description?: string;
  /** Absolute URL. Only for syndicated pieces; defaults to the article's own URL. */
  canonical?: string;
};

/** What a provider supplies. Everything the pages need is derived from this. */
export type ArticleRecord = {
  slug: string;
  title: string;
  /** One- or two-sentence dek. Also the meta description unless seo overrides it. */
  summary: string;
  /** Field Notes Markdown. See src/lib/blog/markdown.tsx for the supported syntax. */
  body: string;
  status: ArticleStatus;
  /** ISO date or datetime. A published article dated in the future stays hidden. */
  publishedAt: string;
  /** ISO date or datetime of the last meaningful edit. */
  updatedAt?: string;
  category: CategorySlug;
  secondaryCategories?: CategorySlug[];
  tags: string[];
  /** Key into AUTHORS. Defaults to the editorial team. */
  authorId?: string;
  hero?: ArticleImage;
  sources?: ArticleSource[];
  specs?: TechSpec[];
  discrepancies?: Discrepancy[];
  /** Candidate for the lead slot on the blog front page. */
  featured?: boolean;
  seo?: ArticleSeo;
  /**
   * Overrides the category's service call to action for this article (rail,
   * mid-article and end). Same shape as CategoryInfo["cta"].
   */
  cta?: ArticleCta;
  /** Hand-set label, e.g. "6 min read". Computed from the body when absent. */
  readTime?: string;
  /**
   * Published before the Field Notes editorial standards. Missing credits and
   * sources are reported as warnings instead of failing the build.
   */
  legacy?: boolean;
  /** Where the record came from. */
  origin: "file" | "content-studio";
};

export type Author = {
  id: string;
  name: string;
  kind: "Person" | "Organization";
  role?: string;
  url?: string;
  /** Only text the owner has approved. Null until then. */
  bio: string | null;
};

export type CategoryInfo = {
  slug: CategorySlug;
  name: string;
  description: string;
  /** schema.org type for articles whose primary category this is. */
  schemaType: "Article" | "NewsArticle" | "TechArticle";
  /** Hardware and news pieces state facts that need sources. */
  requiresSources: boolean;
  cta: {
    /** Passed to /contact?service= so the CRM lead records the interest. */
    service: string;
    label: string;
    blurb: string;
  };
};

/** A record after defaults and derived fields are applied. */
export type Article = ArticleRecord & {
  url: string;
  path: string;
  author: Author;
  categoryInfo: CategoryInfo;
  /** e.g. "May 20, 2026" — formatted in UTC so builds never shift a day. */
  displayDate: string;
  displayUpdated: string | null;
  readTimeLabel: string;
  wordCount: number;
  /** updatedAt when present, otherwise publishedAt. */
  modifiedAt: string;
};
