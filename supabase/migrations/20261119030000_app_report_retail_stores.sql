-- ---------------------------------------------------------------------
-- App reports: two more kinds of event, and the two retail stores.
--
-- Read 20261118060000_app_reports.sql first.
--
-- 1. `order` and `refund` join the kinds of thing a product can report in
--    its activity feed. The four products registered so far sell
--    subscriptions; a store sells one order at a time, so "an order came
--    in" and "a refund went out" are the events that matter there. The
--    same rule holds as for every other event: a kind, a time, an amount
--    and a generic summary. Never who.
--
-- 2. Proudly Texan and Dark Tides Supply are registered the same way the
--    other products were: the app, its production environment, and its
--    report connection. The key is named here and read from the
--    environment; it is never stored. Each address is the canonical host
--    of the store, because the pull does not follow redirects.
--
-- Every insert steps aside if the row already exists. Additive only.
-- ---------------------------------------------------------------------

begin;

alter table public.app_report_events
  drop constraint if exists app_report_events_kind_check;
alter table public.app_report_events
  add constraint app_report_events_kind_check
  check (kind in (
    'signup', 'upgrade', 'downgrade', 'cancel',
    'payment_failed', 'feedback', 'lead', 'application',
    'order', 'refund'));

-- ── Proudly Texan ────────────────────────────────────────────────────

insert into public.apps (name, slug, description, ownership_type, platform_type, lifecycle_status, framework)
select 'Proudly Texan', 'proudlytexan',
       'Retail store: Texas-pride apparel and gifts printed on demand through Printful, plus gift cards and digital downloads.',
       'internal', 'web', 'live', 'Next.js'
where not exists (select 1 from public.apps where lower(slug) = 'proudlytexan');

insert into public.app_environments (app_id, name, environment_type, is_production, url, hosting_provider)
select a.id, 'Production', 'production', true, 'https://www.proudlytexan.com', 'vercel'
from public.apps a
where lower(a.slug) = 'proudlytexan'
  and not exists (
    select 1 from public.app_environments e where e.app_id = a.id and e.is_production)
on conflict do nothing;

insert into public.app_integrations (app_id, provider, label, status, environment, account_ref, metadata)
select a.id, 'report', 'Business report', 'not_configured', 'production', 'proudlytexan.com',
       jsonb_build_object(
         'endpoint_url', 'https://www.proudlytexan.com/api/portfolio/report',
         'key_env', 'PROUDLYTEXAN_REPORT_KEY')
from public.apps a
where lower(a.slug) = 'proudlytexan'
on conflict (app_id, provider, environment) do nothing;

-- ── Dark Tides Supply ────────────────────────────────────────────────

insert into public.apps (name, slug, description, ownership_type, platform_type, lifecycle_status, framework)
select 'Dark Tides Supply', 'darktidessupply',
       'Retail store: pirate-history apparel printed on demand through Printful, digital pirate books, and the Dark Tides Society membership.',
       'internal', 'web', 'live', 'Other'
where not exists (select 1 from public.apps where lower(slug) = 'darktidessupply');

insert into public.app_environments (app_id, name, environment_type, is_production, url, hosting_provider)
select a.id, 'Production', 'production', true, 'https://darktidessupply.com', 'vercel'
from public.apps a
where lower(a.slug) = 'darktidessupply'
  and not exists (
    select 1 from public.app_environments e where e.app_id = a.id and e.is_production)
on conflict do nothing;

insert into public.app_integrations (app_id, provider, label, status, environment, account_ref, metadata)
select a.id, 'report', 'Business report', 'not_configured', 'production', 'darktidessupply.com',
       jsonb_build_object(
         'endpoint_url', 'https://darktidessupply.com/api/portfolio/report',
         'key_env', 'DARKTIDESSUPPLY_REPORT_KEY')
from public.apps a
where lower(a.slug) = 'darktidessupply'
on conflict (app_id, provider, environment) do nothing;

commit;
