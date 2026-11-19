-- ---------------------------------------------------------------------
-- App reports: Pool Business AI.
--
-- Read 20261118060000_app_reports.sql first. This registers one more of
-- our own products, the same way Held, Storyborn and SplicePoint were:
-- the app, its production environment, and its report connection. The
-- key is named here and read from the environment; it is never stored.
--
-- Every insert steps aside if the row already exists. Additive only.
-- ---------------------------------------------------------------------

begin;

insert into public.apps (name, slug, description, ownership_type, platform_type, lifecycle_status, framework)
select 'Pool Business AI', 'poolbusinessai',
       'Operating system for pool service companies: technician, client and admin apps, with tiered memberships.',
       'internal', 'web_mobile', 'live', 'Other'
where not exists (select 1 from public.apps where lower(slug) = 'poolbusinessai');

insert into public.app_environments (app_id, name, environment_type, is_production, url, hosting_provider)
select a.id, 'Production', 'production', true, 'https://poolbusinessai.com', 'vercel'
from public.apps a
where lower(a.slug) = 'poolbusinessai'
  and not exists (
    select 1 from public.app_environments e where e.app_id = a.id and e.is_production)
on conflict do nothing;

insert into public.app_integrations (app_id, provider, label, status, environment, account_ref, metadata)
select a.id, 'report', 'Business report', 'not_configured', 'production', 'poolbusinessai.com',
       jsonb_build_object(
         'endpoint_url', 'https://poolbusinessai.com/api/portfolio/report',
         'key_env', 'POOLBUSINESSAI_REPORT_KEY')
from public.apps a
where lower(a.slug) = 'poolbusinessai'
on conflict (app_id, provider, environment) do nothing;

commit;
