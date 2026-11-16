import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ARTICLE_COLUMNS, ARTICLES_TABLE, REVISIONS_TABLE, rowToRecord, type ArticleRow } from "@/lib/blog/db-articles";
import { ArticleEditor, type EditorRevision } from "@/components/admin/blog/ArticleEditor";
import { editorChoices } from "@/components/admin/blog/editor-props";
import { ArticlePerformance } from "@/components/admin/blog/ArticlePerformance";
import type { EditableArticle } from "@/lib/blog/editor-model";
import "@/components/admin/blog/blog-editor.css";
import "@/app/blog/field-notes-prose.css";
import "@/app/blog/field-notes-article.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit article" };

export default async function EditArticlePage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const id = decodeURIComponent(ref);

  // Articles still only in code can't be edited here until they are imported.
  if (id.startsWith("file:")) {
    return (
      <section className="cc-panel">
        <div className="cc-panel-body">
          <p className="cc-note" style={{ margin: 0 }}>
            This article is still stored in code. Import it into the database (scripts/import-field-notes.mts) to edit it here.{" "}
            <Link href="/admin/blog" className="cc-link">Back to Blog</Link>
          </p>
        </div>
      </section>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: row }, { data: revs }] = await Promise.all([
    supabase.from(ARTICLES_TABLE).select(ARTICLE_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from(REVISIONS_TABLE).select("id, created_at, note, actor").eq("article_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!row) notFound();

  const r = row as ArticleRow;
  const record: EditableArticle & { id?: string } = rowToRecord(r);
  delete record.id;
  // An undated draft shows an empty date, not the creation time the reader view falls back to.
  if (!r.published_at) record.publishedAt = "";

  return (
    <ArticleEditor
      id={r.id}
      initial={record}
      revisions={(revs ?? []) as EditorRevision[]}
      {...editorChoices()}
      performance={
        <Suspense fallback={<p className="be-help">Loading traffic, leads and social posts…</p>}>
          <ArticlePerformance id={r.id} slug={r.slug} status={r.status} publishedAt={r.published_at} />
        </Suspense>
      }
    />
  );
}
