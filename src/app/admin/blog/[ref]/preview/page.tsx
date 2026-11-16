import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getAdminArticle } from "@/lib/blog/admin-queries";
import { getListedArticles, resolveForPreview } from "@/lib/blog/repository";
import { ArticleView } from "@/components/blog/ArticleView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/**
 * Admin preview of any article, any status, rendered with the same component
 * as the live page. Outside the admin shell on purpose: full width, like a
 * reader sees it. Admin-only.
 */
export default async function BlogPreviewPage({ params }: { params: Promise<{ ref: string }> }) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const { ref } = await params;
  const supabase = await createSupabaseServerClient();
  const item = await getAdminArticle(supabase, decodeURIComponent(ref));
  if (!item) notFound();

  const post = resolveForPreview(item.record);
  const related = (await getListedArticles()).filter((a) => a.slug !== post.slug).slice(0, 3);
  const live = item.status === "published" || item.status === "archived";

  return (
    <div style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      <div
        role="status"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 20px",
          background: "#0b1220",
          borderBottom: "1px solid var(--color-border)",
          fontSize: 14,
          color: "var(--color-text)",
        }}
      >
        <Link href="/admin/blog" style={{ color: "#93c5fd" }}>← Blog</Link>
        <strong>Preview</strong>
        <span style={{ color: "#94a3b8" }}>
          {item.status[0].toUpperCase() + item.status.slice(1)}
          {item.source === "code" ? " · stored in code" : ""}
        </span>
        {item.errors.length ? (
          <span style={{ color: "#f87171" }} title={item.errors.join("\n")}>
            {item.errors.length} editorial error{item.errors.length === 1 ? "" : "s"}: {item.errors[0]}
          </span>
        ) : (
          <span style={{ color: "#4ade80" }}>Passes the editorial checks{item.warnings.length ? ` (${item.warnings.length} warning${item.warnings.length === 1 ? "" : "s"})` : ""}</span>
        )}
        {live ? (
          <a href={`/blog/${item.slug}`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", color: "#93c5fd" }}>
            Open live page ↗
          </a>
        ) : null}
      </div>
      <ArticleView post={post} related={related} preview />
    </div>
  );
}
