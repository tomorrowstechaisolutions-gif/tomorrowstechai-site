-- Summaries of each admin's conversations with Tess: one per day, per week
-- (starting Monday) and per month. Written by the server from the saved
-- conversations; each admin can read only their own.
--
-- Safe to run more than once.

create table if not exists public.ai_chat_summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  period       text not null check (period in ('day', 'week', 'month')),
  period_start date not null,
  summary      text not null,
  lines        integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, period, period_start)
);
create index if not exists ai_chat_summaries_user_idx on public.ai_chat_summaries (user_id, period, period_start desc);

alter table public.ai_chat_summaries enable row level security;
drop policy if exists ai_chat_summaries_admin_select on public.ai_chat_summaries;
create policy ai_chat_summaries_admin_select on public.ai_chat_summaries
  for select to authenticated using (public.is_admin() and user_id = auth.uid());
