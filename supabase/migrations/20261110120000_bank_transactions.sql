-- Bank feed (Mercury) — the cash source of truth for Finance.
--
-- Synced read-only from the Mercury API by /api/cron/bank-sync (and the
-- "Sync now" button). Amounts are signed integer cents: + money in, − money
-- out. `finance_class` is what Finance counts a row as; the sync sets an
-- automatic class, and `class_override` (set by an admin on the Finance page)
-- always wins and is never touched by the sync.
begin;

create table if not exists public.bank_accounts (
  id                 text primary key,           -- Mercury account id
  source             text not null default 'mercury',
  name               text not null,
  kind               text,                         -- checking | savings | creditCard …
  last4              text,
  available_cents    bigint,
  current_cents      bigint,
  status             text,
  synced_at          timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id                 text primary key,           -- Mercury transaction id
  source             text not null default 'mercury',
  account_id         text references public.bank_accounts(id) on delete cascade,
  amount_cents       bigint not null,
  status             text not null,               -- pending | sent | cancelled | failed
  kind               text,
  counterparty       text,
  bank_description   text,
  note               text,
  bank_category      text,                         -- the category set in Mercury
  posted_at          timestamptz,
  bank_created_at    timestamptz not null,
  dashboard_link     text,
  auto_class         text not null check (auto_class in ('revenue', 'expense', 'transfer', 'ignore')),
  class_override     text check (class_override in ('revenue', 'expense', 'transfer', 'ignore')),
  finance_class      text generated always as (coalesce(class_override, auto_class)) stored,
  raw                jsonb not null default '{}'::jsonb,
  synced_at          timestamptz not null default now()
);

create index if not exists bank_transactions_date_idx on public.bank_transactions (coalesce(posted_at, bank_created_at) desc);
create index if not exists bank_transactions_class_idx on public.bank_transactions (finance_class, status);

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists bank_accounts_admin_all on public.bank_accounts;
create policy bank_accounts_admin_all on public.bank_accounts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists bank_transactions_admin_all on public.bank_transactions;
create policy bank_transactions_admin_all on public.bank_transactions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.bank_accounts from anon;
revoke all on public.bank_transactions from anon;

commit;
