-- ---------------------------------------------------------------------
-- App reports: two more kinds of event, and SplicePoint.
--
-- Read 20261118060000_app_reports.sql first.
--
-- 1. `lead` and `application` join the kinds of thing a product can report
--    in its activity feed. Held and Storyborn sell themselves; SplicePoint
--    and Pool Business AI are sold by reps and staffed through a careers
--    page, so "a demo was requested" and "someone applied" are the events
--    that matter there. The same rule holds as for every other event: a
--    kind, a time and a generic summary. Never who.
--
-- 2. SplicePoint is registered the same way Held and Storyborn were, and
--    every insert steps aside if the row already exists.
--
-- Additive only. Nothing existing is changed or removed.
-- ---------------------------------------------------------------------

begin;

alter table public.app_report_events
  drop constraint if exists app_report_events_kind_check;
alter table public.app_report_events
  add constraint app_report_events_kind_check
  check (kind in (
    'signup', 'upgrade', 'downgrade', 'cancel',
    'payment_failed', 'feedback', 'lead', 'application'));

insert into public.apps (name, slug, description, ownership_type, platform_type, lifecycle_status, framework)
select 'SplicePoint', 'splicepoint',
       'Field workflow for fiber construction crews: projects, splicing, inspection and reporting.',
       'internal', 'web', 'live', 'Next.js'
where not exists (select 1 from public.apps where lower(slug) = 'splicepoint');

insert into public.app_environments (app_id, name, environment_type, is_production, url, hosting_provider)
select a.id, 'Production', 'production', true, 'https://splicepoint.app', 'vercel'
from public.apps a
where lower(a.slug) = 'splicepoint'
  and not exists (
    select 1 from public.app_environments e where e.app_id = a.id and e.is_production)
on conflict do nothing;

insert into public.app_integrations (app_id, provider, label, status, environment, account_ref, metadata)
select a.id, 'report', 'Business report', 'not_configured', 'production', 'splicepoint.app',
       jsonb_build_object(
         'endpoint_url', 'https://splicepoint.app/api/portfolio/report',
         'key_env', 'SPLICEPOINT_REPORT_KEY')
from public.apps a
where lower(a.slug) = 'splicepoint'
on conflict (app_id, provider, environment) do nothing;

commit;
