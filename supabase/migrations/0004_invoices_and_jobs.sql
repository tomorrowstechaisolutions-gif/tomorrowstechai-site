-- ---------------------------------------------------------------------
-- 0004 — getting paid, and what happens after.
--
-- A lead becomes a customer at exactly one moment: Stripe tells us the
-- checkout was paid. That webhook is the only writer of `customers` and of
-- the 'initial' revenue event, which is why the money numbers on the
-- campaign dashboard can be trusted against ad spend.
--
-- Everything here is admin-only under RLS. The webhook runs on the service
-- role, which bypasses RLS — it is server-side and signature-verified.
-- ---------------------------------------------------------------------

-- Stripe's identifiers live on the customer so a subscription can be found
-- again later without a lookup by email, which is not unique enough.
alter table public.customers
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists customers_stripe_customer_key
  on public.customers (stripe_customer_id) where stripe_customer_id is not null;

-- ---------------------------------------------------------------------
-- invoices — one row per payment link we send. Not an accounting ledger;
-- revenue_events is that. This exists so the admin can answer "did I send
-- John a link, when, and did he pay it?" without opening Stripe.
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid references public.leads(id) on delete set null,
  customer_id          uuid references public.customers(id) on delete set null,

  stripe_session_id    text unique,
  stripe_invoice_id    text,
  stripe_payment_intent text,

  -- What the link was for, captured at send time. Prices change; an invoice
  -- must always say what it actually charged.
  launch_cents         integer not null default 0 check (launch_cents >= 0),
  hosting_cents        integer not null default 0 check (hosting_cents >= 0),
  currency             text    not null default 'USD',

  status               text not null default 'sent' check (status in (
                         'draft', 'sent', 'paid', 'expired', 'void', 'refunded')),
  checkout_url         text,
  receipt_url          text,

  sent_at              timestamptz not null default now(),
  paid_at              timestamptz,
  expires_at           timestamptz,
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists invoices_lead_idx     on public.invoices (lead_id);
create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists invoices_status_idx   on public.invoices (status);
create index if not exists invoices_sent_idx     on public.invoices (sent_at desc);

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- jobs — the delivery side. Opened automatically when payment lands, so a
-- paid customer can never be sitting in a pipeline nobody is looking at.
-- ---------------------------------------------------------------------
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references public.customers(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  invoice_id    uuid references public.invoices(id) on delete set null,

  title         text not null,
  business_name text,
  stage         text not null default 'Intake' check (stage in (
                  'Intake', 'Content', 'Build', 'Review',
                  'Launch', 'Handoff', 'Complete', 'On Hold')),
  package       text not null default 'launch_package',

  -- 7-14 days is the promise in the ad copy. Storing the target makes it
  -- possible to see when delivery starts slipping past what was sold.
  promised_days integer not null default 14 check (promised_days > 0),
  due_at        timestamptz,
  started_at    timestamptz not null default now(),
  launched_at   timestamptz,
  completed_at  timestamptz,

  site_url      text,
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists jobs_stage_idx    on public.jobs (stage);
create index if not exists jobs_customer_idx on public.jobs (customer_id);
create index if not exists jobs_due_idx      on public.jobs (due_at);
create unique index if not exists jobs_invoice_key
  on public.jobs (invoice_id) where invoice_id is not null;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- job_tasks — the checklist. Seeded per stage when the job opens so the
-- work is the same every time and nothing is remembered by luck.
-- ---------------------------------------------------------------------
create table if not exists public.job_tasks (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  stage      text not null,
  label      text not null,
  position   integer not null default 0,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists job_tasks_job_idx on public.job_tasks (job_id, position);

-- ---------------------------------------------------------------------
-- job_events — same shape as lead_events. Every stage change and note is
-- appended, never overwritten, so a job's history survives.
-- ---------------------------------------------------------------------
create table if not exists public.job_events (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  kind       text not null default 'note' check (kind in (
               'note', 'stage_change', 'task', 'payment', 'system')),
  body       text,
  from_stage text,
  to_stage   text,
  actor      text,
  created_at timestamptz not null default now()
);

create index if not exists job_events_job_idx on public.job_events (job_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS — deny by default, admins only, anon revoked. Identical to 0001.
-- ---------------------------------------------------------------------
alter table public.invoices   enable row level security;
alter table public.jobs       enable row level security;
alter table public.job_tasks  enable row level security;
alter table public.job_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['invoices', 'jobs', 'job_tasks', 'job_events'] loop
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
