-- ---------------------------------------------------------------------
-- 0006 — the upsell catalog.
--
-- The seven upgrades were already named on the landing page and already had
-- matching buckets in revenue_events.category. What was missing was anywhere
-- to price them and any way to actually take the money.
--
-- Prices here are a REFERENCE ("from"), not what gets charged. John quotes
-- custom work per job, so the real amount is typed when the link is sent.
-- Storing a from_cents that the checkout ignores is deliberate: it stops a
-- stale catalog price from ever being charged to somebody.
-- ---------------------------------------------------------------------
create table if not exists public.catalog_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Same vocabulary as revenue_events.category, so an upsell lands in the
  -- right bucket on the campaign dashboard without a translation table.
  category    text not null default 'other' check (category in (
                'launch_package', 'hosting', 'crm', 'ai_automation',
                'custom_app', 'ecommerce', 'dashboard', 'social',
                'marketing', 'development', 'other')),
  description text,
  billing     text not null default 'one_time' check (billing in ('one_time', 'monthly')),
  from_cents  integer not null default 0 check (from_cents >= 0),
  active      boolean not null default true,
  position    integer not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists catalog_items_name_key on public.catalog_items (lower(name));
create index if not exists catalog_items_order_idx on public.catalog_items (active, position);

drop trigger if exists catalog_items_touch on public.catalog_items;
create trigger catalog_items_touch before update on public.catalog_items
  for each row execute function public.touch_updated_at();

-- One invoices table covers both kinds of sale. The launch package uses
-- launch_cents/hosting_cents because those are fixed; an upsell uses
-- amount_cents because it is quoted.
alter table public.invoices
  add column if not exists kind text not null default 'launch',
  add column if not exists catalog_item_id uuid references public.catalog_items(id) on delete set null,
  add column if not exists amount_cents integer not null default 0,
  add column if not exists billing text not null default 'one_time',
  add column if not exists description text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_kind_check') then
    alter table public.invoices add constraint invoices_kind_check check (kind in ('launch', 'upsell'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoices_billing_check') then
    alter table public.invoices add constraint invoices_billing_check check (billing in ('one_time', 'monthly'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoices_amount_check') then
    alter table public.invoices add constraint invoices_amount_check check (amount_cents >= 0);
  end if;
end $$;

alter table public.catalog_items enable row level security;

drop policy if exists catalog_items_admin_select on public.catalog_items;
drop policy if exists catalog_items_admin_insert on public.catalog_items;
drop policy if exists catalog_items_admin_update on public.catalog_items;
drop policy if exists catalog_items_admin_delete on public.catalog_items;

create policy catalog_items_admin_select on public.catalog_items
  for select to authenticated using (public.is_admin());
create policy catalog_items_admin_insert on public.catalog_items
  for insert to authenticated with check (public.is_admin());
create policy catalog_items_admin_update on public.catalog_items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy catalog_items_admin_delete on public.catalog_items
  for delete to authenticated using (public.is_admin());

revoke all on public.catalog_items from anon;

-- Seed: the seven upgrades from the landing page, plus three things listed
-- under "not included" that are worth selling. Every from_cents below is a
-- PLACEHOLDER for John to set.
insert into public.catalog_items (name, category, description, billing, from_cents, position) values
  ('Full CRM',               'crm',           'Pipelines, automations, assignment rules and reporting on top of the starter list.', 'one_time', 150000, 10),
  ('AI agents & assistants', 'ai_automation', 'A trained assistant that answers, qualifies and routes.', 'one_time', 250000, 20),
  ('Custom automation',      'ai_automation', 'The repetitive parts of your week, running themselves.', 'one_time', 100000, 30),
  ('Custom applications',    'custom_app',    'Software built around how your business actually works.', 'one_time', 500000, 40),
  ('E-commerce',             'ecommerce',     'Products, cart, checkout, fulfillment and inventory.', 'one_time', 250000, 50),
  ('Advanced dashboard',     'dashboard',     'The full command center — jobs, crews, revenue, forecasting.', 'one_time', 200000, 60),
  ('Social management',      'social',        'Content calendar, assets and publishing.', 'monthly', 60000, 70),
  ('Ad management',          'marketing',     'Campaign builds, creative, budget and reporting. Ad spend billed separately.', 'monthly', 75000, 80),
  ('Extra pages & copy',     'development',   'Pages beyond the five in the launch package, written and built.', 'one_time', 25000, 90),
  ('Photo & video',          'other',         'On-site photography or video for the site.', 'one_time', 75000, 100)
on conflict do nothing;
