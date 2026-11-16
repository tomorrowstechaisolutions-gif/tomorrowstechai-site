-- Field Notes articles, managed from the Admin Center (Blog tab).
--
-- A dedicated table rather than more columns on content_items: an article
-- carries its own editorial structure (sources, specs, discrepancies, hero
-- image, SEO, call to action) that Content Studio's social-first rows do not,
-- and its life cycle (draft -> scheduled -> published -> archived) is the
-- public site's, not Content Studio's review queue. The column shapes mirror
-- ArticleRecord in src/lib/blog/types.ts; jsonb columns hold the same objects.
--
-- Reads for the public site go through the service role on the server and only
-- ever select published/scheduled/archived rows, so no anon policy is needed.
-- Safe to re-run.

begin;

create table if not exists public.field_notes_articles (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null,
  title                text not null,
  summary              text not null default '',
  body                 text not null default '',
  status               text not null default 'draft'
                         check (status in ('draft', 'scheduled', 'published', 'archived')),
  -- The date readers see. Required once an article is scheduled or published.
  published_at         timestamptz,
  -- "Updated" date shown on the article after a meaningful edit.
  revised_at           timestamptz,
  category             text not null check (category in (
                         'ai-news', 'hardware', 'private-ai', 'business-automation',
                         'technology-guides', 'industry-insights')),
  secondary_categories text[] not null default '{}',
  tags                 text[] not null default '{}',
  author_id            text,
  hero                 jsonb,
  sources              jsonb not null default '[]'::jsonb,
  specs                jsonb not null default '[]'::jsonb,
  discrepancies        jsonb not null default '[]'::jsonb,
  featured             boolean not null default false,
  seo                  jsonb,
  cta                  jsonb,
  read_time            text,
  legacy               boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           text,
  updated_by           text,
  constraint field_notes_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint field_notes_dated_when_live check (
    status in ('draft', 'archived') or published_at is not null)
);

create unique index if not exists field_notes_articles_slug_key
  on public.field_notes_articles (slug);
create index if not exists field_notes_articles_status_idx
  on public.field_notes_articles (status, published_at desc);

drop trigger if exists field_notes_articles_touch on public.field_notes_articles;
create trigger field_notes_articles_touch before update on public.field_notes_articles
  for each row execute function public.touch_updated_at();

-- Every save writes a snapshot, so any earlier version can be restored.
create table if not exists public.field_notes_revisions (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.field_notes_articles(id) on delete cascade,
  snapshot    jsonb not null,
  note        text,
  actor       text,
  created_at  timestamptz not null default now()
);

create index if not exists field_notes_revisions_article_idx
  on public.field_notes_revisions (article_id, created_at desc);

-- ── RLS: admin only, like every other admin table ──────────────────────────
alter table public.field_notes_articles  enable row level security;
alter table public.field_notes_revisions enable row level security;

revoke all on public.field_notes_articles  from anon;
revoke all on public.field_notes_revisions from anon;

drop policy if exists field_notes_articles_admin_all on public.field_notes_articles;
create policy field_notes_articles_admin_all on public.field_notes_articles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists field_notes_revisions_admin_all on public.field_notes_revisions;
create policy field_notes_revisions_admin_all on public.field_notes_revisions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Images: a public bucket, since article images are public on the site ──
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (scratch database) - skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'field-notes',
    'field-notes',
    true,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']
  )
  on conflict (id) do update set
    public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  -- Public read comes from the bucket being public; only admins can write.
  execute 'drop policy if exists field_notes_admin_insert on storage.objects';
  execute 'drop policy if exists field_notes_admin_update on storage.objects';
  execute 'drop policy if exists field_notes_admin_delete on storage.objects';

  execute $p$
    create policy field_notes_admin_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'field-notes' and public.is_admin())
  $p$;
  execute $p$
    create policy field_notes_admin_update on storage.objects
      for update to authenticated
      using (bucket_id = 'field-notes' and public.is_admin())
      with check (bucket_id = 'field-notes' and public.is_admin())
  $p$;
  execute $p$
    create policy field_notes_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'field-notes' and public.is_admin())
  $p$;
end $$;

commit;
