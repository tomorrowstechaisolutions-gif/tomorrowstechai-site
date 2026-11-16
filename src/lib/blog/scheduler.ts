import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ARTICLE_COLUMNS, ARTICLES_TABLE, FIELD_NOTES_TAG, REVISIONS_TABLE, rowToRecord, type ArticleRow } from "./db-articles";
import { validateArticles } from "./validate";
import { createArticleSocialDraft } from "./social-draft";

/**
 * Turns scheduled Field Notes articles into published ones once their time
 * arrives. Run by /api/cron/blog-publish every five minutes.
 *
 * The public site already lists a scheduled article after its time (within
 * the 5-minute refresh); this makes it official: status becomes "published",
 * so the page is indexable and the admin list is accurate, a revision records
 * it, and the public pages are refreshed at once. An article that fails the
 * editorial checks stays scheduled (and hidden by the repository) and is
 * reported instead.
 */
export async function publishDueArticles(now = new Date()) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from(ARTICLES_TABLE)
    .select(ARTICLE_COLUMNS)
    .eq("status", "scheduled")
    .lte("published_at", now.toISOString());
  if (error) throw new Error(error.message);

  const published: string[] = [];
  const held: { slug: string; errors: string[] }[] = [];
  for (const row of (data ?? []) as ArticleRow[]) {
    const rec = rowToRecord(row);
    const errors = validateArticles([{ ...rec, status: "published" }])
      .filter((i) => i.level === "error")
      .map((i) => i.message);
    if (errors.length) {
      held.push({ slug: row.slug, errors });
      console.warn(`[blog-publish] "${row.slug}" is due but fails the checks: ${errors.join("; ")}`);
      continue;
    }
    // Only flip rows still scheduled, in case someone changed it meanwhile.
    const { data: updated, error: upErr } = await db
      .from(ARTICLES_TABLE)
      .update({ status: "published", updated_by: "scheduler" })
      .eq("id", row.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (upErr || !updated) continue;
    const snap: Partial<ArticleRow> = { ...row, status: "published", updated_by: "scheduler" };
    delete snap.id;
    delete snap.created_at;
    await db.from(REVISIONS_TABLE).insert({ article_id: row.id, snapshot: snap, note: "Published on schedule", actor: "scheduler" });
    published.push(row.slug);
    // Propose the social post (a draft; never sent automatically).
    const draft = await createArticleSocialDraft(db, rec, "scheduler");
    if (draft.state === "failed") console.warn(`[blog-publish] social draft for "${row.slug}" failed: ${draft.message}`);
  }

  if (published.length) {
    revalidateTag(FIELD_NOTES_TAG, { expire: 0 });
    revalidatePath("/");
    revalidatePath("/blog", "layout");
    for (const slug of published) revalidatePath(`/blog/${slug}`);
    revalidatePath("/blog/feed.xml");
    revalidatePath("/sitemap.xml");
    revalidatePath("/llms.txt");
    revalidatePath("/admin/blog");
  }
  return { published, held };
}
