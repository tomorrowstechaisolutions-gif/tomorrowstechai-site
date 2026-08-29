-- =====================================================================
-- Tomorrow's Tech AI — $399 Business Launch campaign CRM
-- 0001_business_launch.sql   (applied 2026-08-29)
--
-- Deny-by-default RLS everywhere. Nothing is readable by anon, or by a
-- signed-in user who is not in admin_users. Public lead capture happens
-- server-side through the Next.js route handler using the service role,
-- so the browser never talks to these tables directly. That is stricter
-- than "anon may INSERT" and deliberately so: it keeps validation,
-- scoring, rate limiting and spam checks on the server where they can't
-- be bypassed.
-- =====================================================================

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- admin_users — signed in is NOT enough; a row here is also required.
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete cascade,
  email      text not null unique,
  full_name  text,
  role       text not null default 'admin' check (role in ('admin', 'owner', 'viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  first_name          text not null,
  last_name           text not null,
  email               text not null,
  phone               text,
  business_name       text,
  business_type       text,
  current_website     text check (current_website in ('yes', 'no')),
  website_url         text,
  services_interested text[] not null default '{}',
  timeline            text,
  -- attribution
  source              text not null default 'website',
  campaign            text,
  adset               text,
  ad                  text,
  placement           text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_content         text,
  utm_term            text,
  fbclid              text,
  fbp                 text,
  fbc                 text,
  gclid               text,
  landing_page        text,
  referrer            text,
  -- Meta Instant Forms
  meta_leadgen_id     text,
  meta_form_id        text,
  meta_page_id        text,
  -- pipeline
  lead_status         text not null default 'New' check (lead_status in (
                        'New', 'Contact Attempted', 'Contacted', 'Qualified',
                        'Demo Scheduled', 'Proposal/Checkout Sent',
                        'Won', 'Lost', 'Follow Up Later')),
  lead_score          integer not null default 0 check (lead_score between 0 and 100),
  lead_score_reasons  jsonb not null default '[]'::jsonb,
  assigned_to         text,
  notes               text,
  last_contacted_at   timestamptz,
  next_followup_at    timestamptz,
  closed_at           timestamptz,
  lost_reason         text,
  -- consent / compliance
  email_consent       boolean not null default true,
  sms_consent         boolean not null default false,
  consent_text        text,
  consent_at          timestamptz,
  unsubscribed_at     timestamptz,
  do_not_contact      boolean not null default false,
  -- request metadata
  ip_address          text,
  user_agent          text,
  submission_count    integer not null default 1
);

create index if not exists leads_created_at_idx    on public.leads (created_at desc);
create index if not exists leads_status_idx        on public.leads (lead_status);
create index if not exists leads_email_idx         on public.leads (lower(email));
create index if not exists leads_phone_idx         on public.leads (phone);
create index if not exists leads_campaign_idx      on public.leads (campaign);
create index if not exists leads_utm_campaign_idx  on public.leads (utm_campaign);
create index if not exists leads_source_idx        on public.leads (source);
create unique index if not exists leads_meta_leadgen_id_key
  on public.leads (meta_leadgen_id) where meta_leadgen_id is not null;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

create table if not exists public.lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  type       text not null default 'note' check (type in (
               'note', 'status_change', 'email_sent', 'email_failed', 'call',
               'sms', 'form_submit', 'followup_sent', 'appointment', 'revenue',
               'system', 'duplicate_merge')),
  body       text,
  meta       jsonb not null default '{}'::jsonb,
  actor      text not null default 'system'
);
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

create table if not exists public.lead_followups (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  step       text not null check (step in ('confirmation', 'followup_24h', 'followup_72h')),
  channel    text not null default 'email' check (channel in ('email', 'sms')),
  due_at     timestamptz not null,
  status     text not null default 'pending' check (status in (
               'pending', 'sent', 'skipped', 'cancelled', 'failed')),
  sent_at    timestamptz,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, step)
);
create index if not exists lead_followups_due_idx
  on public.lead_followups (status, due_at) where status = 'pending';

drop trigger if exists lead_followups_touch on public.lead_followups;
create trigger lead_followups_touch before update on public.lead_followups
  for each row execute function public.touch_updated_at();

create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references public.leads(id) on delete set null,
  scheduled_at timestamptz,
  status       text not null default 'scheduled' check (status in (
                 'scheduled', 'completed', 'no_show', 'cancelled')),
  source       text not null default 'website',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists appointments_lead_idx on public.appointments (lead_id);
create index if not exists appointments_when_idx on public.appointments (scheduled_at desc);

drop trigger if exists appointments_touch on public.appointments;
create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

-- campaign_spend — manual entry now, Meta Marketing API later. `source`
-- distinguishes the two; `external_id` makes an API sync idempotent.
-- Money is integer cents throughout, same convention as Proudly Texan.
create table if not exists public.campaign_spend (
  id                  uuid primary key default gen_random_uuid(),
  date                date not null,
  campaign            text not null default '$399 Business Launch',
  adset               text,
  ad                  text,
  placement           text,
  device              text,
  spend_cents         integer not null default 0 check (spend_cents >= 0),
  impressions         integer not null default 0 check (impressions >= 0),
  reach               integer not null default 0 check (reach >= 0),
  clicks              integer not null default 0 check (clicks >= 0),
  landing_page_views  integer not null default 0 check (landing_page_views >= 0),
  source              text not null default 'manual' check (source in ('manual', 'meta_api')),
  external_id         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists campaign_spend_row_key
  on public.campaign_spend (date, campaign, coalesce(adset, ''), coalesce(ad, ''),
                            coalesce(placement, ''), coalesce(device, ''));
create index if not exists campaign_spend_date_idx on public.campaign_spend (date desc);

drop trigger if exists campaign_spend_touch on public.campaign_spend;
create trigger campaign_spend_touch before update on public.campaign_spend
  for each row execute function public.touch_updated_at();

create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid unique references public.leads(id) on delete set null,
  name          text,
  business_name text,
  email         text not null,
  phone         text,
  status        text not null default 'active' check (status in ('active', 'paused', 'churned')),
  won_at        timestamptz not null default now(),
  churned_at    timestamptz,
  mrr_cents     integer not null default 0 check (mrr_cents >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists customers_email_idx on public.customers (lower(email));

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

create table if not exists public.revenue_events (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references public.customers(id) on delete cascade,
  lead_id      uuid references public.leads(id) on delete set null,
  kind         text not null check (kind in ('initial', 'recurring', 'upsell')),
  category     text not null default 'other' check (category in (
                 'launch_package', 'hosting', 'crm', 'ai_automation',
                 'custom_app', 'ecommerce', 'dashboard', 'social',
                 'marketing', 'development', 'other')),
  description  text,
  amount_cents integer not null check (amount_cents >= 0),
  currency     text not null default 'USD',
  campaign     text,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists revenue_events_customer_idx on public.revenue_events (customer_id);
create index if not exists revenue_events_lead_idx     on public.revenue_events (lead_id);
create index if not exists revenue_events_when_idx     on public.revenue_events (occurred_at desc);

-- ---------------------------------------------------------------------
-- RLS — deny by default, admins only. The service role bypasses RLS and
-- is the ONLY path public form submissions take.
-- ---------------------------------------------------------------------
alter table public.admin_users     enable row level security;
alter table public.leads           enable row level security;
alter table public.lead_events     enable row level security;
alter table public.lead_followups  enable row level security;
alter table public.appointments    enable row level security;
alter table public.campaign_spend  enable row level security;
alter table public.customers       enable row level security;
alter table public.revenue_events  enable row level security;

drop policy if exists admin_users_self_select on public.admin_users;
create policy admin_users_self_select on public.admin_users
  for select to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['leads', 'lead_events', 'lead_followups', 'appointments',
                           'campaign_spend', 'customers', 'revenue_events']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_admin_delete', t);
  end loop;
end;
$$;

-- Belt and braces: revoke the blanket PostgREST grants for anon, so a
-- future accidental permissive policy still cannot leak.
revoke all on public.leads          from anon;
revoke all on public.lead_events    from anon;
revoke all on public.lead_followups from anon;
revoke all on public.appointments   from anon;
revoke all on public.campaign_spend from anon;
revoke all on public.customers      from anon;
revoke all on public.revenue_events from anon;
revoke all on public.admin_users    from anon;
