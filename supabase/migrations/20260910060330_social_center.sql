-- Social Center operations layer. Extends the existing account/post records
-- used by Content Studio and Calendar; no OAuth secrets are exposed here.
begin;

alter table public.social_accounts
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists external_page_id text,
  add column if not exists profile_image_url text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists default_posting_time time,
  add column if not exists posting_enabled boolean not null default false,
  add column if not exists engagement_enabled boolean not null default false,
  add column if not exists analytics_enabled boolean not null default false,
  add column if not exists permissions text[] not null default '{}',
  add column if not exists connection_error text;

drop index if exists public.social_accounts_platform_key;
create unique index social_accounts_client_platform_key
  on public.social_accounts (
    platform,
    coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(handle, '')
  );
create index if not exists social_accounts_customer_idx
  on public.social_accounts (customer_id, status);

alter table public.social_posts
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists title text,
  add column if not exists headline text,
  add column if not exists description text,
  add column if not exists cta text,
  add column if not exists hashtags text[] not null default '{}',
  add column if not exists first_comment text,
  add column if not exists location text,
  add column if not exists alt_text text,
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists approval_type text not null default 'none',
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists assigned_to text,
  add column if not exists service_assignment_id uuid references public.client_services(id) on delete set null,
  add column if not exists content_item_id uuid references public.content_items(id) on delete set null,
  add column if not exists media_asset_id uuid references public.content_assets(id) on delete set null,
  add column if not exists media_type text not null default 'none',
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_notes text,
  add column if not exists canceled_at timestamptz,
  add column if not exists publish_attempts integer not null default 0,
  add column if not exists last_publish_attempt_at timestamptz,
  add column if not exists error_details jsonb,
  add column if not exists deleted_at timestamptz;

alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check check (status in (
  'draft', 'needs_approval', 'approved', 'scheduled', 'publishing',
  'published', 'failed', 'canceled'
));
alter table public.social_posts drop constraint if exists social_posts_approval_type_check;
alter table public.social_posts add constraint social_posts_approval_type_check
  check (approval_type in ('none', 'internal', 'client'));
alter table public.social_posts drop constraint if exists social_posts_approval_status_check;
alter table public.social_posts add constraint social_posts_approval_status_check check (approval_status in (
  'not_required', 'waiting', 'approved', 'changes_requested', 'rejected'
));
alter table public.social_posts drop constraint if exists social_posts_media_type_check;
alter table public.social_posts add constraint social_posts_media_type_check
  check (media_type in ('none', 'image', 'video', 'carousel'));

create index if not exists social_posts_customer_idx
  on public.social_posts (customer_id, scheduled_at desc);
create index if not exists social_posts_approval_idx
  on public.social_posts (approval_status, scheduled_at)
  where approval_status in ('waiting', 'changes_requested');

create table if not exists public.social_post_platforms (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null check (platform in (
    'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google_business'
  )),
  platform_status text not null default 'draft' check (platform_status in (
    'draft', 'scheduled', 'publishing', 'published', 'failed', 'canceled'
  )),
  external_post_id text,
  external_url text,
  published_at timestamptz,
  error_message text,
  metrics_last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, platform)
);

create table if not exists public.social_post_approvals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  decision text not null check (decision in ('requested', 'approved', 'changes_requested', 'rejected')),
  approval_type text not null check (approval_type in ('internal', 'client')),
  actor text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists social_post_approvals_post_idx
  on public.social_post_approvals (post_id, created_at desc);

create table if not exists public.social_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null,
  idempotency_key text not null unique,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('queued', 'publishing', 'succeeded', 'failed', 'canceled')),
  provider_response jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.social_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  post_id uuid references public.social_posts(id) on delete cascade,
  platform text not null,
  captured_for date not null,
  reach integer,
  impressions integer,
  engagements integer,
  clicks integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  followers_gained integer,
  video_views integer,
  profile_visits integer,
  created_at timestamptz not null default now(),
  unique (social_account_id, post_id, captured_for)
);
create index if not exists social_analytics_period_idx
  on public.social_analytics_snapshots (captured_for desc, platform);

create table if not exists public.social_engagement_items (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  platform text not null,
  item_type text not null check (item_type in ('comment', 'mention', 'message', 'reply', 'review')),
  external_id text not null,
  author_name text,
  body text,
  external_url text,
  occurred_at timestamptz not null,
  unread boolean not null default true,
  needs_reply boolean not null default false,
  assigned_to text,
  resolved_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_id)
);

create table if not exists public.social_automation_settings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  automation_key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, automation_key)
);

create table if not exists public.social_activity_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  account_id uuid references public.social_accounts(id) on delete set null,
  post_id uuid references public.social_posts(id) on delete set null,
  event_type text not null,
  platform text,
  actor text,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists social_activity_recent_idx
  on public.social_activity_events (created_at desc);

do $$
declare t text;
begin
  foreach t in array array[
    'social_post_platforms', 'social_post_approvals', 'social_publish_attempts',
    'social_analytics_snapshots', 'social_engagement_items',
    'social_automation_settings', 'social_activity_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_admin_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'social_post_platforms', 'social_engagement_items', 'social_automation_settings'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

commit;
