-- ---------------------------------------------------------------------
-- App reports — what each of our own products says about itself.
--
-- Read the header of 20260910120000_apps.sql first. That migration left two
-- things undone on purpose, and this is where they get done:
--
--   "app_users — an app's OWN end users live in that app's database … The
--    Users tab reads a summary through an integration when one is connected."
--   "app_analytics_daily — nothing writes it … add the rollup table with the
--    sync job that fills it, not before."
--
-- The integration is a `report`: the product exposes one read-only,
-- key-protected endpoint (GET /api/portfolio/report) that answers with a
-- ttai.app-report/v1 snapshot, and src/lib/apps/report.ts pulls it hourly.
-- The contract is in src/lib/apps/report-contract.ts and the design is in
-- docs/superpowers/specs/2026-11-18-portfolio-app-reports-design.md.
--
-- WHAT IS STORED
--   app_reports        the snapshots as they arrived, newest wins. 30 days.
--   app_metrics_daily  one row per app per day, the last good pull of that
--                      day. This is the trend, and it is kept.
--   app_report_events  signups, upgrades, cancellations, failed payments.
--                      Deduplicated on the product's own event id. 180 days.
--   app_health_checks  (existing) gains rows with target 'report:<key>' for
--                      the health a product reports about its own pipelines.
--
-- WHAT IS NOT STORED, and never will be by this path
--   Names, emails, or anything a customer typed. An event carries a kind, a
--   time, a plan, an amount and a link back into the product's OWN admin,
--   where the person is visible behind that product's login. The rule from
--   the apps migration stands: copying another product's users in here would
--   duplicate personal data into a system with no consent for it.
--
--   Keys. The endpoint address and the NAME of the environment variable
--   holding the key live in app_integrations.metadata. The key itself is in
--   Vercel, exactly like partner_connections.api_key_env.
--
-- NULL IS NOT ZERO
--   Every metric column is nullable and null means "this product does not
--   measure this". Nothing may coalesce these to 0: a zero is a claim.
-- ---------------------------------------------------------------------

begin;

-- ── `report` becomes a kind of integration ───────────────────────────
alter table public.app_integrations
  drop constraint if exists app_integrations_provider_check;
alter table public.app_integrations
  add constraint app_integrations_provider_check
  check (provider in (
    'vercel', 'supabase', 'github', 'stripe', 'openai',
    'resend', 'twilio', 'google', 'meta', 'cloudflare',
    'sentry', 'uptime', 'other', 'report'));

-- ── app_reports ──────────────────────────────────────────────────────
-- The payload exactly as it passed validation. The screens read the newest
-- row per app; older rows exist so a strange number can be traced back to
-- the report that carried it.
create table if not exists public.app_reports (
  id            uuid primary key default gen_random_uuid(),
  app_id        uuid not null references public.apps(id) on delete cascade,
  -- When WE fetched it. Freshness is judged on this, never on generated_at,
  -- so a product with a wrong clock cannot make a stale report look new.
  pulled_at     timestamptz not null default now(),
  -- When the product says it built it.
  generated_at  timestamptz not null,
  contract      text not null,
  livemode      boolean not null,
  currency      text not null,
  payload       jsonb not null
);

create index if not exists app_reports_latest_idx
  on public.app_reports (app_id, pulled_at desc);

-- ── app_metrics_daily ────────────────────────────────────────────────
-- One row per app per day (America/Chicago), upserted on every good pull so
-- the last pull of the day is what the day keeps. A day with no good pull
-- has no row: the trend shows a gap, it does not carry yesterday forward.
create table if not exists public.app_metrics_daily (
  app_id              uuid not null references public.apps(id) on delete cascade,
  day                 date not null,

  users_total         bigint,
  users_new_24h       bigint,
  users_new_7d        bigint,
  users_new_30d       bigint,
  active_7d           bigint,
  active_30d          bigint,
  paid_total          bigint,
  trialing            bigint,
  past_due            bigint,
  canceling           bigint,
  mrr_cents           bigint,
  collected_30d_cents bigint,
  feedback_open       bigint,
  ai_cost_30d_cents   bigint,

  extra               jsonb not null default '[]'::jsonb,
  livemode            boolean not null,
  currency            text not null,
  updated_at          timestamptz not null default now(),

  primary key (app_id, day)
);

-- ── app_report_events ────────────────────────────────────────────────
-- Named "report events" because `app_events` is already the app record's
-- own audit trail and the Activity tab reads that. These are things that
-- happened INSIDE the product.
create table if not exists public.app_report_events (
  id            uuid primary key default gen_random_uuid(),
  app_id        uuid not null references public.apps(id) on delete cascade,
  -- The product's own id for the event (a Stripe event id, 'signup:<id>').
  -- Unique per app, which is what makes pulling the same report twice free.
  external_id   text not null,
  kind          text not null check (kind in (
                  'signup', 'upgrade', 'downgrade', 'cancel',
                  'payment_failed', 'feedback')),
  occurred_at   timestamptz not null,
  -- Written by the product, generic, at most 140 characters. Never a name,
  -- an email, or text a customer typed.
  summary       text not null,
  plan          text,
  amount_cents  bigint check (amount_cents is null or amount_cents >= 0),
  -- A link into the product's own admin. Rendered as a link only when its
  -- host is one of the app's own; otherwise shown as text.
  url           text,
  created_at    timestamptz not null default now(),
  unique (app_id, external_id)
);

create index if not exists app_report_events_recent_idx
  on public.app_report_events (app_id, occurred_at desc);

-- ── RLS — the same deny-by-default posture as every other app_* table ─
do $$
declare t text;
begin
  foreach t in array array['app_reports', 'app_metrics_daily', 'app_report_events'] loop
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

-- ── Our own two products ─────────────────────────────────────────────
-- Registered here so nothing has to be clicked together by hand. Every
-- insert steps aside if the thing already exists: an app John already
-- registered under the same slug is left exactly as he set it up.

insert into public.apps (name, slug, description, ownership_type, platform_type, lifecycle_status, framework)
select 'Held', 'held',
       'Shared calendar and tasks for households and Circles, with AI suggestions that propose and never act.',
       'internal', 'web_mobile', 'live', 'Next.js'
where not exists (select 1 from public.apps where lower(slug) = 'held');

insert into public.apps (name, slug, description, ownership_type, platform_type, lifecycle_status, framework)
select 'Storyborn', 'storyborn',
       'Writing studio for authors: manuscripts, exports and publisher submissions.',
       'internal', 'web', 'live', 'Next.js'
where not exists (select 1 from public.apps where lower(slug) = 'storyborn');

-- A production environment, only where the app has none yet.
insert into public.app_environments (app_id, name, environment_type, is_production, url, hosting_provider)
select a.id, 'Production', 'production', true, v.url, 'vercel'
from (values ('held', 'https://myheldapp.com'), ('storyborn', 'https://storyborn.app')) as v(slug, url)
join public.apps a on lower(a.slug) = v.slug
where not exists (
  select 1 from public.app_environments e where e.app_id = a.id and e.is_production);

-- The report connection. 'not_configured' until a pull succeeds; the key
-- named here is read from the environment and never stored.
insert into public.app_integrations (app_id, provider, label, status, environment, account_ref, metadata)
select a.id, 'report', 'Business report', 'not_configured', 'production', v.host,
       jsonb_build_object(
         'endpoint_url', 'https://' || v.host || '/api/portfolio/report',
         'key_env', v.key_env)
from (values
        ('held', 'myheldapp.com', 'HELD_REPORT_KEY'),
        ('storyborn', 'storyborn.app', 'STORYBORN_REPORT_KEY')) as v(slug, host, key_env)
join public.apps a on lower(a.slug) = v.slug
on conflict (app_id, provider, environment) do nothing;

commit;
