import "server-only";
import type { ArticleRecord, ArticleStatus, CategorySlug } from "./types";

/**
 * Field Notes articles stored in Supabase (public.field_notes_articles),
 * managed from the Admin Center's Blog tab. Shapes mirror ArticleRecord.
 */

export const ARTICLES_TABLE = "field_notes_articles";
export const REVISIONS_TABLE = "field_notes_revisions";
/** Cache tag for every public read; publishing calls revalidateTag on it. */
export const FIELD_NOTES_TAG = "field-notes";

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  status: ArticleStatus;
  published_at: string | null;
  revised_at: string | null;
  category: CategorySlug;
  secondary_categories: string[] | null;
  tags: string[] | null;
  author_id: string | null;
  hero: ArticleRecord["hero"] | null;
  sources: ArticleRecord["sources"] | null;
  specs: ArticleRecord["specs"] | null;
  discrepancies: ArticleRecord["discrepancies"] | null;
  featured: boolean;
  seo: ArticleRecord["seo"] | null;
  cta: ArticleRecord["cta"] | null;
  read_time: string | null;
  legacy: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export const ARTICLE_COLUMNS =
  "id, slug, title, summary, body, status, published_at, revised_at, category, secondary_categories, tags, author_id, hero, sources, specs, discrepancies, featured, seo, cta, read_time, legacy, created_at, updated_at, created_by, updated_by";

/** Calendar dates were authored as YYYY-MM-DD; keep that form when the time is midnight UTC. */
function isoOut(ts: string | null): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return undefined;
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

export function rowToRecord(r: ArticleRow): ArticleRecord & { id: string } {
  const rec: ArticleRecord & { id: string } = {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    body: r.body,
    status: r.status,
    // Drafts may have no date yet; the creation time stands in for previews.
    publishedAt: isoOut(r.published_at) ?? isoOut(r.created_at) ?? new Date().toISOString(),
    category: r.category,
    tags: r.tags ?? [],
    featured: r.featured,
    legacy: r.legacy,
    origin: "database",
  };
  const updated = isoOut(r.revised_at);
  if (updated) rec.updatedAt = updated;
  if (r.secondary_categories?.length) rec.secondaryCategories = r.secondary_categories as CategorySlug[];
  if (r.author_id) rec.authorId = r.author_id;
  if (r.hero) rec.hero = r.hero;
  if (r.sources?.length) rec.sources = r.sources;
  if (r.specs?.length) rec.specs = r.specs;
  if (r.discrepancies?.length) rec.discrepancies = r.discrepancies;
  if (r.seo && Object.keys(r.seo).length) rec.seo = r.seo;
  if (r.cta) rec.cta = r.cta;
  if (r.read_time) rec.readTime = r.read_time;
  return rec;
}

/** The writable columns for an insert or update. */
export function recordToRow(a: ArticleRecord): Omit<ArticleRow, "id" | "created_at" | "updated_at" | "created_by" | "updated_by"> {
  const ts = (v?: string) => (v ? new Date(v.length === 10 ? `${v}T00:00:00Z` : v).toISOString() : null);
  return {
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    body: a.body,
    status: a.status,
    published_at: ts(a.publishedAt),
    revised_at: ts(a.updatedAt),
    category: a.category,
    secondary_categories: a.secondaryCategories ?? [],
    tags: a.tags ?? [],
    author_id: a.authorId ?? null,
    hero: a.hero ?? null,
    sources: a.sources ?? [],
    specs: a.specs ?? [],
    discrepancies: a.discrepancies ?? [],
    featured: Boolean(a.featured),
    seo: a.seo ?? null,
    cta: a.cta ?? null,
    read_time: a.readTime ?? null,
    legacy: Boolean(a.legacy),
  };
}
