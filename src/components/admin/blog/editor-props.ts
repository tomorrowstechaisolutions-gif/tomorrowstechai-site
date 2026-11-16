import "server-only";
import { AUTHORS, CATEGORIES, SITE_URL } from "@/lib/blog/taxonomy";
import type { EditorCategory } from "./ArticleEditor";

/** Static choices the editor needs, read on the server. */
export function editorChoices() {
  const categories: EditorCategory[] = CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, cta: c.cta }));
  const authors = Object.values(AUTHORS).map((a) => ({ id: a.id, name: a.name }));
  return { categories, authors, siteUrl: SITE_URL };
}
