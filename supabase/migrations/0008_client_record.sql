-- ---------------------------------------------------------------------
-- 0008 — the client record.
--
-- `customers` already existed and the Stripe webhook already fills it. What
-- it could not answer was everything the Clients screen is for: where they
-- are, who owns the relationship, when the subscription next bills, and
-- whether they are happy.
--
-- Three of those are new columns. The fourth is its own table, because
-- satisfaction is a history, not a field — "4.8 this month" is meaningless
-- without the ratings behind it and the dates they were given.
--
-- NOT added, on purpose:
--   health_score — derived per request in src/lib/clients/health.ts from
--                  signals that already exist (subscription state, unpaid
--                  invoices, projects past due, contact recency, latest
--                  rating). A stored score is a number that was true once.
--   last_activity_at — the activity feed already unions the event tables;
--                  a denormalised copy would drift the first time a webhook
--                  wrote to one and not the other.
-- ---------------------------------------------------------------------

alter table public.customers
  -- Location. Free text rather than a lookup: this is a Texas contractor
  -- business, not a CRM that needs ISO subdivisions.
  add column if not exists city          text,
  add column if not exists state         text,
  -- What kind of business they are. Same vocabulary as leads.business_type,
  -- copied across when the lead converts.
  add column if not exists business_type text,
  -- Who owns the relationship. Text, not a user FK — today that is one
  -- person, and a hard FK would need a users table before it earns one.
  add column if not exists owner         text,
  add column if not exists tags          text[] not null default '{}',
  -- Both synced from Stripe by the webhook. Null means no subscription, or
  -- one Stripe has not told us about yet — the UI says "no renewal", never
  -- invents a date.
  add column if not exists renews_at            timestamptz,
  add column if not exists renewal_amount_cents integer not null default 0,
  add column if not exists notes_internal       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_renewal_amount_check') then
    alter table public.customers
      add constraint customers_renewal_amount_check check (renewal_amount_cents >= 0);
  end if;
end $$;

create index if not exists customers_renewal_idx
  on public.customers (renews_at) where status = 'active';
create index if not exists customers_location_idx
  on public.customers (state, city) where state is not null;

-- ── client_satisfaction ──────────────────────────────────────────────
-- One row per time someone actually asked. The Clients screen averages the
-- most recent rating per client, so a client rated once a year ago does not
-- keep voting in this month's average.
create table if not exists public.client_satisfaction (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  note        text,
  -- What prompted it: the 30-day check-in, a launch, an ad-hoc conversation.
  occasion    text not null default 'check_in' check (occasion in (
                'check_in', 'launch', 'support', 'renewal', 'ad_hoc')),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists client_satisfaction_customer_idx
  on public.client_satisfaction (customer_id, recorded_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.client_satisfaction enable row level security;

drop policy if exists client_satisfaction_admin_select on public.client_satisfaction;
drop policy if exists client_satisfaction_admin_insert on public.client_satisfaction;
drop policy if exists client_satisfaction_admin_update on public.client_satisfaction;
drop policy if exists client_satisfaction_admin_delete on public.client_satisfaction;

create policy client_satisfaction_admin_select on public.client_satisfaction
  for select to authenticated using (public.is_admin());
create policy client_satisfaction_admin_insert on public.client_satisfaction
  for insert to authenticated with check (public.is_admin());
create policy client_satisfaction_admin_update on public.client_satisfaction
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy client_satisfaction_admin_delete on public.client_satisfaction
  for delete to authenticated using (public.is_admin());

revoke all on public.client_satisfaction from anon;

-- ── Backfill ─────────────────────────────────────────────────────────
-- Every existing customer came from a lead, and that lead already recorded
-- what kind of business it is. Carry it across rather than asking again.
update public.customers c
   set business_type = l.business_type
  from public.leads l
 where c.lead_id = l.id
   and c.business_type is null
   and l.business_type is not null;
