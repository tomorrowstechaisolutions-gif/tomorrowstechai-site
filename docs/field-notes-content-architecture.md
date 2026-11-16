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

## Phase 6: the Admin Center Blog tab (in progress)

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

**Phase 2:** editor (Markdown with live preview), sources/specs/discrepancies,
hero upload, SEO and CTA, publish checklist, publish/unpublish/archive/delete,
revision history.

**Phase 3:** scheduled publishing via cron, search and social previews,
"Send to Blog" from Content Studio.

**Slugs are permanent** once published; changing one needs a redirect entry.
