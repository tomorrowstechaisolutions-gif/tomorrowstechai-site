# Field Notes content architecture

Status: Phase 2 (Nov 2026). Articles are authored in code. This document records
how the Admin Center will later publish approved articles **through the same
pipeline**, without a second content system and without a code change or manual
deploy per article.

## One pipeline

```
 provider(s)                    contract              everything that reads articles
 ───────────                    ────────              ──────────────────────────────
 src/content/posts.ts  ──┐
                         ├──▶  ArticleRecord  ──▶  repository.ts ──▶ /blog, /blog/[slug],
 (later) Content Studio ─┘     (types.ts)          validate.ts         /blog/feed.xml, sitemap,
   approved content_items                          (build-time         home page teaser,
                                                    standards)          JSON-LD, Admin SEO audit
```

- `src/lib/blog/types.ts` — `ArticleRecord` is the single contract. Every field a
  page, feed or schema needs is on it or derived from it.
- `src/lib/blog/repository.ts` — the **only** read path. Pages never import
  `posts.ts` directly. The API is already async so a database provider slots in
  without touching pages.
- `src/lib/blog/validate.ts` — editorial standards. Errors fail the build (and,
  later, block an Admin publish): broken citations, unknown categories, bad dates,
  missing hero credit/alt on new articles, hardware/news articles with no sources,
  specs or discrepancies pointing at unknown sources.
- `src/lib/blog/markdown.tsx` — one body format for both providers. Renders to
  React elements, so text from the database is escaped.
- `src/lib/blog/taxonomy.ts` — categories (with CTA → `/contact?service=`) and
  authors. Bios stay `null` until their wording is approved.

## Phase 6: the Admin Center Blog tab

Decided 2026-11-16: articles get their own table instead of extra columns on
`content_items`. An article's structure (sources, specs, discrepancies, hero,
SEO, CTA) and life cycle (draft → scheduled → published → archived) are the
public site's, not Content Studio's review queue.

**Phase 1 (built):**
- Migration `20261116120000_field_notes_articles.sql`: `field_notes_articles`
  (columns mirror `ArticleRecord`; jsonb for hero, sources, specs,
  discrepancies, seo, cta), `field_notes_revisions` (a snapshot per save), and
  a public `field-notes` storage bucket for images (admin-only writes). RLS is
  admin-only; the public site reads through the service role on the server.
- `src/lib/blog/db-articles.ts` maps rows ↔ records (lossless round trip,
  tested on all file articles).
- `repository.ts` reads both sources. File articles are still enforced
  strictly at build. Database articles are validated one by one; a failing
  article is skipped and logged, never rendered. A database article replaces
  a file article with the same slug. Database reads are cached under the
  `field-notes` tag (5 minutes) and fall back to file articles if the database
  is unreachable.
- Blog pages, feed, sitemap, llms.txt and the homepage use ISR
  (`revalidate = 300`); publishing will revalidate the tag and paths.
- `scripts/import-field-notes.mts` copies file articles into the table
  (insert-only; dry run without `--apply`).
- Admin: `/admin/blog` lists every article with status, checks, 30-day views
  and leads; `/admin/blog/[ref]/preview` renders any article with the live
  `ArticleView` component.

**Phase 2 (built):** `/admin/blog/new` and `/admin/blog/[id]/edit`
(`src/components/admin/blog/ArticleEditor.tsx`). Markdown body with a
formatting toolbar and a live preview; sources, specs and disagreements;
hero and in-body images uploaded from the browser straight to the
`field-notes` bucket (admin-only storage policies); SEO with a search-result
preview; per-article call to action; a live checklist running the same
`validateArticles` rules as the site. Server actions in
`src/app/admin/blog-actions.ts`:
- Save never changes status. A live article's edits must pass every check.
- Publish (today's date unless a past one is set), Schedule (future
  date/time; goes live within the 5-minute refresh), Unpublish (back to
  draft, URL stops working), Archive (off lists/feed, URL keeps working).
- Delete only for drafts and archived articles, confirmed by typing the slug.
- Every save, status change and restore writes a revision; Restore puts back
  an earlier version's content but keeps status, date and a locked slug.
- Public pages refresh immediately (`updateTag` on `field-notes` plus
  `revalidatePath`) whenever a published, scheduled or archived article
  changes.
- The slug is locked once an article has been public.

**Phase 3 (built):**
- Scheduled publishing: `/api/cron/blog-publish` (every 5 minutes, CRON_SECRET)
  runs `publishDueArticles` (`src/lib/blog/scheduler.ts`): due scheduled
  articles that pass the checks become `published`, get a revision
  ("Published on schedule") and the public pages refresh at once. Ones that
  fail stay scheduled, hidden, and are logged.
- Scheduled-and-due articles are indexable (the article page only marks
  drafts and archived articles noindex).
- Articles without a hero share the Field Notes card instead of no image.
- The editor's SEO tab previews the search result and the LinkedIn and
  Facebook link cards.
- "Send to Blog" in Content Studio's review queue: approved items of type
  Blog become a Field Notes draft (`source_content_id` links them, one draft
  per item) and open in the editor. Nothing is published by sending.

**Slugs are permanent** once published; changing one needs a redirect entry.
