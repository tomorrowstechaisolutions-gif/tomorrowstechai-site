-- ---------------------------------------------------------------------
-- 0013 — the CRM: companies and deals.
--
-- WHAT ALREADY EXISTED, and is NOT duplicated:
--   leads          the CONTACT. name, email, phone, business_name, status
--                  across nine values, score, owner, notes, last_contacted_at,
--                  next_followup_at, and full source/campaign attribution.
--   lead_events    the ACTIVITY TIMELINE — note, call, sms, email_sent,
--                  form_submit, appointment, revenue, status_change.
--   lead_followups the automated sequence engine.
--   customers      a contact who bought. Same person, later in their life.
--   invoices       what a deal was actually worth and whether it was paid.
--   tasks          already carries lead_id and customer_id.
--
-- There is NO contacts table. A contact is a lead, and a lead who bought is
-- also a customer. Adding a third record for the same human is how CRMs end
-- up with three spellings of one phone number.
--
-- Two things genuinely did not exist.
-- ---------------------------------------------------------------------

-- ── companies ────────────────────────────────────────────────────────
-- `business_name` is a STRING on both leads and customers. That is fine
-- while every buyer is an owner-operator answering their own phone — and it
-- stops being fine the moment a second person at the same firm gets in
-- touch, because the two are then unrelated rows that happen to share some
-- text.
--
-- The multi-contact model falls out of this table without a contacts table:
-- several leads pointing at one company_id ARE several contacts at one
-- company. Nothing else was needed for that.
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),

  name          text not null,
  -- Bare host, lowercased, no www. The most reliable way to tell whether
  -- two spellings of a business name are the same business.
  domain        text,

  business_type text,
  phone         text,
  city          text,
  state         text,

  owner         text,
  tags          text[] not null default '{}',
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Two companies may share a name (there is more than one "Austin Roofing"),
-- so the name is not unique. A domain is: one website, one business.
create unique index if not exists companies_domain_idx
  on public.companies (lower(regexp_replace(domain, '^www\.', '')))
  where domain is not null and domain <> '';

create index if not exists companies_name_idx on public.companies (lower(name));

-- ── The link, on the records that already exist ──────────────────────
-- Nullable everywhere: a lead who gave a name and no business is still a
-- lead, and losing the company must never lose the person.
alter table public.leads
  add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.customers
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists leads_company_idx
  on public.leads (company_id) where company_id is not null;
create index if not exists customers_company_idx
  on public.customers (company_id) where company_id is not null;

-- ── deals ────────────────────────────────────────────────────────────
-- A lead's status is its stage, and that is true right up until the same
-- client buys a second thing. A website in one year and a CRM the next are
-- two sales to one company; a single status field can only describe one of
-- them, and moving it back to "Proposal Sent" would erase the first.
--
-- So a deal is its own row. The lead keeps its status — the dashboard
-- pipeline still reads it, unchanged — and deals describe what is actually
-- being sold, to whom, for how much.
--
-- The stage list is the SAME five the dashboard pipeline uses, plus the two
-- terminal states, so the two screens can never tell different stories about
-- the same funnel. src/lib/dashboard/sales.ts owns that vocabulary.
create table if not exists public.deals (
  id            uuid primary key default gen_random_uuid(),

  company_id    uuid references public.companies(id) on delete set null,
  -- The person driving it, and the client record once they have bought.
  lead_id       uuid references public.leads(id) on delete set null,
  customer_id   uuid references public.customers(id) on delete set null,

  title         text not null,
  -- What is being sold, when it is something in the catalog.
  catalog_item_id uuid references public.catalog_items(id) on delete set null,

  stage         text not null default 'new' check (stage in (
                  'new', 'qualified', 'discovery', 'proposal',
                  'negotiation', 'won', 'lost', 'on_hold')),

  value_cents   integer check (value_cents >= 0),
  -- One-off build or recurring work. A $99/month deal and a $99 deal are
  -- not the same size and must not be summed as if they were.
  billing       text not null default 'one_time' check (billing in ('one_time', 'monthly')),

  expected_close date,
  won_at        timestamptz,
  lost_at       timestamptz,
  lost_reason   text,

  owner         text,
  notes         text,
  source        text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A closed deal has to say when. Without this the win-rate and the
  -- close-date report quietly disagree with the stage column.
  constraint deals_won_check  check (stage <> 'won'  or won_at  is not null),
  constraint deals_lost_check check (stage <> 'lost' or lost_at is not null)
);

create index if not exists deals_open_idx
  on public.deals (stage, updated_at desc) where stage not in ('won', 'lost');
create index if not exists deals_company_idx
  on public.deals (company_id) where company_id is not null;
create index if not exists deals_lead_idx
  on public.deals (lead_id) where lead_id is not null;
create index if not exists deals_close_idx
  on public.deals (expected_close) where expected_close is not null;

-- ── The proposal ─────────────────────────────────────────────────────
-- A proposal in this business is an invoice with a checkout link on it —
-- invoices already carry kind, amount_cents, checkout_url, sent_at and
-- paid_at, and the Stripe webhook already moves them. So a deal points at
-- the proposal that was sent for it rather than a proposals table existing
-- to hold the same five columns.
alter table public.invoices
  add column if not exists deal_id uuid references public.deals(id) on delete set null;

create index if not exists invoices_deal_idx
  on public.invoices (deal_id) where deal_id is not null;

-- ── updated_at ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['companies', 'deals'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['companies', 'deals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
      t || '_admin_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      t || '_admin_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── Backfill ─────────────────────────────────────────────────────────
-- Every business_name already in the system becomes a company, and the rows
-- that named it point at it. Done now, while there is almost nothing to
-- migrate; the same backfill against a year of leads would be a project.
--
-- Matching is on the trimmed, case-folded name, because "Acme Roofing" and
-- "acme roofing " are one business and creating two rows here would defeat
-- the point of the table.
insert into public.companies (name, business_type, city, state, phone)
select distinct on (lower(btrim(src.business_name)))
  btrim(src.business_name), src.business_type, src.city, src.state, src.phone
from (
  select business_name, business_type, null::text as city, null::text as state, phone
    from public.leads
   where business_name is not null and btrim(business_name) <> ''
  union all
  select business_name, business_type, city, state, phone
    from public.customers
   where business_name is not null and btrim(business_name) <> ''
) as src
where not exists (
  select 1 from public.companies c
   where lower(c.name) = lower(btrim(src.business_name))
)
order by lower(btrim(src.business_name)), src.city nulls last;

update public.leads l
   set company_id = c.id
  from public.companies c
 where l.company_id is null
   and l.business_name is not null
   and lower(btrim(l.business_name)) = lower(c.name);

update public.customers cu
   set company_id = c.id
  from public.companies c
 where cu.company_id is null
   and cu.business_name is not null
   and lower(btrim(cu.business_name)) = lower(c.name);
