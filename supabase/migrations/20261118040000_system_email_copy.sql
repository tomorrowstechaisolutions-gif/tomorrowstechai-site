-- Edited wording for system emails (the System emails page).
-- One row per email key; `copy` holds only the slots John changed. No row
-- means the email uses its shipped wording. Admin-only (service role).

create table if not exists public.system_email_copy (
  key text primary key,
  copy jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.system_email_copy enable row level security;
