-- Owner notifications: which emails John wants, and a record of each one.
--
-- notification_preferences: one row per notification key that has been
--   changed from its default. No row = the catalog default (on).
-- notification_log: every owner notification, sent, skipped (turned off)
--   or failed, so the Notifications page can show what actually went out.
-- Both are admin-only: RLS on, read by the server's service role.

create table if not exists public.notification_preferences (
  key text primary key,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  channel text not null default 'email' check (channel in ('email')),
  status text not null check (status in ('sent', 'skipped', 'failed')),
  summary text,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_created_idx on public.notification_log (created_at desc);
create index if not exists notification_log_key_idx on public.notification_log (key, created_at desc);

alter table public.notification_preferences enable row level security;
alter table public.notification_log enable row level security;
