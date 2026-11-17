-- Member portal, Phase 1: who may sign in to /account, and which client
-- record they belong to.
--
-- Security model: Supabase Auth holds the login (email + password). A login
-- means nothing on its own: every portal read goes through
-- public.portal_customer_id(), which returns a customer id only for a login
-- that John invited (a row here, not disabled). Admin access is unchanged
-- (admin_users / is_admin()). A portal member is never an admin.

create table if not exists public.portal_members (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  user_id       uuid unique references auth.users(id) on delete set null,
  email         text not null,
  full_name     text,
  status        text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  invited_at    timestamptz,
  invited_by    text,
  invite_count  integer not null default 0,
  activated_at  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists portal_members_email_key on public.portal_members (lower(email));
create index if not exists portal_members_customer_idx on public.portal_members (customer_id);

alter table public.portal_members enable row level security;

drop policy if exists portal_members_admin_all on public.portal_members;
create policy portal_members_admin_all on public.portal_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists portal_members_self_select on public.portal_members;
create policy portal_members_self_select on public.portal_members
  for select to authenticated using (user_id = (select auth.uid()) and status <> 'disabled');

-- The customer id the signed-in member may see, or null. Security definer so
-- policies on other tables can call it without granting portal_members reads.
create or replace function public.portal_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.customer_id
  from public.portal_members m
  where m.user_id = auth.uid() and m.status <> 'disabled'
  limit 1
$$;

revoke all on function public.portal_customer_id() from public, anon;
grant execute on function public.portal_customer_id() to authenticated;

-- A member may read their own client record (business name, contact info).
drop policy if exists customers_portal_self_select on public.customers;
create policy customers_portal_self_select on public.customers
  for select to authenticated using (id = public.portal_customer_id());

revoke all on public.portal_members from anon;
