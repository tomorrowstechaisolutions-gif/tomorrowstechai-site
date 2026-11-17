-- Member portal, Phase 2: "Get help" requests from signed-in members.
-- Members never touch this table directly: the server inserts and reads for
-- the verified member's customer only. Admins manage everything.
create table if not exists public.portal_requests (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  member_id   uuid references public.portal_members(id) on delete set null,
  category    text not null default 'question' check (category in ('question', 'change', 'problem', 'billing', 'cancel')),
  subject     text not null,
  message     text not null,
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   text
);
create index if not exists portal_requests_customer_idx on public.portal_requests (customer_id, created_at desc);
alter table public.portal_requests enable row level security;
drop policy if exists portal_requests_admin_all on public.portal_requests;
create policy portal_requests_admin_all on public.portal_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.portal_requests from anon;
