-- ═══════════════════════════════════════════════════════════════════════════
-- Partner Center — organisations that are more than a client.
--
-- ROMAR Press is three relationships at once, and each already has a home
-- except the last two:
--
--   client          customers / client_services / invoices   (exists — $29/mo)
--   white-label     partner_work_orders  → jobs              (new)
--   revenue share   partner_settlements  → revenue_events    (new)
--
-- A partner is DATA. Nothing here names ROMAR; a second partner is a second
-- row in partner_connections, not a code change.
--
-- Secrets are not stored here. The API key a partner issued to Tomorrow's
-- Tech AI lives in a server environment variable named by `api_key_env`, so a
-- database read never yields a working credential.
--
-- Money: the partner's API deliberately never exposes its fees, margins or
-- other sales. What we record is what WE are owed and paid, per sale:
-- sale, processing fee, net, our share %, our share, their share. When the
-- Stripe Connect split is live the rows arrive from the partner's settlement
-- feed; until then they can be entered by hand. Either way a paid settlement
-- writes ONE revenue_events row (external_id = settlement ref), so the
-- existing dashboards count it exactly once.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_connections (
  id                      uuid primary key default gen_random_uuid(),
  partner_key             text not null unique,            -- 'romar-press'
  name                    text not null,
  company_id              uuid references public.companies(id) on delete set null,
  customer_id             uuid references public.customers(id) on delete set null,
  website_id              uuid references public.websites(id)  on delete set null,

  -- Their integration API.
  api_base_url            text,                            -- https://www.romarpress.com
  api_key_env             text,                            -- 'ROMAR_API_KEY'
  status                  text not null default 'pending_configuration'
                            check (status in ('pending_configuration', 'active', 'paused', 'disabled')),

  -- The commercial terms, as agreed. Shown on screen and used by the ledger.
  relationship            text[] not null default '{}',    -- {client, white_label, revenue_share, conference}
  our_share_pct           numeric(5,2) not null default 60.00
                            check (our_share_pct >= 0 and our_share_pct <= 100),
  fee_basis               text not null default 'processing_only'
                            check (fee_basis in ('processing_only', 'processing_and_direct', 'gross')),
  settlement_method       text not null default 'stripe_connect_on_sale'
                            check (settlement_method in ('stripe_connect_on_sale', 'monthly_statement', 'manual')),
  terms_notes             text,
  agreement_signed_on     date,

  last_sync_at            timestamptz,
  last_sync_ok            boolean,
  last_sync_error         text,
  last_sync_count         integer,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.partner_work_orders (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid not null references public.partner_connections(id) on delete cascade,
  external_id             text not null,                   -- romar_service_order_id
  order_code              text,
  service                 text,
  campaign_type           text,
  scope                   text,
  partner_status          text,                            -- their status, mirrored
  platforms               text[] not null default '{}',
  posts_per_week          integer,
  starts_on               date,
  ends_on                 date,
  renews_on               date,
  external_author_id      text,
  author_name             text,
  external_book_id        text,
  book_title              text,
  brief                   text,
  -- Campaign ids, when the partner's feed includes them: [{id, name, status}]
  campaigns               jsonb not null default '[]'::jsonb,
  -- The project it became in this admin.
  job_id                  uuid references public.jobs(id) on delete set null,
  raw                     jsonb not null default '{}'::jsonb,
  first_seen_at           timestamptz not null default now(),
  last_synced_at          timestamptz not null default now(),
  removed_at              timestamptz,                     -- no longer in their feed
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (partner_id, external_id)
);

create index if not exists partner_work_orders_partner_idx
  on public.partner_work_orders (partner_id, first_seen_at desc);
create index if not exists partner_work_orders_job_idx
  on public.partner_work_orders (job_id) where job_id is not null;

create table if not exists public.partner_settlements (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid not null references public.partner_connections(id) on delete cascade,
  work_order_id           uuid references public.partner_work_orders(id) on delete set null,
  -- Stripe transfer id, or the partner's settlement id, or a manual ref.
  external_ref            text not null,
  source                  text not null default 'manual'
                            check (source in ('stripe_connect', 'partner_feed', 'manual')),
  description             text,
  currency                text not null default 'usd',
  sale_cents              integer not null check (sale_cents >= 0),
  fee_cents               integer not null default 0 check (fee_cents >= 0),
  net_cents               integer generated always as (sale_cents - fee_cents) stored,
  share_pct               numeric(5,2) not null check (share_pct >= 0 and share_pct <= 100),
  our_share_cents         integer not null check (our_share_cents >= 0),
  partner_share_cents     integer not null check (partner_share_cents >= 0),
  sold_at                 timestamptz not null default now(),
  status                  text not null default 'pending'
                            check (status in ('pending', 'paid', 'reversed', 'partially_reversed')),
  paid_at                 timestamptz,
  reversed_cents          integer not null default 0 check (reversed_cents >= 0),
  revenue_event_id        uuid references public.revenue_events(id) on delete set null,
  notes                   text,
  created_by              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (partner_id, external_ref),
  constraint partner_settlements_fee_le_sale check (fee_cents <= sale_cents),
  constraint partner_settlements_split_adds_up
    check (our_share_cents + partner_share_cents = sale_cents - fee_cents)
);

create index if not exists partner_settlements_partner_sold_idx
  on public.partner_settlements (partner_id, sold_at desc);

-- updated_at
drop trigger if exists partner_connections_touch on public.partner_connections;
create trigger partner_connections_touch before update on public.partner_connections
  for each row execute function public.touch_updated_at();
drop trigger if exists partner_work_orders_touch on public.partner_work_orders;
create trigger partner_work_orders_touch before update on public.partner_work_orders
  for each row execute function public.touch_updated_at();
drop trigger if exists partner_settlements_touch on public.partner_settlements;
create trigger partner_settlements_touch before update on public.partner_settlements
  for each row execute function public.touch_updated_at();

-- RLS: admins only, anon revoked. Same posture as meetings.
do $$
declare t text;
begin
  foreach t in array array['partner_connections', 'partner_work_orders', 'partner_settlements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ROMAR Press — the first partner. Linked to the records created for it.
insert into public.partner_connections (
  partner_key, name, company_id, customer_id, website_id,
  api_base_url, api_key_env, status, relationship,
  our_share_pct, fee_basis, settlement_method, terms_notes
)
select
  'romar-press', 'ROMAR Press',
  (select id from public.companies where name = 'ROMAR Press' limit 1),
  (select id from public.customers where email = 'robitaille@romarpress.com' limit 1),
  (select id from public.websites where name = 'Romarpress Site' limit 1),
  'https://www.romarpress.com', 'ROMAR_API_KEY', 'pending_configuration',
  array['client', 'white_label', 'revenue_share', 'conference'],
  60.00, 'processing_only', 'stripe_connect_on_sale',
  'Tomorrow''s Tech AI fulfils marketing for ROMAR Press and its authors under ROMAR''s brand. '
  || 'Each sale is split at the time of sale via Stripe Connect (ROMAR = platform): '
  || '60% Tomorrow''s Tech AI / 40% ROMAR of the sale after payment-processing fees. '
  || 'Website & backend management billed separately at $29/month.'
on conflict (partner_key) do nothing;
