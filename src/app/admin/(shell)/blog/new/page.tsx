import type { Metadata } from "next";
import { ArticleEditor } from "@/components/admin/blog/ArticleEditor";
import { editorChoices } from "@/components/admin/blog/editor-props";
import { blankArticle } from "@/lib/blog/editor-model";
import "@/components/admin/blog/blog-editor.css";
import "@/app/blog/field-notes-prose.css";
import "@/app/blog/field-notes-article.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New article" };

/** A blank article. The first save creates the draft and moves to its edit page. */
export default function NewArticlePage() {
  return <ArticleEditor id={null} initial={blankArticle()} revisions={[]} {...editorChoices()} />;
}
