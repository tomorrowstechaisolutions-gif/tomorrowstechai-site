-- PostgREST can target a full unique index for deployment upserts. NULL
-- external IDs remain repeatable under PostgreSQL's normal UNIQUE semantics.
begin;

drop index if exists public.website_deployments_external_idx;

create unique index website_deployments_external_idx
  on public.website_deployments (provider, external_id);

commit;
