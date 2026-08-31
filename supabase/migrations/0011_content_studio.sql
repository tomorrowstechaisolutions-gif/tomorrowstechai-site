-- ---------------------------------------------------------------------
-- 0011 — the Content Studio.
--
-- WHAT ALREADY EXISTED, and is NOT duplicated:
--   social_posts  — the PUBLISH record. account_id, scheduled_at,
--                   published_at, external_id, external_url, error. It is
--                   what Social Center hands to a platform API. Content
--                   Studio does not replace it; approved social content
--                   BECOMES one, and content_items.social_post_id is the
--                   link. Two records because they answer two questions:
--                   "what did we write" and "what did the platform do".
--   ad_creatives  — ad copy, already with variants via parent_id. Ads stay
--                   in Ad Studio. Nothing here re-implements them.
--   ai_actions    — the propose → review → approve queue, already enforced
--                   by a constraint. No content_approvals table.
--   campaign_spend / leads.campaign — a campaign is a NAME string across
--                   this database, not a row. Introducing a campaigns table
--                   now would orphan every existing reference, so campaign
--                   stays text here too. That is a deliberate consistency
--                   choice, not an oversight.
--
-- NOT created, on purpose:
--   content_variants  — a variant IS a content_item with source_content_id
--                       pointing at its parent. One self-reference covers
--                       variants, repurposing and translations; a separate
--                       table would need all the same columns.
--   content_metrics   — nothing writes it. No analytics credential exists.
--                       An empty metrics table is a promise the system
--                       cannot keep. Lead attribution already works through
--                       leads.utm_content / leads.campaign.
--   content_ai_scores — derived per read from the item itself, like client
--                       and SEO health. A stored score is a number that was
--                       true once, and a content score is guidance rather
--                       than measurement, so freezing one is worse still.
--   content_reviews   — review notes live on the item. A review thread is a
--                       feature for more than one reviewer; there is one.
-- ---------------------------------------------------------------------

-- ── brand_profiles ───────────────────────────────────────────────────
-- Whose voice is this in?
--
-- John runs several brands — Tomorrows Tech AI, Dark Tides Supply, Proudly
-- Texan — and writes for clients on top of that. Voice is per brand, and
-- content must not cross-contaminate: a Proudly Texan post must never be
-- generated from Tomorrows Tech AI's guidance. Every content_item carries a
-- brand_profile_id for exactly that reason.
create table if not exists public.brand_profiles (
  id              uuid primary key default gen_random_uuid(),

  -- Null for our own brands; set when the brand belongs to a client.
  customer_id     uuid references public.customers(id) on delete cascade,

  name            text not null,
  slug            text not null,
  description     text,

  -- What the generator is told. These are prompt material, not decoration.
  tone            text,
  audience        text,
  writing_guidance text,
  cta_style       text,
  preferred_phrases text[] not null default '{}',
  prohibited_phrases text[] not null default '{}',

  colors          text[] not null default '{}',
  logo_asset_id   uuid,

  is_default      boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists brand_profiles_slug_idx
  on public.brand_profiles (lower(slug));

-- Exactly one default brand, enforced rather than hoped for.
create unique index if not exists brand_profiles_one_default_idx
  on public.brand_profiles ((is_default)) where is_default;

-- ── content_assets ───────────────────────────────────────────────────
-- The asset library. Files live in the private 'brand-assets' storage
-- bucket created at the bottom of this migration; this table is the
-- metadata and the only thing the UI queries.
--
-- storage_path is the object key inside the bucket. No public URL is stored:
-- the bucket is private, and the app mints a short-lived signed URL when it
-- actually needs to show something. A stored public URL would outlive every
-- permission check around it.
create table if not exists public.content_assets (
  id              uuid primary key default gen_random_uuid(),
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  customer_id     uuid references public.customers(id) on delete set null,

  title           text not null,
  asset_type      text not null default 'other' check (asset_type in (
                    'logo', 'brand_graphic', 'photo', 'video', 'ad',
                    'screenshot', 'product_image', 'document', 'template',
                    'audio', 'other')),

  storage_path    text not null,
  mime_type       text,
  file_size       bigint check (file_size >= 0),
  width           integer check (width >= 0),
  height          integer check (height >= 0),

  campaign        text,
  service         text,
  platform        text,
  tags            text[] not null default '{}',
  usage_notes     text,

  uploaded_by     text,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists content_assets_path_idx
  on public.content_assets (storage_path);
create index if not exists content_assets_brand_idx
  on public.content_assets (brand_profile_id) where is_archived = false;
create index if not exists content_assets_tags_idx
  on public.content_assets using gin (tags);

alter table public.brand_profiles
  drop constraint if exists brand_profiles_logo_fkey;
alter table public.brand_profiles
  add constraint brand_profiles_logo_fkey
  foreign key (logo_asset_id) references public.content_assets(id) on delete set null;

-- ── content_items ────────────────────────────────────────────────────
-- One piece of content, for any channel.
--
-- The status list is deliberately the SAME shape as social_posts, plus the
-- two states that only exist before publishing is involved ('generating'
-- while the model is working, 'archived' after). Keeping them aligned is
-- what lets an approved item become a social_post without translating a
-- status vocabulary, which is where these systems usually rot.
create table if not exists public.content_items (
  id              uuid primary key default gen_random_uuid(),

  brand_profile_id uuid not null references public.brand_profiles(id) on delete restrict,
  customer_id     uuid references public.customers(id) on delete set null,
  website_id      uuid references public.websites(id) on delete set null,

  title           text not null,
  body            text,

  content_type    text not null default 'social_post' check (content_type in (
                    'social_post', 'reel_script', 'short_script', 'blog',
                    'email', 'ad_copy', 'landing_copy', 'google_business',
                    'hashtags', 'image_concept', 'video_concept', 'other')),

  -- Null for channel-agnostic pieces (a blog, an email). Set for anything
  -- written to a platform's own constraints.
  platform        text check (platform in (
                    'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube',
                    'google_business', 'blog', 'email')),

  status          text not null default 'draft' check (status in (
                    'draft', 'generating', 'needs_review', 'approved',
                    'scheduled', 'published', 'failed', 'archived')),

  goal            text check (goal in (
                    'awareness', 'lead_generation', 'sales', 'education',
                    'engagement', 'retargeting', 'announcement', 'seo',
                    'client_communication')),
  audience        text,
  tone            text,

  campaign        text,
  service         text,

  hashtags        text[] not null default '{}',
  cta             text,
  destination_url text,

  scheduled_at    timestamptz,
  published_at    timestamptz,

  -- Where it came from. source_content_id is the whole repurposing model:
  -- a Reel script made from a blog points at the blog, so "what did this
  -- come from" and "what came out of this" are the same query run two ways.
  source_content_id uuid references public.content_items(id) on delete set null,
  ai_generated    boolean not null default false,
  ai_model        text,
  ai_prompt       text,

  -- Set when this item has been handed to Social Center to publish.
  social_post_id  uuid references public.social_posts(id) on delete set null,

  owner           text,
  review_notes    text,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists content_items_queue_idx
  on public.content_items (status, updated_at desc) where is_archived = false;
create index if not exists content_items_calendar_idx
  on public.content_items (scheduled_at) where scheduled_at is not null;
create index if not exists content_items_brand_idx
  on public.content_items (brand_profile_id) where is_archived = false;
create index if not exists content_items_source_idx
  on public.content_items (source_content_id) where source_content_id is not null;
create index if not exists content_items_campaign_idx
  on public.content_items (campaign) where campaign is not null;

-- A scheduled or published item must actually have a date. Without this the
-- calendar silently drops rows that claim to be on it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_items_scheduled_check') then
    alter table public.content_items add constraint content_items_scheduled_check
      check (status <> 'scheduled' or scheduled_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_items_published_check') then
    alter table public.content_items add constraint content_items_published_check
      check (status <> 'published' or published_at is not null);
  end if;
end $$;

-- ── content_asset_links ──────────────────────────────────────────────
-- One image belongs on many posts; one post carries several images.
create table if not exists public.content_asset_links (
  content_id      uuid not null references public.content_items(id) on delete cascade,
  asset_id        uuid not null references public.content_assets(id) on delete cascade,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  primary key (content_id, asset_id)
);

create index if not exists content_asset_links_asset_idx
  on public.content_asset_links (asset_id);

-- ── updated_at ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['brand_profiles', 'content_assets', 'content_items'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- ── RLS — same deny-by-default posture as every other table here ─────
do $$
declare t text;
begin
  foreach t in array array[
    'brand_profiles', 'content_assets', 'content_items', 'content_asset_links'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
      t || '_admin_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      t || '_admin_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── The one brand that must exist ────────────────────────────────────
-- Content cannot be written without a voice to write it in, so the default
-- brand is seeded rather than left as a first-run chore. The guidance here
-- is lifted from the ad-copy generator that already works, so the two speak
-- with one voice instead of two.
insert into public.brand_profiles (name, slug, description, tone, audience, cta_style, writing_guidance, prohibited_phrases, colors, is_default)
select
  'Tomorrows Tech AI',
  'tomorrows-tech-ai',
  'Websites, automation and AI systems for small trade businesses in Central Texas.',
  'Plain, direct, operator-to-operator.',
  'Owner-operators of small trade businesses — contractors, roofers, HVAC, plumbers, pool service, landscapers.',
  'One clear next step. No pressure, no fake urgency.',
  'Short sentences. You are talking to someone who answers their own phone and is on a roof or under a sink most of the day. Never claim specific earnings or results. Never invent testimonials or numbers.',
  array['unlock', 'revolutionise', 'revolutionize', 'game-changer', 'supercharge', 'skyrocket', 'act now', 'limited time only'],
  array['#0B0F14', '#38BDF8'],
  true
where not exists (select 1 from public.brand_profiles);

-- ── Storage: the private brand-assets bucket ─────────────────────────
-- PRIVATE, and it must stay private. A public bucket would put every client
-- logo, unreleased graphic and screenshot on a guessable URL with no auth in
-- front of it. The app mints a short-lived signed URL per view instead, so
-- access dies with the session rather than living forever in a stored link.
--
-- Guarded because the storage schema only exists on Supabase — a scratch
-- PostgreSQL used to verify these migrations does not have it.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (scratch database) — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('brand-assets', 'brand-assets', false, 52428800)
  on conflict (id) do update set public = false;

  execute 'drop policy if exists brand_assets_admin_read on storage.objects';
  execute 'drop policy if exists brand_assets_admin_write on storage.objects';
  execute 'drop policy if exists brand_assets_admin_update on storage.objects';
  execute 'drop policy if exists brand_assets_admin_delete on storage.objects';

  execute $p$
    create policy brand_assets_admin_read on storage.objects
      for select to authenticated
      using (bucket_id = 'brand-assets' and public.is_admin())
  $p$;
  execute $p$
    create policy brand_assets_admin_write on storage.objects
      for insert to authenticated
      with check (bucket_id = 'brand-assets' and public.is_admin())
  $p$;
  execute $p$
    create policy brand_assets_admin_update on storage.objects
      for update to authenticated
      using (bucket_id = 'brand-assets' and public.is_admin())
      with check (bucket_id = 'brand-assets' and public.is_admin())
  $p$;
  execute $p$
    create policy brand_assets_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'brand-assets' and public.is_admin())
  $p$;
end $$;
