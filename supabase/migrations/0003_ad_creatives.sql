-- 0003_ad_creatives.sql   (applied 2026-08-29)
--
-- Ad Studio: every ad we run, kept as a record so the next one starts from
-- the last one that worked rather than from a blank page.
--
-- `name` is the join key that makes per-ad reporting possible: it is what
-- goes into utm_term via {{ad.name}}, and it is what campaign_spend.ad holds.
-- Keep them identical or the dashboard can't line spend up with leads.

create table if not exists public.ad_creatives (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  name           text not null,
  campaign       text not null default '$399 Business Launch',
  adset          text not null default '',

  status         text not null default 'draft' check (status in (
                   'draft', 'ready', 'live', 'paused', 'archived')),
  platform       text not null default 'meta' check (platform in ('meta', 'google', 'other')),
  format         text not null default 'feed_4x5' check (format in (
                   'feed_4x5', 'feed_1x1', 'story_9x16', 'reel_9x16', 'other')),

  primary_text   text not null default '',
  headline       text not null default '',
  description    text not null default '',
  cta_label      text not null default 'Learn More',

  destination_path text not null default '/business-launch',

  image_url      text,
  image_note     text,
  audience_note  text,
  notes          text,

  parent_id      uuid references public.ad_creatives(id) on delete set null,
  generated_by   text not null default 'human' check (generated_by in ('human', 'ai')),
  brief          text,

  first_run_at   timestamptz,
  retired_at     timestamptz
);

create index if not exists ad_creatives_status_idx   on public.ad_creatives (status);
create index if not exists ad_creatives_campaign_idx on public.ad_creatives (campaign);
create index if not exists ad_creatives_created_idx  on public.ad_creatives (created_at desc);
create unique index if not exists ad_creatives_name_key
  on public.ad_creatives (lower(name), campaign);

drop trigger if exists ad_creatives_touch on public.ad_creatives;
create trigger ad_creatives_touch before update on public.ad_creatives
  for each row execute function public.touch_updated_at();

alter table public.ad_creatives enable row level security;

drop policy if exists ad_creatives_admin_select on public.ad_creatives;
drop policy if exists ad_creatives_admin_insert on public.ad_creatives;
drop policy if exists ad_creatives_admin_update on public.ad_creatives;
drop policy if exists ad_creatives_admin_delete on public.ad_creatives;

create policy ad_creatives_admin_select on public.ad_creatives
  for select to authenticated using (public.is_admin());
create policy ad_creatives_admin_insert on public.ad_creatives
  for insert to authenticated with check (public.is_admin());
create policy ad_creatives_admin_update on public.ad_creatives
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ad_creatives_admin_delete on public.ad_creatives
  for delete to authenticated using (public.is_admin());

revoke all on public.ad_creatives from anon;
