-- ---------------------------------------------------------------------
-- 0010 — the website portfolio.
--
-- Read this before adding anything here, because the temptation with a
-- websites module is to build a second copy of the business.
--
-- WHAT ALREADY EXISTED, and is NOT duplicated:
--   jobs       — the BUILD. site_url, project_type, package, stage,
--                launched_at, value_cents, owner, next_milestone. A site
--                under construction is a job and stays one.
--   customers  — the OWNER. mrr_cents, stripe_subscription_id, renews_at,
--                renewal_amount_cents. Hosting revenue is already here and
--                is already synced from Stripe.
--   leads      — attribution. landing_page is what ties a lead to a site.
--   seo_*      — the audit. Per-site SEO reads through websites.base_url.
--
-- So `websites` is deliberately thin. It exists for the one thing jobs
-- cannot express: a site OUTLIVES the project that built it, and one
-- customer can own several. It carries identity and operational state —
-- what it is, where it lives, who owns it, is it healthy — and nothing
-- that another table already owns.
--
-- NOT created, on purpose:
--   website_analytics_daily  — nothing writes it. No GA4, no Plausible, no
--                              analytics credential exists in this project.
--                              An empty daily-rollup table is a promise the
--                              system cannot keep; add it with the sync job
--                              that fills it, not before.
--   website_pages            — seo_pages already records every page of a
--                              crawl, keyed by path. A second page table
--                              would drift from it the first time one was
--                              written and the other was not.
--   website_forms /
--   website_form_submissions — leads IS the submission table, with source,
--                              campaign, utm and landing_page already on it.
--                              A form is identified by where it posted from.
--   website_maintenance /
--   website_requests         — tasks already exists, with lead_id and job_id.
--                              These become a website_id on tasks when the
--                              maintenance screen is actually built, not a
--                              parallel task system.
--   website_ai_recommendations — ai_actions is the propose/review/approve
--                              queue for the whole business and already
--                              enforces it in a constraint.
--   monthly_revenue on websites — derived from the customer's subscription.
--                              A stored copy is a number that was true once.
-- ---------------------------------------------------------------------

-- ── websites ─────────────────────────────────────────────────────────
-- One row per site we built, host, monitor or maintain — including our own.
create table if not exists public.websites (
  id            uuid primary key default gen_random_uuid(),

  -- Who it belongs to. Null means it is ours (tomorrowstechai.com and the
  -- other properties we run for ourselves), which is a real and common case.
  customer_id   uuid references public.customers(id) on delete set null,

  -- The build that produced it, when there was one. Sites we took over from
  -- another agency have no job, and that is not an error.
  job_id        uuid references public.jobs(id) on delete set null,

  name          text not null,

  -- Bare host, no scheme, no www, lowercase. Enforced by the app, indexed
  -- unique below so the same site cannot be added twice under two spellings.
  domain        text not null,

  -- The URL to actually fetch when auditing or checking health. Usually
  -- https://<domain>, but a site can live on a subpath or a preview host.
  base_url      text,

  status        text not null default 'development' check (status in (
                  'live', 'development', 'waiting_on_client', 'review',
                  'maintenance', 'paused', 'issue', 'archived')),

  website_type  text not null default 'business' check (website_type in (
                  'business', 'ecommerce', 'web_app', 'saas', 'portfolio',
                  'landing_page', 'client_portal', 'membership', 'other')),

  -- Where it is hosted and deployed from. Free text on purpose: this is a
  -- label until an integration row proves the connection.
  hosting_provider text,
  registrar        text,

  thumbnail_url text,
  owner         text,
  launched_at   timestamptz,
  notes         text,

  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per real site. Case- and www-insensitive because "Example.com"
-- and "www.example.com" are the same website and adding both is the most
-- likely way this table gets dirty.
create unique index if not exists websites_domain_idx
  on public.websites (lower(regexp_replace(domain, '^www\.', '')));

create index if not exists websites_customer_idx
  on public.websites (customer_id) where customer_id is not null;
create index if not exists websites_status_idx
  on public.websites (status) where is_archived = false;

-- ── website_integrations ─────────────────────────────────────────────
-- The honest answer to "is this wired up?", one row per site per provider.
--
-- This table is what lets the screen say "Analytics not connected" and mean
-- it. No row means not connected. A row with status 'connected' and a recent
-- last_synced_at means the data on screen is real. Nothing else on the
-- website screens is allowed to imply a connection that has no row here.
--
-- NO SECRETS. account_ref holds a display identifier only — a GA4 property
-- id, a Vercel project name, a Search Console site URL. Tokens live in
-- environment variables on the server and never in this database.
create table if not exists public.website_integrations (
  id            uuid primary key default gen_random_uuid(),
  website_id    uuid not null references public.websites(id) on delete cascade,
  provider      text not null check (provider in (
                  'vercel', 'supabase', 'google_analytics', 'search_console',
                  'google_business', 'meta_pixel', 'stripe', 'resend',
                  'uptime', 'pagespeed', 'other')),
  status        text not null default 'disconnected' check (status in (
                  'connected', 'warning', 'disconnected', 'error')),
  account_ref   text,
  last_synced_at timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists website_integrations_unique_idx
  on public.website_integrations (website_id, provider);

-- ── website_deployments ──────────────────────────────────────────────
-- The abstraction layer for deployment history.
--
-- Deliberately shaped like Vercel's deployment object, because that is the
-- provider this project actually deploys through, so connecting it later is
-- a fetch loop and a column mapping rather than a redesign. Stays empty
-- until a VERCEL token exists, and the panel says "no deployment data"
-- rather than inventing a build.
create table if not exists public.website_deployments (
  id            uuid primary key default gen_random_uuid(),
  website_id    uuid not null references public.websites(id) on delete cascade,
  provider      text not null default 'vercel',
  external_id   text,
  environment   text not null default 'production' check (environment in (
                  'production', 'preview', 'staging', 'development')),
  status        text not null default 'success' check (status in (
                  'success', 'building', 'failed', 'canceled')),
  url           text,
  git_branch    text,
  commit_sha    text,
  commit_message text,
  deployed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists website_deployments_recent_idx
  on public.website_deployments (website_id, deployed_at desc);
create unique index if not exists website_deployments_external_idx
  on public.website_deployments (provider, external_id)
  where external_id is not null;

-- ── website_renewals ─────────────────────────────────────────────────
-- customers.renews_at answers "when does this client's subscription bill?".
-- It cannot answer "when does this domain expire?" — a site has a domain
-- renewal, a hosting renewal and sometimes an SSL or support renewal, on
-- different dates, sometimes to different vendors. That is what this holds.
--
-- Subscription renewals are NOT copied in here. Those stay on the customer,
-- synced from Stripe, and the screen unions the two.
create table if not exists public.website_renewals (
  id            uuid primary key default gen_random_uuid(),
  website_id    uuid not null references public.websites(id) on delete cascade,
  kind          text not null check (kind in (
                  'domain', 'hosting', 'maintenance', 'saas', 'support', 'ssl')),
  renews_at     date not null,
  amount_cents  integer check (amount_cents >= 0),
  vendor        text,
  auto_renew    boolean,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists website_renewals_due_idx
  on public.website_renewals (renews_at);

-- ── updated_at ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'websites', 'website_integrations', 'website_renewals'
  ] loop
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
    'websites', 'website_integrations', 'website_deployments', 'website_renewals'
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
