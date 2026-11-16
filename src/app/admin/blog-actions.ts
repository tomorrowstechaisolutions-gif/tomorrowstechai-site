"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { ARTICLE_COLUMNS, ARTICLES_TABLE, FIELD_NOTES_TAG, REVISIONS_TABLE, recordToRow, rowToRecord, type ArticleRow } from "@/lib/blog/db-articles";
import { blankArticle, checkArticle, contentToDraft, isLive, normalize, saveBlocker, slugify, slugLocked, todayCentral, type EditableArticle } from "@/lib/blog/editor-model";
import type { ArticleStatus } from "@/lib/blog/types";

/**
 * Blog tab writes. Every action re-checks the admin (server actions are public
 * endpoints) and goes through the request-scoped client, so the admin-only
 * RLS policies apply as well. Every save writes a revision. Anything that
 * changes what readers can see refreshes the public pages at once.
 */

export type BlogActionResult = {
  ok: boolean;
  message: string;
  id?: string;
  status?: ArticleStatus;
  publishedAt?: string;
  errors?: string[];
};

const fail = (message: string, errors?: string[]): BlogActionResult => ({ ok: false, message, errors });

async function session() {
  const s = await getAdminUser();
  if (!s) return null;
  return { supabase: await createSupabaseServerClient(), actor: s.admin.email as string };
}

/** Readers see the change on the next request instead of after the 5-minute refresh. */
function refreshPublic(slugs: string[]) {
  updateTag(FIELD_NOTES_TAG);
  revalidatePath("/");
  revalidatePath("/blog", "layout");
  for (const s of slugs) revalidatePath(`/blog/${s}`);
  revalidatePath("/blog/feed.xml");
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
  revalidatePath("/admin/blog");
}

async function loadRow(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from(ARTICLES_TABLE).select(ARTICLE_COLUMNS).eq("id", id).maybeSingle();
  return (data as ArticleRow | null) ?? null;
}

async function writeRevision(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
  actor: string,
  note: string
) {
  const { data } = await supabase.from(ARTICLES_TABLE).select(ARTICLE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return;
  const snapshot: Partial<ArticleRow> = { ...(data as ArticleRow) };
  delete snapshot.id;
  delete snapshot.created_at;
  await supabase.from(REVISIONS_TABLE).insert({ article_id: id, snapshot, note, actor });
}

const errorsOf = (a: EditableArticle, status: ArticleStatus) =>
  checkArticle(a, status).filter((i) => i.level === "error").map((i) => i.message);

const dbMessage = (msg: string) =>
  /duplicate key|field_notes_articles_slug_key/.test(msg) ? "Another article already uses that URL slug." : msg;

/**
 * Create or update an article's content. The status is never changed here;
 * a live article's edits go live at once, so they must pass every check.
 */
export async function saveArticleAction(id: string | null, input: EditableArticle, note?: string): Promise<BlogActionResult> {
  const s = await session();
  if (!s) return fail("Your admin session expired. Sign in again.");
  const { supabase, actor } = s;

  const draft = normalize(input);
  const blocker = saveBlocker(draft);
  if (blocker) return fail(blocker);

  if (!id) {
    const record = { ...draft, status: "draft" as const };
    const { data, error } = await supabase
      .from(ARTICLES_TABLE)
      .insert({ ...recordToRow(record), created_by: actor, updated_by: actor })
      .select("id")
      .single();
    if (error) return fail(dbMessage(error.message));
    await writeRevision(supabase, data.id, actor, note?.trim() || "Created");
    revalidatePath("/admin/blog");
    return { ok: true, message: "Draft created.", id: data.id, status: "draft" };
  }

  const row = await loadRow(supabase, id);
  if (!row) return fail("That article no longer exists.");
  const current = rowToRecord(row);

  // Status and the reader-facing date are managed by publish/schedule.
  const record: EditableArticle = { ...draft, status: current.status };
  if (slugLocked(current.status) && record.slug !== current.slug) {
    return fail("The URL can't change once an article has been published; readers and search engines already link to it.");
  }
  if (isLive(current.status)) {
    const errors = errorsOf(record, current.status);
    if (errors.length) return fail("This article is live, so the change wasn't saved. Fix these first:", errors);
  }

  const values = recordToRow(record);
  // Drafts can be saved without a date; keep whatever the row had otherwise.
  if (!record.publishedAt) values.published_at = row.published_at;
  const { error } = await supabase.from(ARTICLES_TABLE).update({ ...values, updated_by: actor }).eq("id", id);
  if (error) return fail(dbMessage(error.message));
  await writeRevision(supabase, id, actor, note?.trim() || "Saved");

  if (current.status !== "draft") refreshPublic([record.slug]);
  else revalidatePath("/admin/blog");
  return {
    ok: true,
    message: isLive(current.status) ? "Saved. The live article is updated." : current.status === "archived" ? "Saved (archived)." : "Draft saved.",
    id,
    status: current.status,
  };
}

/**
 * Change who can see an article.
 *   publish   → live now. Keeps a past publish date, otherwise today.
 *   schedule  → live automatically at its future publish date/time.
 *   unpublish → back to draft; the URL stops working.
 *   archive   → off the lists and feed, URL keeps working for old links.
 */
export async function setArticleStatusAction(
  id: string,
  action: "publish" | "schedule" | "unpublish" | "archive"
): Promise<BlogActionResult> {
  const s = await session();
  if (!s) return fail("Your admin session expired. Sign in again.");
  const { supabase, actor } = s;
  const row = await loadRow(supabase, id);
  if (!row) return fail("That article no longer exists.");
  const rec = rowToRecord(row);
  const now = Date.now();

  let status: ArticleStatus;
  let publishedAt: string | null = row.published_at;
  let note: string;

  if (action === "publish") {
    status = "published";
    if (!publishedAt || Date.parse(publishedAt) > now) publishedAt = `${todayCentral()}T00:00:00.000Z`;
    note = "Published";
  } else if (action === "schedule") {
    if (!publishedAt || Date.parse(publishedAt) <= now) {
      return fail("Set a future publish date and time in Settings, save, then schedule.");
    }
    status = "scheduled";
    note = `Scheduled for ${new Date(publishedAt).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })} CT`;
  } else if (action === "unpublish") {
    status = "draft";
    note = "Unpublished";
  } else {
    if (rec.status === "draft") return fail("Drafts were never public. Delete it instead, or publish it first.");
    status = "archived";
    note = "Archived";
  }

  const next = { ...rec, status, publishedAt: publishedAt ? rowToRecord({ ...row, published_at: publishedAt }).publishedAt : rec.publishedAt };
  if (isLive(status) || status === "archived") {
    const errors = errorsOf(next, status);
    if (errors.length) return fail(`Not ${action === "archive" ? "archived" : action === "schedule" ? "scheduled" : "published"}. Fix these first:`, errors);
  }

  const { error } = await supabase
    .from(ARTICLES_TABLE)
    .update({ status, published_at: publishedAt, updated_by: actor })
    .eq("id", id);
  if (error) return fail(dbMessage(error.message));
  await writeRevision(supabase, id, actor, note);
  refreshPublic([rec.slug]);

  const messages = {
    publish: "Published. It's live now.",
    schedule: `${note}. It goes live on its own (within five minutes of that time).`,
    unpublish: "Unpublished. The article is a draft again and its URL no longer works.",
    archive: "Archived. It's off the lists and feed; the URL still works for old links.",
  };
  return { ok: true, message: messages[action], id, status, publishedAt: next.publishedAt };
}

/** Permanently delete a draft or archived article and its history. Live articles must be unpublished first. */
export async function deleteArticleAction(id: string, confirmSlug: string): Promise<BlogActionResult> {
  const s = await session();
  if (!s) return fail("Your admin session expired. Sign in again.");
  const { supabase } = s;
  const row = await loadRow(supabase, id);
  if (!row) return fail("That article no longer exists.");
  if (isLive(row.status)) return fail("Unpublish or archive the article before deleting it.");
  if (confirmSlug.trim() !== row.slug) return fail("Type the article's slug exactly to confirm.");
  const { error } = await supabase.from(ARTICLES_TABLE).delete().eq("id", id);
  if (error) return fail(error.message);
  refreshPublic([row.slug]);
  return { ok: true, message: "Deleted." };
}

/**
 * Put an earlier version's content back. Status, publish date and (once
 * published) the slug stay as they are now; the restore is itself a revision.
 */
export async function restoreRevisionAction(articleId: string, revisionId: string): Promise<BlogActionResult> {
  const s = await session();
  if (!s) return fail("Your admin session expired. Sign in again.");
  const { supabase, actor } = s;
  const row = await loadRow(supabase, articleId);
  if (!row) return fail("That article no longer exists.");
  const { data: rev } = await supabase
    .from(REVISIONS_TABLE)
    .select("id, snapshot, created_at")
    .eq("id", revisionId)
    .eq("article_id", articleId)
    .maybeSingle();
  if (!rev) return fail("That version no longer exists.");

  const snap = rev.snapshot as Partial<ArticleRow>;
  const merged: ArticleRow = {
    ...row,
    ...snap,
    id: row.id,
    status: row.status,
    published_at: row.published_at,
    slug: slugLocked(row.status) ? row.slug : (snap.slug ?? row.slug),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const record = rowToRecord(merged);
  if (isLive(row.status)) {
    const errors = errorsOf(record, row.status);
    if (errors.length) return fail("That version fails the checks and this article is live, so it wasn't restored:", errors);
  }
  const values = recordToRow(record);
  values.published_at = row.published_at;
  const { error } = await supabase.from(ARTICLES_TABLE).update({ ...values, updated_by: actor }).eq("id", articleId);
  if (error) return fail(dbMessage(error.message));
  const when = new Date(rev.created_at).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
  await writeRevision(supabase, articleId, actor, `Restored the version from ${when} CT`);
  if (row.status !== "draft") refreshPublic([row.slug]);
  revalidatePath(`/admin/blog/${articleId}/edit`);
  return { ok: true, message: `Restored the version from ${when} CT.`, id: articleId, status: row.status };
}

/**
 * "Send to Blog" from Content Studio: turn an approved Blog item into a Field
 * Notes draft and open it in the editor. Only approved items leave the studio
 * (the same gate as Send to Social). Nothing is published; the draft still
 * has to pass the editorial checks and be published by hand. An item that was
 * already sent opens its existing draft instead of making a second one.
 */
export async function sendContentToBlogAction(formData: FormData): Promise<void> {
  const s = await session();
  if (!s) redirect("/admin/login");
  const { supabase, actor } = s;
  const contentId = String(formData.get("content_id") ?? "").slice(0, 40);
  if (!/^[0-9a-f-]{36}$/i.test(contentId)) return;

  const { data: already } = await supabase.from(ARTICLES_TABLE).select("id").eq("source_content_id", contentId).maybeSingle();
  if (already) redirect(`/admin/blog/${already.id}/edit`);

  const { data: item } = await supabase
    .from("content_items")
    .select("id, title, body, content_type, status, hashtags, ai_generated, owner")
    .eq("id", contentId)
    .maybeSingle();
  if (!item || item.content_type !== "blog" || item.status !== "approved") return;

  const { title, body, summary, tags } = contentToDraft(item);

  // A free slug: the headline's, or the headline's with -2, -3…
  const base = slugify(title) || "article";
  const { data: taken } = await supabase.from(ARTICLES_TABLE).select("slug").like("slug", `${base}%`);
  const used = new Set((taken ?? []).map((r: { slug: string }) => r.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

  const record: EditableArticle = { ...blankArticle(), title, slug, summary, body, tags, category: "business-automation" };
  const { data, error } = await supabase
    .from(ARTICLES_TABLE)
    .insert({ ...recordToRow(normalize(record)), source_content_id: contentId, created_by: actor, updated_by: actor })
    .select("id")
    .single();
  if (error) {
    console.error("[blog] send to blog failed:", error.message);
    return;
  }
  await writeRevision(
    supabase,
    data.id,
    actor,
    `Sent from Content Studio${item.ai_generated ? " (AI-drafted; approved in the studio)" : ""}`
  );
  revalidatePath("/admin/blog");
  revalidatePath("/admin/marketing/content");
  redirect(`/admin/blog/${data.id}/edit`);
}
