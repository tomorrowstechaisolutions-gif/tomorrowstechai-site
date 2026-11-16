import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fileArticles } from "@/content/posts";
import { ARTICLE_COLUMNS, ARTICLES_TABLE, rowToRecord, type ArticleRow } from "./db-articles";
import { getCategory, isCategorySlug } from "./taxonomy";
import type { ArticleRecord } from "./types";
import { validateArticles } from "./validate";

/**
 * Admin Center views of Field Notes. Reads through the request-scoped client,
 * so RLS (admin only) applies. Unlike the public repository, every status is
 * visible here, and editorial problems are reported instead of hidden.
 */

export type AdminArticle = {
  ref: string; // database id, or "file:<slug>" for an article still only in code
  id: string | null;
  slug: string;
  title: string;
  status: ArticleRecord["status"];
  category: string;
  categoryName: string;
  publishedAt: string;
  updatedAt: string | null;
  source: "database" | "code";
  featured: boolean;
  errors: string[];
  warnings: string[];
  record: ArticleRecord;
};

export type AdminArticleList = { articles: AdminArticle[]; dbReady: boolean; dbError: string | null };

function toAdmin(rec: ArticleRecord, source: AdminArticle["source"], id: string | null, updatedAt: string | null): AdminArticle {
  const issues = validateArticles([rec]);
  return {
    ref: id ?? `file:${rec.slug}`,
    id,
    slug: rec.slug,
    title: rec.title,
    status: rec.status,
    category: rec.category,
    categoryName: isCategorySlug(rec.category) ? getCategory(rec.category).name : rec.category,
    publishedAt: rec.publishedAt,
    updatedAt,
    source,
    featured: Boolean(rec.featured),
    // Legacy articles' known gaps are warnings, as on the public site.
    errors: issues.filter((i) => i.level === "error").map((i) => i.message),
    warnings: issues.filter((i) => i.level === "warning").map((i) => i.message),
    record: rec,
  };
}

export async function listAdminArticles(supabase: SupabaseClient): Promise<AdminArticleList> {
  const { data, error } = await supabase.from(ARTICLES_TABLE).select(ARTICLE_COLUMNS).order("published_at", { ascending: false, nullsFirst: true });
  const rows = error ? [] : ((data ?? []) as ArticleRow[]);
  const fromDb = rows.map((r) => toAdmin(rowToRecord(r), "database", r.id, r.updated_at));
  const inDb = new Set(fromDb.map((a) => a.slug));
  const fromCode = fileArticles
    .filter((a) => !inDb.has(a.slug))
    .map((a) => toAdmin({ ...a, origin: "file" }, "code", null, null));
  const articles = [...fromDb, ...fromCode].sort((a, b) => {
    // Drafts first (newest work), then by publication date.
    if ((a.status === "draft") !== (b.status === "draft")) return a.status === "draft" ? -1 : 1;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
  return { articles, dbReady: !error, dbError: error?.message ?? null };
}

/** One article by admin ref, any status. */
export async function getAdminArticle(supabase: SupabaseClient, ref: string): Promise<AdminArticle | null> {
  if (ref.startsWith("file:")) {
    const slug = ref.slice(5);
    const a = fileArticles.find((x) => x.slug === slug);
    return a ? toAdmin({ ...a, origin: "file" }, "code", null, null) : null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(ref)) return null;
  const { data } = await supabase.from(ARTICLES_TABLE).select(ARTICLE_COLUMNS).eq("id", ref).maybeSingle();
  if (!data) return null;
  const row = data as ArticleRow;
  return toAdmin(rowToRecord(row), "database", row.id, row.updated_at);
}
