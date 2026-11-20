-- Cron run log: one row per run of a scheduled job, whether it worked or not.
--
-- Every route under /api/cron goes through withCronRun (src/lib/cron/run.ts),
-- which writes a row when the job finishes: which cron, when it started and
-- finished, how long it took, whether it answered OK, a short JSON summary of
-- what it returned, and the error text if it failed. Admin → System status
-- reads the latest row per cron (src/lib/cron/queries.ts), so "Automations"
-- can say which job last failed instead of only that a secret is set.
--
-- A run that the platform kills at its time limit never reaches the write, so
-- it leaves no row. A missing row for a cron that should have run is the
-- signal for that case.
--
-- Retention: rows are kept for 30 days. There is no cleanup job; withCronRun
-- deletes anything older on roughly 1 run in 50. The app works without this
-- migration applied: the write fails, is logged once, and the cron carries on.
--
-- Same posture as seo_sync_runs: RLS on, admins may read. Writes and the
-- prune come from the server with the service role, so there is no insert,
-- update or delete policy.

create table if not exists public.cron_runs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  started_at  timestamptz not null,
  finished_at timestamptz,
  duration_ms int,
  ok          boolean not null,
  summary     jsonb,
  error       text
);

create index if not exists cron_runs_name_started_idx
  on public.cron_runs (name, started_at desc);

alter table public.cron_runs enable row level security;

drop policy if exists cron_runs_admin_select on public.cron_runs;
create policy cron_runs_admin_select on public.cron_runs
  for select to authenticated using (public.is_admin());

revoke all on public.cron_runs from anon;
