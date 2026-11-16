import { unstable_cache } from "next/cache";
import { cache as requestCache } from "react";
import { fileArticles } from "@/content/posts";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { ARTICLE_COLUMNS, ARTICLES_TABLE, FIELD_NOTES_TAG, rowToRecord, type ArticleRow } from "./db-articles";
import { countWords } from "./markdown";
import { getAuthor, getCategory, SITE_URL } from "./taxonomy";
import type { Article, ArticleRecord, CategorySlug } from "./types";
import { enforce, validateArticles } from "./validate";

/**
 * The only way pages, the feed and the sitemap read articles.
 *
 * Two sources:
 * - The TypeScript file (src/content/posts.ts): checked strictly at build, so
 *   an error there still stops the build, as before.
 * - The database (Admin Center Blog tab): each article is checked on its own.
 *   One that fails is skipped and logged, never rendered, so a bad save can't
 *   take the blog down. A database article replaces a file article with the
 *   same slug, which is how imported articles take over.
 *
 * Database reads are cached under the "field-notes" tag for five minutes;
 * publishing revalidates the tag so changes show at once. If the database is
 * unreachable, the file articles still render.
 */

const fileRecords = (): ArticleRecord[] => fileArticles.map((a) => ({ ...a, origin: "file" as const }));

const loadDbRecords = unstable_cache(
  async (): Promise<ArticleRecord[]> => {
    if (!supabaseConfigured()) return [];
    const { data, error } = await supabaseAdmin()
      .from(ARTICLES_TABLE)
      .select(ARTICLE_COLUMNS)
      .in("status", ["published", "scheduled", "archived"]);
    if (error) {
      // A missing table (migration not applied yet) or an outage: serve the
      // file articles rather than failing the page.
      console.warn(`[field-notes] database articles unavailable: ${error.message}`);
      return [];
    }
    return ((data ?? []) as ArticleRow[]).map(rowToRecord);
  },
  ["field-notes-db-articles"],
  { tags: [FIELD_NOTES_TAG], revalidate: 300 }
);

/** Database records that pass the editorial checks; failures are reported and dropped. */
function vetted(records: ArticleRecord[]): ArticleRecord[] {
  return records.filter((r) => {
    const errors = validateArticles([r]).filter((i) => i.level === "error");
    if (errors.length) {
      console.warn(
        `[field-notes] skipping "${r.slug}": ${errors.map((e) => e.message).join("; ")}`
      );
      return false;
    }
    return true;
  });
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Date-only ISO strings are calendar dates; format them in UTC so no build shifts a day. */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

function resolve(r: ArticleRecord): Article {
  const words = countWords(r.body);
  const modifiedAt = r.updatedAt ?? r.publishedAt;
  return {
    ...r,
    path: `/blog/${r.slug}`,
    url: `${SITE_URL}/blog/${r.slug}`,
    author: getAuthor(r.authorId),
    categoryInfo: getCategory(r.category),
    displayDate: formatDate(r.publishedAt),
    displayUpdated: r.updatedAt && r.updatedAt.slice(0, 10) !== r.publishedAt.slice(0, 10) ? formatDate(r.updatedAt) : null,
    readTimeLabel: r.readTime ?? `${Math.max(1, Math.round(words / 230))} min read`,
    wordCount: words,
    modifiedAt,
  };
}

const loadAll = requestCache(async (): Promise<Article[]> => {
  const files = fileRecords();
  enforce(validateArticles(files));
  let db: ArticleRecord[] = [];
  try {
    db = vetted(await loadDbRecords());
  } catch (err) {
    console.warn(`[field-notes] database articles unavailable: ${err instanceof Error ? err.message : err}`);
  }
  const dbSlugs = new Set(db.map((r) => r.slug));
  const records = [...db, ...files.filter((r) => !dbSlugs.has(r.slug))];
  // Newest first. Array.sort is stable, so same-day articles keep their order.
  return records
    .map(resolve)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
});

/** Resolve one record for the admin preview (any status, checks reported not enforced). */
export function resolveForPreview(r: ArticleRecord): Article {
  return resolve(r);
}

/** In lists, the feed and the sitemap. Future-dated articles appear once their time passes (within the 5-minute refresh). */
export function isListed(a: ArticleRecord, now = new Date()): boolean {
  return (a.status === "published" || a.status === "scheduled") && Date.parse(a.publishedAt) <= now.getTime();
}

/**
 * Local draft preview: `FIELD_NOTES_SHOW_DRAFTS=1 next dev`. Never true in a
 * production build, so drafts can't leak to the live site.
 */
export function draftPreviewEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.FIELD_NOTES_SHOW_DRAFTS === "1";
}

/** Has a working URL. Archived articles keep theirs so old links don't break. */
export function isReachable(a: ArticleRecord, now = new Date()): boolean {
  if (draftPreviewEnabled() && (a.status === "draft" || a.status === "scheduled")) return true;
  return isListed(a, now) || (a.status === "archived" && Date.parse(a.publishedAt) <= now.getTime());
}

export async function getListedArticles(): Promise<Article[]> {
  const now = new Date();
  return (await loadAll()).filter((a) => isListed(a, now));
}

export async function getReachableArticles(): Promise<Article[]> {
  const now = new Date();
  return (await loadAll()).filter((a) => isReachable(a, now));
}

export async function getArticle(slug: string): Promise<Article | null> {
  const now = new Date();
  return (await loadAll()).find((a) => a.slug === slug && isReachable(a, now)) ?? null;
}

/** Same category first, then shared tags, then newest. */
export async function getRelatedArticles(article: Article, limit = 3): Promise<Article[]> {
  const others = (await getListedArticles()).filter((a) => a.slug !== article.slug);
  const tags = new Set(article.tags.map((t) => t.toLowerCase()));
  const score = (a: Article) =>
    (a.category === article.category ? 100 : 0) +
    (article.secondaryCategories?.includes(a.category) ? 20 : 0) +
    a.tags.filter((t) => tags.has(t.toLowerCase())).length * 10;
  return others
    .map((a, i) => ({ a, i, s: score(a) }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .slice(0, limit)
    .map((x) => x.a);
}

export async function getArticlesInCategory(slug: CategorySlug): Promise<Article[]> {
  return (await getListedArticles()).filter(
    (a) => a.category === slug || a.secondaryCategories?.includes(slug)
  );
}

/**
 * The front page's lead package: the newest featured article leads (newest
 * overall when nothing is featured), followed by the next two newest.
 */
export async function getFrontPage(): Promise<{ lead: Article | null; secondary: Article[]; rest: Article[]; all: Article[] }> {
  const all = await getListedArticles();
  const lead = all.find((a) => a.featured) ?? all[0] ?? null;
  const others = all.filter((a) => a !== lead);
  return { lead, secondary: others.slice(0, 2), rest: others.slice(2), all };
}
