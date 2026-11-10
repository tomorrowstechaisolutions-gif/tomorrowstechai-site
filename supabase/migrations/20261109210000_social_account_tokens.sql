-- Social Center publishing credentials.
--
-- One row per connected social account (a Facebook Page, an Instagram
-- Business account, a LinkedIn member). Same security posture as
-- integration_credentials: RLS on with NO policy, so an admin session cannot
-- read it at all — only the service role in server routes can. Token values
-- are additionally AES-256-GCM encrypted by src/lib/security/secrets.ts
-- (INTEGRATION_ENCRYPTION_KEY), so a dump or backup does not hand anyone a
-- working token.
--
-- social_accounts stays the public-safe record (who is connected, status,
-- expiry). This table holds the secret half and is deleted with the account.
begin;

create table if not exists public.social_account_tokens (
  social_account_id uuid primary key references public.social_accounts(id) on delete cascade,
  provider          text not null check (provider in ('meta', 'linkedin')),
  access_token      text not null,
  refresh_token     text,
  token_expires_at  timestamptz,
  scope             text,
  -- The provider's id for the person who granted access (LinkedIn member
  -- sub, Meta user id). Lets a reconnect be matched to the same account.
  provider_user_id  text,
  connected_by      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.social_account_tokens enable row level security;
revoke all on public.social_account_tokens from anon, authenticated;

drop trigger if exists social_account_tokens_touch on public.social_account_tokens;
create trigger social_account_tokens_touch before update on public.social_account_tokens
  for each row execute function public.touch_updated_at();

commit;
