-- ---------------------------------------------------------------------
-- Apps — the application portfolio.
--
-- Read the header of 0010_websites.sql before this one. The same discipline
-- applies and for the same reason: the temptation with an "apps" module is to
-- build a second copy of the business inside it.
--
-- WHY THIS IS NOT `websites`
--   websites is keyed on a unique DOMAIN and is deliberately thin — identity,
--   ownership and operational state for a site we host or maintain. An app is
--   a different object: it can be a mobile binary with no domain at all, it
--   runs in SEVERAL environments at once, it has a repository, a database and
--   a release version, and its deployments matter individually. Forcing that
--   onto a table whose primary key is a hostname would either break the
--   unique domain index or leave half the columns null for every marketing
--   site. So: a separate table, and websites is left exactly as it is.
--
-- WHAT ALREADY EXISTED, and is NOT duplicated:
--   customers   — the CLIENT. mrr_cents, stripe_subscription_id, status.
--   jobs        — the BUILD (the admin calls these Projects). An app under
--                 construction is a job and stays one.
--   catalog_items / client_services — the SERVICE it was sold as, and the
--                 per-client assignment with its agreed price and billing.
--   invoices / invoice_items / invoice_payments — the MONEY. This migration
--                 adds one nullable app_id to invoices so an invoice can be
--                 attributed to an app; it does not build a billing engine.
--   tasks       — the WORK. 0010 said a website_id would go on tasks when
--                 the screen that needed it was actually built. This is that
--                 moment for apps: tasks gets app_id, not a parallel table.
--   admin_users — the PEOPLE. Owners are stored as email text so a
--                 contractor who has no admin account is still expressible.
--   integration_credentials — the server-only token vault from 0020. Vercel
--                 already lives there; github and supabase are added to its
--                 provider list here. NO TOKEN IS EVER STORED ANYWHERE ELSE.
--
-- NOT created, on purpose:
--   app_clients / app_projects / app_services — those are customer_id,
--                 job_id and service_id on `apps`.
--   app_tasks / app_issues   — tasks.app_id, above. A bug is a task with
--                 type = 'development' and priority = 'critical'; a second
--                 task system would drift from the first one within a week.
--   app_invoices / app_subscriptions / app_revenue — invoices.app_id and
--                 client_services. A stored revenue total is a number that
--                 was true once.
--   app_users / app_user_sessions — an app's OWN end users live in that
--                 app's database, not in this one. Copying them here would
--                 duplicate somebody else's personal data into a CRM with a
--                 different retention story and no consent for it. The Users
--                 tab reads a summary through an integration when one is
--                 connected, and says "not connected" when one is not.
--   app_analytics_daily — nothing writes it. Same rule as 0010: add the
--                 rollup table with the sync job that fills it, not before.
--   app_secrets / app_env_vars — environment variables are secrets. They
--                 stay in the hosting provider. This database stores only
--                 non-secret display identifiers (a project id, a region, a
--                 repository URL) and never a token, key or password.
-- ---------------------------------------------------------------------

begin;

-- ── apps ─────────────────────────────────────────────────────────────
create table if not exists public.apps (
  id              uuid primary key default gen_random_uuid(),

  name            text not null,
  -- What we call it internally when that differs from what the client
  -- calls it. Null is the normal case.
  internal_name   text,
  -- Short code used in URLs, sync matching and the app cell of the table.
  slug            text not null,
  description     text,
  logo_url        text,

  -- Who it belongs to. Null means it is ours, which is a real and common
  -- case here — the admin center itself is an app in this table.
  customer_id     uuid references public.customers(id)       on delete set null,
  -- The build that produced it, when there was one.
  job_id          uuid references public.jobs(id)            on delete set null,
  -- What it was sold as, and the specific client assignment.
  service_id      uuid references public.catalog_items(id)   on delete set null,
  client_service_id uuid references public.client_services(id) on delete set null,

  ownership_type  text not null default 'internal' check (ownership_type in (
                    'internal', 'client', 'joint', 'white_label')),

  platform_type   text not null default 'web' check (platform_type in (
                    'web', 'ios', 'android', 'web_mobile', 'pwa',
                    'internal_tool', 'api')),

  lifecycle_status text not null default 'planning' check (lifecycle_status in (
                    'planning', 'development', 'qa', 'staging',
                    'live', 'paused', 'archived')),

  framework       text,
  -- The version believed to be live. Written by a deployment sync when one
  -- is connected, and by hand otherwise. Null until something says so.
  current_version text,

  -- Emails, not FKs to admin_users: the technical owner of a client app is
  -- sometimes not one of our admins, and a null FK cannot say that.
  technical_owner text,
  business_owner  text,

  -- ── Repository ──────────────────────────────────────────────────
  -- Identifiers only. The token that reads this repo is in the vault.
  repo_provider     text check (repo_provider in ('github', 'gitlab', 'bitbucket', 'other')),
  repo_url          text,
  repo_external_id  text,
  default_branch    text,
  production_branch text,

  -- ── Billing terms ───────────────────────────────────────────────
  -- These are the AGREED TERMS of the contract, not a measurement of
  -- revenue. What has actually been collected is derived from invoices and
  -- payments every time it is read, and the screens label the two
  -- differently on purpose.
  setup_fee_cents   integer check (setup_fee_cents   is null or setup_fee_cents   >= 0),
  monthly_fee_cents integer check (monthly_fee_cents is null or monthly_fee_cents >= 0),
  billing_type      text not null default 'none' check (billing_type in (
                      'none', 'one_time', 'recurring', 'usage_based', 'included')),
  billing_status    text not null default 'not_connected' check (billing_status in (
                      'not_connected', 'active', 'past_due', 'paused', 'cancelled')),
  -- Display reference for a Stripe subscription. Not a key.
  subscription_id   text,

  notes           text,

  is_archived     boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per real app. Case-insensitive so the same app cannot arrive
-- twice as "held" and "Held".
create unique index if not exists apps_slug_idx on public.apps (lower(slug));
create index if not exists apps_customer_idx on public.apps (customer_id) where customer_id is not null;
create index if not exists apps_status_idx   on public.apps (lifecycle_status) where is_archived = false;
create index if not exists apps_job_idx      on public.apps (job_id) where job_id is not null;

-- ── app_environments ─────────────────────────────────────────────────
-- Production, staging and development are rows, not columns, because an app
-- can have four of them and because each one has its own URL, branch,
-- database and health. Production is marked, not assumed: `is_production`
-- is what the screens gate destructive and revealing actions on.
create table if not exists public.app_environments (
  id                uuid primary key default gen_random_uuid(),
  app_id            uuid not null references public.apps(id) on delete cascade,
  name              text not null,
  environment_type  text not null default 'development' check (environment_type in (
                      'production', 'staging', 'development', 'preview')),
  is_production     boolean not null default false,

  url               text,
  api_base_url      text,
  branch            text,

  -- Display identifiers for where this environment runs. Never a token.
  hosting_provider    text,
  hosting_project_id  text,
  hosting_team_id     text,
  database_provider   text,
  database_project_id text,
  database_region     text,

  current_version   text,

  -- 'unknown' is the default and stays the default until a check runs.
  -- Nothing in this system is allowed to default to healthy.
  -- The same four words the application uses, so a value can never be
  -- written that the screen has no label for.
  health_status     text not null default 'unknown' check (health_status in (
                      'healthy', 'warning', 'critical', 'unknown')),
  last_checked_at   timestamptz,
  last_deployed_at  timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists app_environments_name_idx
  on public.app_environments (app_id, lower(name));
-- At most one production environment per app. Two would make "open
-- production" an ambiguous button.
create unique index if not exists app_environments_one_production_idx
  on public.app_environments (app_id) where is_production;

-- ── app_integrations ─────────────────────────────────────────────────
-- The honest answer to "is this wired up?", one row per app per provider
-- per environment.
--
-- No row means NOT CONNECTED, and every screen is required to read it that
-- way. A row with status 'connected' and a recent last_checked_at is the
-- only thing that entitles a panel to show provider data.
--
-- NO SECRETS. account_ref is a display identifier — a Vercel project id, a
-- Supabase project ref, a repository full name. metadata is for non-secret
-- descriptive facts (a region, a framework, a plan name) and the app layer
-- must never write a token into it. Tokens live in integration_credentials,
-- which has RLS on and deliberately no policy, so no browser session can
-- read it at all.
create table if not exists public.app_integrations (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references public.apps(id) on delete cascade,
  environment_id  uuid references public.app_environments(id) on delete set null,
  provider        text not null check (provider in (
                    'vercel', 'supabase', 'github', 'stripe', 'openai',
                    'resend', 'twilio', 'google', 'meta', 'cloudflare',
                    'sentry', 'uptime', 'other')),
  label           text,
  status          text not null default 'not_configured' check (status in (
                    'connected', 'needs_attention', 'disconnected', 'not_configured')),
  environment     text not null default 'all' check (environment in (
                    'all', 'production', 'staging', 'development', 'preview')),
  account_ref     text,
  owner           text,
  last_checked_at timestamptz,
  error           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists app_integrations_unique_idx
  on public.app_integrations (app_id, provider, environment);

-- ── app_deployments ──────────────────────────────────────────────────
-- Shaped like Vercel's deployment object, for the same reason 0010 shaped
-- website_deployments that way: that is the provider this business actually
-- deploys through, so connecting it is a fetch loop and a column mapping
-- rather than a redesign.
--
-- It stays EMPTY until a sync fills it, and the Deployments tab says "no
-- deployment data" rather than inventing a build. Nothing writes a fake
-- success row here.
create table if not exists public.app_deployments (
  id                uuid primary key default gen_random_uuid(),
  app_id            uuid not null references public.apps(id) on delete cascade,
  environment_id    uuid references public.app_environments(id) on delete set null,
  provider          text not null default 'vercel',
  external_deployment_id text,
  environment       text not null default 'production' check (environment in (
                      'production', 'staging', 'development', 'preview')),
  status            text not null check (status in (
                      'success', 'building', 'queued', 'failed', 'canceled')),
  version           text,
  branch            text,
  commit_sha        text,
  commit_message    text,
  commit_url        text,
  deployment_url    text,
  logs_url          text,
  triggered_by      text,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  duration_ms       integer check (duration_ms is null or duration_ms >= 0),
  created_at        timestamptz not null default now()
);

create index if not exists app_deployments_recent_idx
  on public.app_deployments (app_id, started_at desc);
create unique index if not exists app_deployments_external_idx
  on public.app_deployments (provider, external_deployment_id)
  where external_deployment_id is not null;

-- ── app_domains ──────────────────────────────────────────────────────
-- Domains belong to an environment, not to an app: app.example.com and
-- staging.example.com are the same app and different things.
--
-- This does not duplicate the websites module. A `websites` row is a site
-- we manage as a product; this is a hostname an application answers on.
-- Where both are true, the app screen links across rather than copying.
create table if not exists public.app_domains (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references public.apps(id) on delete cascade,
  environment_id  uuid references public.app_environments(id) on delete set null,
  website_id      uuid references public.websites(id) on delete set null,
  domain          text not null,
  environment     text not null default 'production' check (environment in (
                    'production', 'staging', 'development', 'preview')),
  provider        text,
  is_primary      boolean not null default false,
  redirect_to     text,
  -- 'unknown' until something checked. Never defaults to valid.
  ssl_status      text not null default 'unknown' check (ssl_status in (
                    'valid', 'expiring', 'invalid', 'unknown')),
  ssl_expires_at  timestamptz,
  verified        boolean,
  verification_note text,
  expires_at      date,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists app_domains_unique_idx
  on public.app_domains (app_id, lower(domain));
create index if not exists app_domains_app_idx on public.app_domains (app_id);

-- ── app_health_checks ────────────────────────────────────────────────
-- One row per check per run. The Health tab aggregates the most recent row
-- per (app, environment, check_type, target); older rows are the history.
--
-- A check_type with NO row is reported as Unknown, which is a distinct and
-- honest state. Missing data is never rendered as healthy.
create table if not exists public.app_health_checks (
  id                uuid primary key default gen_random_uuid(),
  app_id            uuid not null references public.apps(id) on delete cascade,
  environment_id    uuid references public.app_environments(id) on delete set null,
  check_type        text not null check (check_type in (
                      'application', 'hosting', 'database', 'api',
                      'domain_ssl', 'background_jobs', 'integration')),
  -- Which specific thing was checked: a URL, a provider name, a job name.
  target            text,
  status            text not null check (status in (
                      'healthy', 'warning', 'critical', 'unknown')),
  response_time_ms  integer check (response_time_ms is null or response_time_ms >= 0),
  message           text,
  checked_at        timestamptz not null default now()
);

create index if not exists app_health_checks_recent_idx
  on public.app_health_checks (app_id, checked_at desc);
create index if not exists app_health_checks_type_idx
  on public.app_health_checks (app_id, check_type, checked_at desc);

-- ── app_incidents ────────────────────────────────────────────────────
-- Something went wrong, when it started, and whether it is over. An
-- incident is opened by a check or by a person and closed deliberately —
-- a failing check that stops failing does not silently erase its history.
create table if not exists public.app_incidents (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references public.apps(id) on delete cascade,
  environment_id  uuid references public.app_environments(id) on delete set null,
  severity        text not null default 'medium' check (severity in (
                    'critical', 'high', 'medium', 'low')),
  incident_type   text not null default 'other' check (incident_type in (
                    'deployment', 'hosting', 'database', 'api', 'domain',
                    'integration', 'application', 'billing', 'other')),
  message         text not null,
  detail          text,
  status          text not null default 'open' check (status in (
                    'open', 'monitoring', 'resolved')),
  started_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     text,
  opened_by       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (resolved_at is null or resolved_at >= started_at),
  -- Resolved means resolved: a row cannot claim to be closed with no date.
  check ((status = 'resolved') = (resolved_at is not null))
);

create index if not exists app_incidents_open_idx
  on public.app_incidents (app_id, started_at desc) where status <> 'resolved';

-- ── app_events ───────────────────────────────────────────────────────
-- The app's own audit trail, in the same shape as job_events and
-- service_events so the dashboard's existing activity union can read it
-- without a new abstraction.
create table if not exists public.app_events (
  id          uuid primary key default gen_random_uuid(),
  app_id      uuid not null references public.apps(id) on delete cascade,
  kind        text not null default 'note' check (kind in (
                'created', 'updated', 'status_change', 'deployment',
                'domain', 'integration', 'health', 'incident',
                'client_change', 'version', 'billing', 'archived', 'note')),
  body        text not null,
  actor       text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists app_events_recent_idx
  on public.app_events (app_id, created_at desc);

-- ── The links onto tables that already exist ─────────────────────────
-- 0010 promised these would be columns rather than parallel systems.

-- Work on an app is a task, with everything the Tasks board already gives
-- it: status, priority, assignee, due date, templates and automation.
alter table public.tasks
  add column if not exists app_id uuid references public.apps(id) on delete set null;
create index if not exists tasks_app_idx on public.tasks (app_id) where app_id is not null;

-- An invoice can be attributed to an app. Nullable, because most invoices
-- are not: the Revenue tab falls back to the app's client and service when
-- nothing is explicitly linked, and says which basis it used.
alter table public.invoices
  add column if not exists app_id uuid references public.apps(id) on delete set null;
create index if not exists invoices_app_idx on public.invoices (app_id) where app_id is not null;

-- The vault gains two more providers. Its RLS posture is unchanged: on,
-- with no policy, so nothing but the service role can read a token.
alter table public.integration_credentials
  drop constraint if exists integration_credentials_provider_check;
alter table public.integration_credentials
  add constraint integration_credentials_provider_check
  check (provider in ('google', 'zoom', 'vercel', 'github', 'supabase'));

-- Sync finds projects on a provider that no app claims. Most of them are
-- real apps waiting to be registered; some are scratch projects nobody
-- wants listed. "Ignore" has to survive the next sync or it is not a
-- decision, it is a dismissal — so the ignored references live here, on the
-- connection they belong to, rather than in a table of their own.
alter table public.integration_credentials
  add column if not exists ignored_refs text[] not null default '{}';

-- ── updated_at ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'apps', 'app_environments', 'app_integrations',
    'app_domains', 'app_incidents'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- Archiving is a status, and the two ways of saying it must not disagree.
--
-- lifecycle_status is the source of truth and is_archived is derived from
-- it — EXCEPT when a caller flips is_archived on its own, in which case the
-- flag is clearly what they meant and it decides instead. Getting this
-- backwards makes un-archiving impossible: setting the status back to live
-- while the stale flag is still true would silently re-archive the row.
create or replace function public.apps_sync_archive()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.lifecycle_status = 'archived' or new.is_archived then
      new.lifecycle_status := 'archived';
      new.is_archived := true;
      new.archived_at := coalesce(new.archived_at, now());
    else
      new.is_archived := false;
      new.archived_at := null;
    end if;
    return new;
  end if;

  if new.is_archived is distinct from old.is_archived then
    -- Somebody moved the flag deliberately.
    if new.is_archived then
      new.lifecycle_status := 'archived';
    elsif new.lifecycle_status = 'archived' then
      -- Un-archived without being told what it became. Paused is the
      -- honest resting state: it is back, and nobody is working on it.
      new.lifecycle_status := 'paused';
    end if;
  else
    new.is_archived := (new.lifecycle_status = 'archived');
  end if;

  if new.is_archived then
    new.archived_at := coalesce(old.archived_at, new.archived_at, now());
  else
    new.archived_at := null;
  end if;

  return new;
end $$;

drop trigger if exists apps_archive_sync on public.apps;
create trigger apps_archive_sync
  before insert or update on public.apps
  for each row execute function public.apps_sync_archive();

-- ── RLS — same deny-by-default posture as every other table here ─────
do $$
declare t text;
begin
  foreach t in array array[
    'apps', 'app_environments', 'app_integrations', 'app_deployments',
    'app_domains', 'app_health_checks', 'app_incidents', 'app_events'
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

commit;
