-- ---------------------------------------------------------------------
-- 0012 — Hosting.
--
-- The shortest migration of the set, on purpose. Hosting is not a new
-- system; it is a different question asked of the system that already
-- exists. Migration 0010 built the record a hosting account would need,
-- and calling it `websites` does not make it less true:
--
--   websites              customer_id, domain, status, hosting_provider,
--                         registrar, owner, thumbnail_url
--   website_integrations  provider + account_ref  (the "project id")
--   website_deployments   deploy status and history
--   website_renewals      domain, hosting, SSL and support expiry
--   customers             mrr_cents, stripe_subscription_id, renews_at
--   invoices              what was billed, what was paid, what failed
--
-- A hosting_accounts table would copy about ten of those columns and then
-- disagree with them the first time one was updated and the other was not.
-- So there is no such table. The Hosting screen reads the same rows the
-- Websites screen reads and asks different questions of them.
--
-- Three things really were missing, and only those are added here.
-- ---------------------------------------------------------------------

-- ── 1. Which plan is this site on? ───────────────────────────────────
-- catalog_items already has a 'hosting' category and is already where
-- pricing lives; it just had no hosting rows and nothing pointed at them.
-- A single foreign key closes that, rather than a hosting_plans table that
-- would be catalog_items with a different name.
alter table public.websites
  add column if not exists hosting_plan_id uuid references public.catalog_items(id) on delete set null;

create index if not exists websites_plan_idx
  on public.websites (hosting_plan_id) where hosting_plan_id is not null;

-- ── 2. website_costs ─────────────────────────────────────────────────
-- What a site COSTS us, so profitability is arithmetic rather than a guess.
--
-- `expenses` already exists but is company-wide — a Vercel bill with no
-- site attached. That is the right shape for accounting and the wrong shape
-- for "is this $29 client profitable", which needs the cost apportioned to
-- one site. Both can be true at once; this table is the per-site view and
-- does not replace the ledger.
--
-- Every row carries an interval, because a $12 domain renewal and $20/month
-- of hosting are not comparable numbers until they are normalised, and the
-- normalising belongs in one place rather than in every caller.
create table if not exists public.website_costs (
  id            uuid primary key default gen_random_uuid(),
  website_id    uuid not null references public.websites(id) on delete cascade,

  label         text not null,
  category      text not null default 'infrastructure' check (category in (
                  'infrastructure', 'domain', 'ssl', 'storage', 'database',
                  'support', 'processing', 'software', 'other')),

  amount_cents  integer not null check (amount_cents >= 0),
  interval      text not null default 'monthly' check (interval in (
                  'monthly', 'annual', 'one_time')),

  vendor        text,
  notes         text,

  -- A cost that has stopped applying is ended, not deleted, so last
  -- quarter's margin does not silently change when this year's bill does.
  effective_from date not null default current_date,
  effective_to   date,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint website_costs_period_check check (effective_to is null or effective_to >= effective_from)
);

create index if not exists website_costs_site_idx
  on public.website_costs (website_id) where effective_to is null;

-- ── 3. website_incidents ─────────────────────────────────────────────
-- Something went wrong with a site, and when.
--
-- This is the table the "Sites With Issues" panel reads, and the one a
-- future uptime checker, SSL checker or deploy webhook writes into. Until
-- one of those exists the rows are entered by hand, which is honest: the
-- panel shows problems somebody actually recorded rather than implying a
-- monitor that is not watching.
create table if not exists public.website_incidents (
  id            uuid primary key default gen_random_uuid(),
  website_id    uuid not null references public.websites(id) on delete cascade,

  kind          text not null check (kind in (
                  'site_down', 'slow_performance', 'ssl_expiring', 'ssl_expired',
                  'domain_expiring', 'failed_deployment', 'database_error',
                  'backup_failure', 'payment_issue', 'integration_error', 'other')),

  severity      text not null default 'medium' check (severity in (
                  'critical', 'high', 'medium', 'low')),

  status        text not null default 'open' check (status in (
                  'open', 'acknowledged', 'resolved', 'ignored')),

  title         text not null,
  detail        text,

  -- Who noticed. 'monitor' rows are written by an automated check; 'manual'
  -- by a person. Keeping them apart means the screen can say which problems
  -- were actually detected versus merely logged.
  source        text not null default 'manual' check (source in (
                  'manual', 'monitor', 'deployment', 'billing', 'integration')),

  detected_at   timestamptz not null default now(),
  resolved_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint website_incidents_resolved_check
    check (status <> 'resolved' or resolved_at is not null)
);

create index if not exists website_incidents_open_idx
  on public.website_incidents (website_id, severity) where status in ('open', 'acknowledged');
create index if not exists website_incidents_recent_idx
  on public.website_incidents (detected_at desc);

-- ── updated_at ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['website_costs', 'website_incidents'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['website_costs', 'website_incidents'] loop
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

-- ── The hosting plans ────────────────────────────────────────────────
-- Into catalog_items, where every other priced thing already lives, so the
-- Catalog screen and the Hosting screen cannot disagree about what a plan
-- costs. Prices match what the site and the ad campaign already promise:
-- hosting from $29/month after launch.
insert into public.catalog_items (name, category, description, billing, from_cents, position, active)
select v.name, 'hosting', v.description, 'monthly', v.cents, v.position, true
from (values
  ('Starter hosting',  'Hosting, SSL, backups and uptime for a single small site.', 2900, 60),
  ('Pro hosting',      'Hosting and management for a business site, with content updates included.', 4900, 61),
  ('Business hosting', 'Hosting for a larger site or web app, with priority support and monthly changes.', 9900, 62)
) as v(name, description, cents, position)
where not exists (
  select 1 from public.catalog_items c where c.category = 'hosting' and c.name = v.name
);
