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

## Phase 6: publishing from the Admin Center (not built)

Content Studio already stores blog drafts in `content_items`
(`content_type = 'blog'`, statuses draft → needs_review → approved → scheduled →
published, `scheduled_at`, `published_at`, `source_content_id` for repurposing).
That table stays the editorial system of record. The plan:

1. **Migration (on a Supabase branch first):** add the publication fields
   `content_items` lacks — `slug` (unique where content_type = 'blog'),
   `summary`, `category`, `secondary_categories`, `tags`, `author_id`, `hero`
   (jsonb), `sources` (jsonb), `specs` (jsonb), `discrepancies` (jsonb), `seo`
   (jsonb), `featured`, `updated_at` already exists. Add a
   `content_item_revisions` table written on every edit of a published item.
2. **Provider:** `contentStudioProvider` in `repository.ts` selects
   `content_type = 'blog'` rows with status `published` or `scheduled` and maps
   them to `ArticleRecord` with `origin: "content-studio"`. The validator runs on
   them exactly as on file articles; a row that fails is skipped and reported,
   never rendered.
3. **Publish action:** "Publish to Field Notes" on an approved item runs the
   validator first, sets `status`/`published_at`, then calls `revalidatePath`
   for `/blog`, `/blog/<slug>`, `/blog/feed.xml` and `/sitemap.xml`. Scheduled
   items are picked up by the existing cron route at their `scheduled_at`.
4. **Images:** hero and in-body images need a **public** bucket (the current
   `brand-assets` bucket is private and its signed URLs expire). Add a
   `field-notes` public bucket and allow it in `next.config.ts` images.
5. **Resilience:** pages switch from build-time-only to ISR. If the database is
   unreachable, the last good render is served; file articles always build.
6. **Slugs are permanent.** The repository rejects a slug that already exists in
   the other provider. Changing a published slug requires a redirect entry.

Until then: draft in Content Studio if useful, then copy the approved text into
`src/content/posts.ts` with the checklist at the top of that file.
