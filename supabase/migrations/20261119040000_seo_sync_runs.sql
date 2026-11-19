-- Search Console sync log.
--
-- One row per run of the Search Console import (daily cron or "Sync now"),
-- whether it worked or not. The Integrations card and the SEO screen report
-- from the latest row, so "Connected" means a sync actually succeeded rather
-- than that keys exist. Holds no credentials: only when it ran, how many rows
-- it saved, and the error text if it failed.

create table if not exists public.seo_sync_runs (
  id          uuid primary key default gen_random_uuid(),
  source      text not null default 'search_console'
                check (source in ('search_console')),
  trigger     text not null default 'cron'
                check (trigger in ('cron', 'manual')),
  actor       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean not null,
  rows        integer not null default 0,
  start_date  date,
  end_date    date,
  error       text
);

create index if not exists seo_sync_runs_recent_idx
  on public.seo_sync_runs (source, started_at desc);

-- Same posture as the other seo_ tables: RLS on, admins may read. Writes come
-- from the server with the service role, so there is no insert policy.
alter table public.seo_sync_runs enable row level security;

drop policy if exists seo_sync_runs_admin_select on public.seo_sync_runs;
create policy seo_sync_runs_admin_select on public.seo_sync_runs
  for select to authenticated using (public.is_admin());

revoke all on public.seo_sync_runs from anon;
