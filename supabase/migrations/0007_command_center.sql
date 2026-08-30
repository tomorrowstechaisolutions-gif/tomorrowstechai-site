-- ---------------------------------------------------------------------
-- 0007 — the Business Command Center.
--
-- Everything the /admin dashboard needs that the campaign schema did not
-- already carry. The rule here was: do not duplicate a table that exists.
--
-- NOT created, on purpose:
--   projects   — `jobs` already IS the delivery record. It is widened below
--                with project_type / value / owner / next_milestone instead
--                of standing up a second table that would immediately drift.
--   clients    — `customers` already covers this.
--   campaigns  — `campaign_spend` already keys by campaign name, and
--                `ad_creatives` carries the creative side.
--   activities — the feed is a UNION over lead_events, job_events,
--                revenue_events and invoices. A third copy of those rows
--                would just be a cache that goes stale.
--   notifications — the alert centre is DERIVED from live data (overdue
--                invoices, stale leads, jobs past due). Storing alerts means
--                storing alerts that are no longer true.
-- ---------------------------------------------------------------------

-- ── jobs → projects ──────────────────────────────────────────────────
-- The $399 launch package is one product line; the company sells eleven.
-- A job keeps its delivery stages and checklist and simply gains the fields
-- an executive view needs.
alter table public.jobs
  add column if not exists project_type   text not null default 'website',
  add column if not exists value_cents    integer not null default 0,
  add column if not exists owner          text,
  add column if not exists next_milestone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_project_type_check') then
    alter table public.jobs add constraint jobs_project_type_check
      check (project_type in (
        'website', 'app', 'ai_system', 'crm', 'automation', 'branding',
        'ecommerce', 'saas', 'custom_software', 'consulting', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_value_check') then
    alter table public.jobs add constraint jobs_value_check check (value_cents >= 0);
  end if;
end $$;

create index if not exists jobs_due_idx on public.jobs (due_at) where completed_at is null;

-- ── tasks ────────────────────────────────────────────────────────────
-- The "Today" card. Deliberately one flat table rather than one per module:
-- a follow-up call, a project deadline and an invoice chase all land in the
-- same list because that is how the day is actually worked.
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  notes       text,
  kind        text not null default 'task' check (kind in (
                'task', 'followup', 'meeting', 'callback', 'deadline',
                'invoice', 'content', 'other')),
  priority    text not null default 'medium'
                check (priority in ('low', 'medium', 'high', 'critical')),
  due_at      timestamptz,
  done        boolean not null default false,
  done_at     timestamptz,
  owner       text,
  -- Optional links back into whatever the task is about. All nullable: a
  -- task is allowed to be just a task.
  lead_id     uuid references public.leads(id)      on delete cascade,
  job_id      uuid references public.jobs(id)       on delete cascade,
  customer_id uuid references public.customers(id)  on delete cascade,
  invoice_id  uuid references public.invoices(id)   on delete cascade,
  -- 'ai' means an AI proposed it and a human kept it. AI never writes here
  -- without passing through ai_actions first.
  source      text not null default 'manual' check (source in ('manual', 'ai', 'system')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_open_idx on public.tasks (done, due_at);
create index if not exists tasks_lead_idx on public.tasks (lead_id) where lead_id is not null;
create index if not exists tasks_job_idx  on public.tasks (job_id)  where job_id  is not null;

-- ── ai_insights ──────────────────────────────────────────────────────
-- What the dashboard shows in the AI Insights strip.
--
-- generated_by='rule' rows are written by the deterministic engine in
-- src/lib/dashboard/insights.ts and are recomputed per request, so they are
-- NOT stored. This table exists for 'ai' rows — the ones a model produced,
-- which cost money and should not be regenerated on every page view.
create table if not exists public.ai_insights (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'opportunity' check (kind in (
                 'opportunity', 'action', 'marketing', 'revenue', 'risk', 'system')),
  title        text not null,
  body         text not null,
  severity     text not null default 'medium'
                 check (severity in ('low', 'medium', 'high', 'critical')),
  -- Where clicking the insight should take you.
  href         text,
  -- The numbers the insight was drawn from, so a stale one can be spotted.
  metric       jsonb not null default '{}'::jsonb,
  generated_by text not null default 'ai' check (generated_by in ('rule', 'ai')),
  model        text,
  status       text not null default 'new' check (status in ('new', 'seen', 'dismissed')),
  valid_until  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists ai_insights_live_idx
  on public.ai_insights (status, created_at desc);

-- ── ai_actions ───────────────────────────────────────────────────────
-- The propose → review → approve queue.
--
-- This is the guardrail the whole AI architecture rests on: an AI writes a
-- ROW here, it does not perform the act. Nothing consequential — an email,
-- a published post, a campaign change, a deletion, a dollar of ad spend —
-- happens until status flips to 'approved' by a named admin.
create table if not exists public.ai_actions (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in (
                 'send_email', 'send_sms', 'publish_social', 'create_campaign',
                 'change_campaign', 'change_budget', 'update_lead', 'update_project',
                 'create_task', 'draft_proposal', 'delete_record', 'other')),
  title        text not null,
  summary      text,
  -- Exactly what would be done, in a shape the executor understands.
  payload      jsonb not null default '{}'::jsonb,
  target_table text,
  target_id    uuid,
  status       text not null default 'proposed' check (status in (
                 'proposed', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  risk         text not null default 'medium' check (risk in ('low', 'medium', 'high')),
  proposed_by  text not null default 'ai' check (proposed_by in ('ai', 'rule', 'human')),
  model        text,
  rationale    text,
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  executed_at  timestamptz,
  result       jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ai_actions_queue_idx on public.ai_actions (status, created_at desc);

-- An approved action must name who approved it. Enforced here rather than in
-- application code so no future route can quietly approve on its own.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_actions_reviewed_check') then
    alter table public.ai_actions add constraint ai_actions_reviewed_check
      check (status not in ('approved', 'rejected') or reviewed_by is not null);
  end if;
end $$;

-- ── social_accounts ──────────────────────────────────────────────────
-- One row per connected profile. `connected` is the honest answer to "is
-- this wired up?" — the dashboard shows a channel as live only when a row
-- here says so, so an unconfigured account can never render as healthy.
--
-- No access tokens live in this table. It is read by admin pages; secrets
-- belong in environment variables or Supabase Vault, not in a row a
-- dashboard query selects *.
create table if not exists public.social_accounts (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null check (platform in (
                    'facebook', 'instagram', 'linkedin', 'tiktok',
                    'youtube', 'google_business')),
  handle          text,
  display_name    text,
  external_id     text,
  connected       boolean not null default false,
  status          text not null default 'disconnected' check (status in (
                    'connected', 'expired', 'disconnected', 'error')),
  -- Last known figures, refreshed by whatever sync job connects the API.
  -- Null (not zero) means "never synced" so the UI can say so.
  followers       integer,
  reach_30d       integer,
  engagement_30d  integer,
  clicks_30d      integer,
  leads_30d       integer,
  stats_updated_at timestamptz,
  token_expires_at timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists social_accounts_platform_key
  on public.social_accounts (platform, coalesce(handle, ''));

-- ── social_posts ─────────────────────────────────────────────────────
create table if not exists public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references public.social_accounts(id) on delete set null,
  platform      text not null check (platform in (
                  'facebook', 'instagram', 'linkedin', 'tiktok',
                  'youtube', 'google_business')),
  body          text not null default '',
  media_url     text,
  link_url      text,
  scheduled_at  timestamptz,
  published_at  timestamptz,
  status        text not null default 'draft' check (status in (
                  'draft', 'needs_approval', 'scheduled', 'published', 'failed')),
  external_id   text,
  external_url  text,
  campaign      text,
  generated_by  text not null default 'human' check (generated_by in ('human', 'ai')),
  -- An AI-written post that is going out has to point at the approval it
  -- came through.
  ai_action_id  uuid references public.ai_actions(id) on delete set null,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists social_posts_schedule_idx
  on public.social_posts (scheduled_at) where status in ('scheduled', 'needs_approval');

-- ── expenses ─────────────────────────────────────────────────────────
-- Ad spend already lives in campaign_spend and is NOT duplicated here; the
-- finance panel adds the two together. Everything else the business pays
-- for goes here.
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  date not null default (now() at time zone 'America/Chicago')::date,
  category     text not null default 'other' check (category in (
                 'software', 'contractor', 'hardware', 'hosting',
                 'fees', 'marketing', 'travel', 'other')),
  vendor       text,
  description  text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  recurring    boolean not null default false,
  notes        text,
  external_id  text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (occurred_at desc);

-- ── updated_at triggers ──────────────────────────────────────────────
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists ai_actions_touch on public.ai_actions;
create trigger ai_actions_touch before update on public.ai_actions
  for each row execute function public.touch_updated_at();

drop trigger if exists social_accounts_touch on public.social_accounts;
create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function public.touch_updated_at();

drop trigger if exists social_posts_touch on public.social_posts;
create trigger social_posts_touch before update on public.social_posts
  for each row execute function public.touch_updated_at();

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ── RLS — same deny-by-default posture as every other table here ─────
do $$
declare t text;
begin
  foreach t in array array[
    'tasks', 'ai_insights', 'ai_actions', 'social_accounts', 'social_posts', 'expenses'
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

    -- PostgREST grants pulled from anon, so an unauthenticated caller gets
    -- "permission denied" rather than a convincing empty list.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
