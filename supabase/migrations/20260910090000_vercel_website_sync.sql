-- Allow the server-only integrations vault to hold the Vercel connection.
-- Authenticated browser sessions still have no policy and cannot read tokens.
begin;

alter table public.integration_credentials
  drop constraint if exists integration_credentials_provider_check;

alter table public.integration_credentials
  add constraint integration_credentials_provider_check
  check (provider in ('google', 'zoom', 'vercel'));

alter table public.integration_credentials
  add column if not exists account_ref text;

commit;
