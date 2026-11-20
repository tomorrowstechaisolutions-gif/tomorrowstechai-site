-- Tess's profile: one row per admin.
--
-- The mode and dials he picked for how she talks to him, what he wrote about
-- himself, what she has learned about him, and the ideas she parked. Personal,
-- so: admins can read it, and only the server (service role) writes it.
--
-- Safe to run more than once.

create table if not exists public.ai_tess_profile (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  mode       text not null default 'brief' check (mode in ('brief', 'chat', 'lift', 'focus', 'create')),
  length     text not null default 'medium' check (length in ('short', 'medium', 'long')),
  bluntness  text not null default 'straight' check (bluntness in ('gentle', 'straight', 'blunt')),
  pushback   text not null default 'firm' check (pushback in ('light', 'firm', 'hard')),
  about      text not null default '',
  learned    jsonb not null default '[]'::jsonb,
  parked     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ai_tess_profile enable row level security;
drop policy if exists ai_tess_profile_admin_select on public.ai_tess_profile;
create policy ai_tess_profile_admin_select on public.ai_tess_profile
  for select to authenticated using (public.is_admin() and user_id = auth.uid());
