-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — Starter ($149) client intake
--
-- The $149 Starter package promises 2–3 business days. That promise only
-- holds if the content arrives in one go instead of being chased across
-- email and Facebook Messenger, so the sale hands straight off to a
-- tokenised intake wizard and the build clock starts when it is submitted.
--
-- The client is never an authenticated user. Every read and write on these
-- tables goes through a route handler using the service role, keyed by the
-- intake token — the same decision made in 0001 for public lead submissions,
-- and for the same reason: an anon-writable table would also bypass the
-- token check, the expiry, the upload limits and the validation.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------
-- Jobs now carry two stage vocabularies, chosen by `package`.
--
-- The $399 Classic keeps Intake → … → Complete (0004). Starter runs a
-- different, shorter process — 2–3 days, no CRM or booking build — and gets
-- its own stages, including the two that only exist because intake is a
-- gate: "Intake Required" (paid, waiting on them) and "Intake Submitted"
-- (content in, waiting on us). Collapsing those two into one stage would
-- hide exactly the thing this feature exists to make visible: who is
-- holding the ball.
--
-- One constraint holding the union is deliberate. Splitting it per package
-- would need a trigger, and a trigger that rejects a stage change is much
-- harder to debug from the admin than a check constraint.
-- ---------------------------------------------------------------------
alter table public.jobs drop constraint if exists jobs_stage_check;

alter table public.jobs add constraint jobs_stage_check check (stage in (
  -- launch_package ($399)
  'Intake', 'Content', 'Build', 'Review', 'Launch', 'Handoff', 'Complete',
  -- starter_149
  'Purchased', 'Intake Required', 'Intake Submitted', 'Ready to Build',
  'In Development', 'Client Review', 'Revision', 'Launch Ready', 'Live',
  -- shared
  'On Hold'
));

-- ---------------------------------------------------------------------
-- client_intakes — one row per purchased Starter site.
--
-- Every answer is nullable. The wizard saves after each step so a client can
-- close the tab on step 2 and come back; a half-finished intake is a normal
-- state, not a broken row. What "complete" means is enforced in the route
-- handler on submit, not by NOT NULL here, because the required set belongs
-- to the product and will change faster than the schema should.
-- ---------------------------------------------------------------------
create table if not exists public.client_intakes (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid references public.jobs(id) on delete cascade,
  customer_id           uuid references public.customers(id) on delete set null,
  lead_id               uuid references public.leads(id) on delete set null,

  package               text not null default 'starter_149',

  -- The client's only credential. Random, unguessable, and expiring: a link
  -- that works forever is a link that still works after it leaks.
  token                 text not null unique,
  token_expires_at      timestamptz not null default (now() + interval '30 days'),

  status                text not null default 'draft'
                          check (status in ('draft', 'submitted')),
  current_step          integer not null default 1
                          check (current_step between 1 and 5),

  -- 1 · Business information
  business_name         text,
  contact_name          text,
  email                 text,
  phone                 text,
  business_address      text,
  service_area          text,
  business_hours        text,
  google_business_url   text,

  -- 2 · Website content
  business_description  text,
  services_offered      text,
  home_page_content     text,
  services_page_content text,
  contact_page_info     text,
  primary_cta           text check (primary_cta in
                          ('Call', 'Request Quote', 'Contact Us', 'Book Consultation')),
  testimonials          text,

  -- 3 · Branding
  brand_colors          text,
  example_websites      text,
  legal_text            text,
  -- Keyed by network so a new platform is a key, not a migration.
  social_links          jsonb not null default '{}'::jsonb,

  -- 4 · Domain
  domain_status         text check (domain_status in ('existing', 'new', 'undecided')),
  domain_name           text,
  registrar             text,
  domain_notes          text,

  -- 5 · Attestations. Both must be true to submit. Stored rather than
  -- assumed, because "the clock starts when we have everything" is the
  -- term most likely to be argued about later.
  attest_turnaround     boolean not null default false,
  attest_rights         boolean not null default false,

  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists client_intakes_job_idx    on public.client_intakes (job_id);
create index if not exists client_intakes_status_idx on public.client_intakes (status, created_at desc);

-- ---------------------------------------------------------------------
-- intake_files — what they uploaded, by purpose.
--
-- `kind` is what the file is FOR, not what it is. "logo" and "work" are
-- different deliverables even when both are PNGs, and the build cannot start
-- without the first regardless of how many of the second arrived.
-- ---------------------------------------------------------------------
create table if not exists public.intake_files (
  id           uuid primary key default gen_random_uuid(),
  intake_id    uuid not null references public.client_intakes(id) on delete cascade,

  kind         text not null default 'other' check (kind in
                 ('logo', 'team', 'work', 'premises', 'other')),
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   integer check (size_bytes is null or size_bytes >= 0),

  created_at   timestamptz not null default now()
);

create index if not exists intake_files_intake_idx on public.intake_files (intake_id, kind);

-- ---------------------------------------------------------------------
-- updated_at, matching the trigger style used since 0001.
-- ---------------------------------------------------------------------
create or replace function public.touch_client_intake()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists client_intakes_touch on public.client_intakes;
create trigger client_intakes_touch
  before update on public.client_intakes
  for each row execute function public.touch_client_intake();

-- ---------------------------------------------------------------------
-- RLS — deny by default, admins only, anon revoked. Identical to 0001/0004.
-- The client's access is not a database grant; it is the service role acting
-- on their behalf after the route handler has checked their token.
-- ---------------------------------------------------------------------
alter table public.client_intakes enable row level security;
alter table public.intake_files   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['client_intakes', 'intake_files'] loop
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

-- ---------------------------------------------------------------------
-- Private storage for what clients upload.
--
-- Same shape as brand-assets in 0011: never public, admin-only policies, and
-- the app mints a short-lived signed URL per view. A client's logo and staff
-- photos on a guessable public URL would be a leak with their name on it.
--
-- Guarded because the storage schema only exists on Supabase — a scratch
-- PostgreSQL used to verify these migrations does not have it.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (scratch database) — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('client-intake', 'client-intake', false, 26214400)
  on conflict (id) do update set public = false;

  execute 'drop policy if exists client_intake_admin_read on storage.objects';
  execute 'drop policy if exists client_intake_admin_write on storage.objects';
  execute 'drop policy if exists client_intake_admin_update on storage.objects';
  execute 'drop policy if exists client_intake_admin_delete on storage.objects';

  execute $p$
    create policy client_intake_admin_read on storage.objects
      for select to authenticated
      using (bucket_id = 'client-intake' and public.is_admin())
  $p$;
  execute $p$
    create policy client_intake_admin_write on storage.objects
      for insert to authenticated
      with check (bucket_id = 'client-intake' and public.is_admin())
  $p$;
  execute $p$
    create policy client_intake_admin_update on storage.objects
      for update to authenticated
      using (bucket_id = 'client-intake' and public.is_admin())
      with check (bucket_id = 'client-intake' and public.is_admin())
  $p$;
  execute $p$
    create policy client_intake_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'client-intake' and public.is_admin())
  $p$;
end $$;
