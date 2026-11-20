-- Business settings: the defaults edited on Admin → Settings.
--
-- One row per settings group (today only 'business_defaults'): the payment
-- terms and wording a new invoice starts with, how long a proposal stays
-- open, the Google review link and ask gap, and the lead follow-up timings.
-- No row = the values built into the code.
--
-- Admin-only, same as notification_preferences: RLS on with no policy, so
-- only the server's service role can read or write it.

create table if not exists public.business_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.business_settings enable row level security;

revoke all on public.business_settings from anon, authenticated;
