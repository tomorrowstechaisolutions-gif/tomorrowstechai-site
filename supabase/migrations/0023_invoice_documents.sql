-- ---------------------------------------------------------------------
-- 0023 — the invoice becomes a document.
--
-- `invoices` has existed since 0004, but only as "one row per payment link
-- we sent". That was enough while every sale was a fixed package with a
-- Stripe button on it. It is not enough for the way the work actually runs:
--
--     proposal → both parties accept → the work happens → the invoice
--
-- So the invoice is now the LAST document in the chain, not a side effect of
-- a checkout link. It carries its own number, its own client-facing page at a
-- private token, its own line items, and its own payment history — and it can
-- bill a one-time build, a monthly hosting line, or both at once.
--
-- Nothing here breaks the old rows. Every existing invoice keeps its
-- launch_cents/hosting_cents/amount_cents and gains a number, a token and a
-- total backfilled from what it already said. `source` records where each
-- one came from so the screen can be honest about which are real documents
-- and which are checkout links raised by a webhook.
--
-- Money still lives in cents. revenue_events is still the ledger; this is
-- still not an accounting system. What changed is that an invoice can now be
-- written, sent and paid without a proposal having a checkout on it.
-- ---------------------------------------------------------------------

-- ── Numbering ────────────────────────────────────────────────────────
-- Same shape as next_proposal_number(): a counter row per year, so two
-- admins pressing New at once queue on the row lock instead of colliding.
create table if not exists public.invoice_counters (
  year        integer primary key,
  last_number integer not null default 0
);

create or replace function public.next_invoice_number()
returns text
language plpgsql
as $fn$
declare
  y integer := extract(year from now())::integer;
  n integer;
begin
  insert into public.invoice_counters (year, last_number)
  values (y, 1)
  on conflict (year) do update
    set last_number = public.invoice_counters.last_number + 1
  returning last_number into n;

  return 'INV-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$fn$;

-- ── The document columns ─────────────────────────────────────────────
-- All added nullable first, backfilled, then constrained. An `alter table
-- add column not null default` on a live table would be fine at this size,
-- but the backfill has to compute per-row values anyway.
alter table public.invoices
  add column if not exists invoice_number         text,
  add column if not exists source                 text,
  add column if not exists proposal_id            uuid references public.proposals(id) on delete set null,
  add column if not exists job_id                 uuid references public.jobs(id)      on delete set null,
  add column if not exists company_id             uuid references public.companies(id) on delete set null,
  add column if not exists public_token           text,
  add column if not exists title                  text,
  add column if not exists owner                  text,
  add column if not exists created_by             text,

  -- The client, snapshotted onto the row. An invoice has to keep saying who
  -- it was addressed to even after somebody fixes a typo on the lead.
  add column if not exists client_business_name   text,
  add column if not exists client_contact_name    text,
  add column if not exists client_email           text,
  add column if not exists client_phone           text,
  add column if not exists client_billing_address text,

  add column if not exists issue_date             date,
  add column if not exists due_date               date,
  add column if not exists payment_terms          text,

  -- Totals, recomputed server-side from the line items on every save. The
  -- browser never supplies an amount.
  add column if not exists subtotal_cents         integer not null default 0,
  add column if not exists discount_cents         integer not null default 0,
  add column if not exists total_cents            integer not null default 0,
  add column if not exists recurring_cents        integer not null default 0,
  add column if not exists recurring_interval     text    not null default 'month',
  add column if not exists recurring_starts_on    date,
  add column if not exists amount_paid_cents      integer not null default 0,

  add column if not exists terms                  text,
  add column if not exists footer_note            text,
  add column if not exists notes_internal         text,

  -- How it actually went out. 'manual' is a first-class answer: the client
  -- link gets copied into Messenger or a text as often as it gets emailed,
  -- and an invoice that was really sent must not sit there saying Draft.
  add column if not exists sent_method            text,
  add column if not exists first_viewed_at        timestamptz,
  add column if not exists last_viewed_at         timestamptz,
  add column if not exists view_count             integer not null default 0,
  add column if not exists voided_at              timestamptz,
  add column if not exists cancelled_reason       text;

-- ── Backfill ─────────────────────────────────────────────────────────
update public.invoices
   set source = case
                  when kind = 'upsell' then 'upsell'
                  else 'checkout'
                end
 where source is null;

update public.invoices
   set total_cents = greatest(coalesce(amount_cents, 0), coalesce(launch_cents, 0))
 where total_cents = 0;

update public.invoices
   set subtotal_cents = total_cents
 where subtotal_cents = 0;

update public.invoices
   set recurring_cents = coalesce(hosting_cents, 0)
 where recurring_cents = 0;

update public.invoices
   set amount_paid_cents = total_cents
 where status = 'paid' and amount_paid_cents = 0;

update public.invoices
   set issue_date = coalesce(sent_at, created_at)::date
 where issue_date is null;

update public.invoices
   set title = coalesce(description, 'Invoice')
 where title is null;

update public.invoices
   set invoice_number = public.next_invoice_number()
 where invoice_number is null;

update public.invoices
   set public_token = encode(gen_random_bytes(18), 'hex')
 where public_token is null;

-- ── Now the constraints ──────────────────────────────────────────────
alter table public.invoices
  alter column invoice_number set not null,
  alter column public_token   set not null,
  alter column source         set not null,
  alter column source         set default 'manual',
  alter column title          set not null,
  alter column title          set default 'Invoice',
  alter column invoice_number set default public.next_invoice_number(),
  alter column public_token   set default encode(gen_random_bytes(18), 'hex'),
  alter column issue_date     set default current_date;

create unique index if not exists invoices_number_key on public.invoices (invoice_number);
create unique index if not exists invoices_token_key  on public.invoices (public_token);
create index if not exists invoices_proposal_idx on public.invoices (proposal_id) where proposal_id is not null;
create index if not exists invoices_due_idx      on public.invoices (due_date)    where due_date is not null;
create index if not exists invoices_source_idx   on public.invoices (source);

do $$
begin
  -- 'partial' is new: an invoice can be half-paid, and calling that 'sent'
  -- would hide money that has already landed.
  alter table public.invoices drop constraint if exists invoices_status_check;
  alter table public.invoices add constraint invoices_status_check
    check (status in ('draft', 'sent', 'partial', 'paid', 'expired', 'void', 'refunded'));

  alter table public.invoices drop constraint if exists invoices_source_check;
  alter table public.invoices add constraint invoices_source_check
    check (source in ('manual', 'proposal', 'checkout', 'upsell', 'hosting'));

  alter table public.invoices drop constraint if exists invoices_sent_method_check;
  alter table public.invoices add constraint invoices_sent_method_check
    check (sent_method is null or sent_method in ('email', 'manual'));

  alter table public.invoices drop constraint if exists invoices_recurring_interval_check;
  alter table public.invoices add constraint invoices_recurring_interval_check
    check (recurring_interval in ('month', 'year'));

  alter table public.invoices drop constraint if exists invoices_totals_check;
  alter table public.invoices add constraint invoices_totals_check
    check (subtotal_cents >= 0 and discount_cents >= 0 and total_cents >= 0
           and recurring_cents >= 0 and amount_paid_cents >= 0);
end $$;

-- ---------------------------------------------------------------------
-- invoice_items — what is being charged for, in the client's words.
--
-- `item_kind` is the whole reason this table exists rather than two more
-- columns on invoices: one invoice can carry a one-time build line AND a
-- monthly hosting line, which are billed differently and totalled
-- separately. A discount is stored positive and subtracted at compute time,
-- so no price in this database is ever negative.
-- ---------------------------------------------------------------------
create table if not exists public.invoice_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  item_kind        text not null default 'one_time'
                     check (item_kind in ('one_time', 'recurring', 'discount')),
  title            text not null,
  description      text,
  quantity         numeric(12,2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  total_price_cents integer not null default 0 check (total_price_cents >= 0),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx
  on public.invoice_items (invoice_id, sort_order);

-- ---------------------------------------------------------------------
-- invoice_payments — every payment against an invoice, however it arrived.
--
-- Stripe is not the only way money lands. A cheque, a transfer or cash all
-- have to be recordable or the invoice will never close, and John will stop
-- trusting the screen. `method` says which, `reference` says how to find it
-- again. This table is the truth about what has been collected; the
-- amount_paid_cents column on the invoice is a cached sum of it, kept by the
-- trigger below.
--
-- Recording a non-Stripe payment deliberately writes NO revenue_events row —
-- the campaign dashboard counts Stripe-sourced revenue and must not double
-- count money booked wherever it actually landed.
-- ---------------------------------------------------------------------
create table if not exists public.invoice_payments (
  id                    uuid primary key default gen_random_uuid(),
  invoice_id            uuid not null references public.invoices(id) on delete cascade,
  amount_cents          integer not null check (amount_cents > 0),
  currency              text not null default 'USD',
  method                text not null default 'stripe'
                          check (method in ('stripe', 'card', 'cash', 'check',
                                            'bank_transfer', 'other')),
  reference             text,
  paid_on               date not null default current_date,
  note                  text,
  recorded_by           text,
  stripe_payment_intent text,
  created_at            timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments (invoice_id, paid_on desc);
create unique index if not exists invoice_payments_intent_key
  on public.invoice_payments (stripe_payment_intent)
  where stripe_payment_intent is not null;

-- ---------------------------------------------------------------------
-- invoice_events — the audit trail, appended and never overwritten.
-- ---------------------------------------------------------------------
create table if not exists public.invoice_events (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null default 'note' check (event_type in (
               'created', 'edited', 'sent', 'resent', 'link_copied', 'viewed',
               'payment_started', 'payment_recorded', 'paid', 'reminder_sent',
               'voided', 'refunded', 'note')),
  body       text,
  actor      text,
  metadata   jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_events_invoice_idx
  on public.invoice_events (invoice_id, created_at desc);

-- ---------------------------------------------------------------------
-- The cached paid total, kept honest by the database.
--
-- Both a Stripe webhook and a hand-recorded cheque insert into
-- invoice_payments, so summing here means neither path can leave the invoice
-- claiming a balance that is already settled. A void or refunded invoice is
-- left alone — those are decisions a human made and a payment row must not
-- silently reopen them.
-- ---------------------------------------------------------------------
create or replace function public.sync_invoice_paid()
returns trigger
language plpgsql
as $fn$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
  collected integer;
  latest timestamptz;
  inv record;
begin
  select coalesce(sum(amount_cents), 0),
         max(created_at)
    into collected, latest
    from public.invoice_payments
   where invoice_id = target;

  select status, total_cents into inv
    from public.invoices where id = target;

  if not found then return coalesce(new, old); end if;

  if inv.status in ('void', 'refunded') then
    update public.invoices set amount_paid_cents = collected where id = target;
    return coalesce(new, old);
  end if;

  update public.invoices
     set amount_paid_cents = collected,
         status = case
                    when inv.total_cents > 0 and collected >= inv.total_cents then 'paid'
                    when collected > 0 then 'partial'
                    when status = 'draft' then 'draft'
                    else 'sent'
                  end,
         paid_at = case
                     when inv.total_cents > 0 and collected >= inv.total_cents
                       then coalesce(paid_at, latest, now())
                     else null
                   end
   where id = target;

  return coalesce(new, old);
end;
$fn$;

drop trigger if exists invoice_payments_sync on public.invoice_payments;
create trigger invoice_payments_sync
  after insert or update or delete on public.invoice_payments
  for each row execute function public.sync_invoice_paid();

-- ---------------------------------------------------------------------
-- A paid invoice is a record, not a draft.
--
-- Same principle as the signed proposal in 0016: once money has been
-- collected against it, what it charged cannot be edited. Status, receipts,
-- notes and the paid total all still move — only the amounts are frozen, and
-- the line items with them. Getting it wrong after the fact means a credit
-- note or a new invoice, which is what an accountant would tell you anyway.
-- ---------------------------------------------------------------------
create or replace function public.guard_invoice_amounts()
returns trigger
language plpgsql
as $fn$
begin
  if old.status = 'paid' and (
       new.subtotal_cents  is distinct from old.subtotal_cents  or
       new.discount_cents  is distinct from old.discount_cents  or
       new.total_cents     is distinct from old.total_cents     or
       new.recurring_cents is distinct from old.recurring_cents or
       new.launch_cents    is distinct from old.launch_cents    or
       new.hosting_cents   is distinct from old.hosting_cents   or
       new.amount_cents    is distinct from old.amount_cents
     ) then
    raise exception 'Invoice % is paid; its amounts cannot be changed. Raise a new invoice instead.',
      old.invoice_number;
  end if;
  return new;
end;
$fn$;

drop trigger if exists invoices_guard_amounts on public.invoices;
create trigger invoices_guard_amounts before update on public.invoices
  for each row execute function public.guard_invoice_amounts();

create or replace function public.guard_invoice_items()
returns trigger
language plpgsql
as $fn$
declare
  parent record;
begin
  select status, invoice_number into parent
    from public.invoices
   where id = coalesce(new.invoice_id, old.invoice_id);

  if parent is not null and parent.status = 'paid' then
    raise exception 'Invoice % is paid; its lines cannot be changed.', parent.invoice_number;
  end if;

  return coalesce(new, old);
end;
$fn$;

drop trigger if exists invoice_items_guard on public.invoice_items;
create trigger invoice_items_guard
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_invoice_items();

-- ── RLS — admins only, anon revoked, same as everywhere else ─────────
do $$
declare t text;
begin
  foreach t in array array[
    'invoice_counters', 'invoice_items', 'invoice_payments', 'invoice_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I_admin_select on public.%I', t, t);
    execute format('drop policy if exists %I_admin_insert on public.%I', t, t);
    execute format('drop policy if exists %I_admin_update on public.%I', t, t);
    execute format('drop policy if exists %I_admin_delete on public.%I', t, t);

    execute format(
      'create policy %I_admin_select on public.%I for select to authenticated using (public.is_admin())', t, t);
    execute format(
      'create policy %I_admin_insert on public.%I for insert to authenticated with check (public.is_admin())', t, t);
    execute format(
      'create policy %I_admin_update on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
    execute format(
      'create policy %I_admin_delete on public.%I for delete to authenticated using (public.is_admin())', t, t);

    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

revoke all on public.invoices from anon;
