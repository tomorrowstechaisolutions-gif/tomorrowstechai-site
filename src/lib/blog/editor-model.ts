import { DEFAULT_AUTHOR_ID, isCategorySlug } from "./taxonomy";
import type { ArticleRecord, ArticleStatus } from "./types";
import { validateArticles, type Issue } from "./validate";

/**
 * The Blog tab editor's rules, shared by the browser (live checklist) and the
 * server actions (the checks that actually gate a save or a publish). No
 * server-only imports here.
 */

/** What the editor edits: an ArticleRecord whose publishedAt may still be empty on a draft. */
export type EditableArticle = ArticleRecord;

export const LIVE_STATUSES: ArticleStatus[] = ["published", "scheduled"];

export function isLive(status: ArticleStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

/** The slug is the URL; once readers can reach it, it never changes. */
export function slugLocked(status: ArticleStatus): boolean {
  return status !== "draft";
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Today's calendar date in Central time, as YYYY-MM-DD. Never ahead of the UTC date. */
export function todayCentral(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function blankArticle(): EditableArticle {
  return {
    slug: "",
    title: "",
    summary: "",
    body: "",
    status: "draft",
    publishedAt: "",
    category: "ai-news",
    tags: [],
    authorId: DEFAULT_AUTHOR_ID,
    sources: [],
    specs: [],
    discrepancies: [],
    featured: false,
    origin: "database",
  };
}

const trimOr = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : undefined;
};

/**
 * Tidy a record before it is checked or saved: trim text, drop empty optional
 * fields, and leave out blocks (hero, SEO, CTA) that were left blank.
 */
export function normalize(a: EditableArticle): EditableArticle {
  const out: EditableArticle = {
    slug: a.slug.trim(),
    title: a.title.trim(),
    summary: a.summary.trim(),
    body: a.body.replace(/\r\n/g, "\n").replace(/\s+$/, "") + (a.body.trim() ? "\n" : ""),
    status: a.status,
    publishedAt: a.publishedAt.trim(),
    category: a.category,
    tags: [...new Set(a.tags.map((t) => t.trim()).filter(Boolean))],
    featured: Boolean(a.featured),
    origin: "database",
  };
  if (a.legacy) out.legacy = true;
  const updated = trimOr(a.updatedAt);
  if (updated) out.updatedAt = updated;
  const secondary = (a.secondaryCategories ?? []).filter((c) => c !== a.category && isCategorySlug(c));
  if (secondary.length) out.secondaryCategories = [...new Set(secondary)];
  if (a.authorId && a.authorId !== DEFAULT_AUTHOR_ID) out.authorId = a.authorId;
  const readTime = trimOr(a.readTime);
  if (readTime) out.readTime = readTime;

  if (a.hero && a.hero.src.trim()) {
    const hero: NonNullable<EditableArticle["hero"]> = { src: a.hero.src.trim(), alt: a.hero.alt.trim() };
    const credit = trimOr(a.hero.credit);
    const creditUrl = trimOr(a.hero.creditUrl);
    const caption = trimOr(a.hero.caption);
    if (credit) hero.credit = credit;
    if (creditUrl) hero.creditUrl = creditUrl;
    if (caption) hero.caption = caption;
    out.hero = hero;
  }

  const sources = (a.sources ?? [])
    .map((s) => {
      const src: NonNullable<EditableArticle["sources"]>[number] = {
        id: s.id.trim(),
        title: s.title.trim(),
        publisher: s.publisher.trim(),
        kind: s.kind,
      };
      for (const k of ["url", "author", "publishedAt", "accessedAt", "note"] as const) {
        const v = trimOr(s[k]);
        if (v) src[k] = v;
      }
      return src;
    })
    .filter((s) => s.id || s.title || s.publisher || s.url);
  if (sources.length) out.sources = sources;

  const specs = (a.specs ?? [])
    .map((s) => {
      const spec: NonNullable<EditableArticle["specs"]>[number] = {
        label: s.label.trim(),
        value: s.value.trim(),
        sourceIds: s.sourceIds.map((x) => x.trim()).filter(Boolean),
        verified: Boolean(s.verified),
      };
      const note = trimOr(s.note);
      if (note) spec.note = note;
      return spec;
    })
    .filter((s) => s.label || s.value);
  if (specs.length) out.specs = specs;

  const discrepancies = (a.discrepancies ?? [])
    .map((d) => {
      const disc: NonNullable<EditableArticle["discrepancies"]>[number] = {
        topic: d.topic.trim(),
        accounts: d.accounts
          .map((x) => ({ sourceId: x.sourceId.trim(), claim: x.claim.trim() }))
          .filter((x) => x.sourceId || x.claim),
      };
      const resolution = trimOr(d.resolution);
      if (resolution) disc.resolution = resolution;
      return disc;
    })
    .filter((d) => d.topic || d.accounts.length);
  if (discrepancies.length) out.discrepancies = discrepancies;

  const seo: NonNullable<EditableArticle["seo"]> = {};
  const seoTitle = trimOr(a.seo?.title);
  const seoDesc = trimOr(a.seo?.description);
  const canonical = trimOr(a.seo?.canonical);
  if (seoTitle) seo.title = seoTitle;
  if (seoDesc) seo.description = seoDesc;
  if (canonical) seo.canonical = canonical;
  if (Object.keys(seo).length) out.seo = seo;

  if (a.cta && (a.cta.service.trim() || a.cta.label.trim() || a.cta.blurb.trim())) {
    out.cta = { service: a.cta.service.trim(), label: a.cta.label.trim(), blurb: a.cta.blurb.trim() };
  }
  return out;
}

/**
 * The editorial checks for an article as it would be once live. A draft with
 * no date yet is checked as if published today.
 */
export function checkArticle(a: EditableArticle, asStatus: ArticleStatus = a.status): Issue[] {
  const n = normalize(a);
  return validateArticles([{ ...n, status: asStatus, publishedAt: n.publishedAt || todayCentral() }]);
}

/** The minimum any save needs, even a rough draft. Returns a message, or null when fine. */
export function saveBlocker(a: EditableArticle): string | null {
  const n = normalize(a);
  if (!n.title) return "Give the article a title first.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n.slug)) return "The URL slug must be lowercase words joined by hyphens.";
  if (!isCategorySlug(n.category)) return "Pick a section.";
  if (n.publishedAt && Number.isNaN(Date.parse(n.publishedAt))) return "The publish date isn't a valid date.";
  return null;
}

/** Character budgets search engines show. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESC_MAX = 160;
