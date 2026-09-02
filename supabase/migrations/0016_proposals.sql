-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Proposals, agreements and digital signature.
--
-- The journey this completes:
--   Lead → Proposal → Agreement → Acceptance/Signature → Payment
--        → Project → Client onboarding
--
-- WHAT ALREADY EXISTED and is NOT duplicated here:
--   leads / companies   the contact and the business (0001, 0013).
--   deals               the sale. A proposal is a document FOR a deal, not a
--                       second copy of it, so `deal_id` points at it and the
--                       stage vocabulary stays in 0013.
--   customers           created only when Stripe says a payment landed. The
--                       webhook remains the sole writer; conversion links,
--                       it does not invent.
--   invoices            what was charged and whether it was paid, with the
--                       Stripe session/intent already on it. Proposal payment
--                       writes an invoice row rather than a parallel ledger,
--                       so revenue is still counted exactly once.
--   jobs / job_tasks    the project created on conversion, with the per-package
--                       stage vocabularies from 0004 and 0015.
--   client_intakes      the onboarding questionnaire already built in 0015.
--   admin_users/is_admin the only authorisation source. Unchanged.
--
-- WHAT GENUINELY DID NOT EXIST: a proposal document, its line items, its
-- agreement text, the signature record, and a per-proposal audit trail.
-- lead_events is keyed to a lead and job_events to a job; a proposal event
-- has nowhere to live in either.
--
-- The client is never an authenticated user. Every public read and write goes
-- through a route handler on the service role, keyed by an unguessable token —
-- the same decision made in 0001 for lead capture and 0015 for intake, and for
-- the same reason: an anon-writable table would bypass the token check, the
-- expiry, the acceptance gate and the server-side pricing.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------
-- agreement_versions — the contract, as data.
--
-- The agreement is the part of a proposal most likely to change and least
-- likely to be changed by a developer. Hard-coding it in a component would
-- mean a deploy for a comma, and — far worse — would make it impossible to
-- prove WHICH wording a client actually signed, because the component would
-- have moved on. So the text lives in a row, a proposal pins the row it used,
-- and the signature records the version string alongside it.
--
-- `sections` and `ownership_rows` are jsonb because the shape is a document,
-- not a relation: nothing ever queries "all clause 5.2s across versions".
-- ---------------------------------------------------------------------
create table if not exists public.agreement_versions (
  id             uuid primary key default gen_random_uuid(),

  -- Human version string. This is what gets written onto the signature
  -- record and printed on the signed snapshot.
  version        text not null unique,
  title          text not null,
  intro          text,

  -- [{ n, heading, paragraphs: [text], bullets: [text] }]
  sections       jsonb not null default '[]'::jsonb,
  -- Exhibit B. [{ asset, owner, treatment }]
  ownership_rows jsonb not null default '[]'::jsonb,

  status         text not null default 'draft'
                   check (status in ('draft', 'published', 'archived')),
  published_at   timestamptz,
  created_by     text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- A published version has to say when. Without this "which one was current
  -- in September" is unanswerable, which is the whole point of versioning.
  constraint agreement_versions_published_check
    check (status <> 'published' or published_at is not null)
);

create index if not exists agreement_versions_published_idx
  on public.agreement_versions (published_at desc) where status = 'published';

-- ---------------------------------------------------------------------
-- Proposal numbering. TT-2026-0001, restarting each year.
--
-- A plain sequence cannot restart per year, and max(number)+1 races two
-- admins pressing New at once. The counter row gives both: the upsert takes
-- a row lock, so concurrent callers queue rather than collide.
-- ---------------------------------------------------------------------
create table if not exists public.proposal_counters (
  year        integer primary key,
  last_number integer not null default 0
);

create or replace function public.next_proposal_number()
returns text
language plpgsql
as $fn$
declare
  y integer := extract(year from now())::integer;
  n integer;
begin
  insert into public.proposal_counters (year, last_number)
  values (y, 1)
  on conflict (year) do update
    set last_number = public.proposal_counters.last_number + 1
  returning last_number into n;

  return 'TT-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$fn$;

-- ---------------------------------------------------------------------
-- proposals — one row per document sent to a client.
--
-- Money is stored in cents, like every other amount in this database, and
-- every figure the public page prints is read from here. The browser never
-- supplies a price; the acceptance route recomputes the total from these
-- columns before it creates a checkout session.
--
-- The client identity is snapshotted onto the row rather than only joined.
-- A proposal has to keep saying what it said the day it was signed, even
-- after somebody fixes a typo in the lead's business name.
-- ---------------------------------------------------------------------
create table if not exists public.proposals (
  id                    uuid primary key default gen_random_uuid(),
  proposal_number       text not null unique default public.next_proposal_number(),

  -- Where it came from and what it belongs to. All nullable: a proposal can
  -- be written for somebody who is not in the CRM yet, and losing a lead must
  -- never delete the document that was sent to them.
  lead_id               uuid references public.leads(id)     on delete set null,
  company_id            uuid references public.companies(id) on delete set null,
  deal_id               uuid references public.deals(id)     on delete set null,
  customer_id           uuid references public.customers(id) on delete set null,
  -- The delivery record. `jobs` is what the admin calls Projects.
  job_id                uuid references public.jobs(id)      on delete set null,

  -- Revisions and change orders. A signed proposal is immutable, so a change
  -- is a NEW row that points back at what it replaces — which is also the
  -- shape a Change Order module needs, without building one today.
  kind                  text not null default 'proposal'
                          check (kind in ('proposal', 'change_order')),
  supersedes_id         uuid references public.proposals(id) on delete set null,

  created_by            text,
  owner                 text,

  status                text not null default 'draft' check (status in (
                          'draft', 'sent', 'viewed', 'accepted', 'signed',
                          'payment_pending', 'paid', 'declined', 'expired',
                          'cancelled', 'converted')),

  title                 text not null,
  summary               text,

  package_key           text,
  package_name          text,

  -- Client snapshot, as printed on the document.
  client_business_name  text,
  client_contact_name   text,
  client_email          text,
  client_phone          text,
  client_title          text,
  client_billing_address text,

  -- Commercials. subtotal − discount = one_time_price; total is what is due
  -- across the one-time work, and recurring is quoted separately because a
  -- $29/month line and a $399 line must never be summed.
  currency              text not null default 'USD',
  subtotal_cents        integer not null default 0 check (subtotal_cents >= 0),
  discount_amount_cents integer not null default 0 check (discount_amount_cents >= 0),
  one_time_price_cents  integer not null default 0 check (one_time_price_cents >= 0),
  total_cents           integer not null default 0 check (total_cents >= 0),
  recurring_price_cents integer not null default 0 check (recurring_price_cents >= 0),
  recurring_interval    text not null default 'month'
                          check (recurring_interval in ('month', 'year')),
  deposit_amount_cents  integer not null default 0 check (deposit_amount_cents >= 0),

  -- When money is actually due. Chosen per proposal, because the answer is
  -- not the same for a $149 Starter and a build that invoices after launch.
  payment_mode          text not null default 'deposit' check (payment_mode in (
                          'deposit',        -- part now, balance later
                          'full',           -- whole one-time amount at signature
                          'invoice_later')),-- signature is acceptance only

  -- Delivery terms, printed on the proposal and carried onto the project.
  turnaround_note       text,
  revision_limit        integer check (revision_limit is null or revision_limit >= 0),
  hosting_note          text,

  valid_until           date,

  -- The client's only credential. 32 random bytes, base64url.
  public_token          text not null unique,

  -- The exact agreement wording this document carries.
  agreement_version_id  uuid references public.agreement_versions(id) on delete restrict,

  -- Lifecycle timestamps. Each one is a fact, not a status derivation.
  sent_at               timestamptz,
  first_viewed_at       timestamptz,
  last_viewed_at        timestamptz,
  view_count            integer not null default 0 check (view_count >= 0),
  accepted_at           timestamptz,
  declined_at           timestamptz,
  decline_reason        text,
  signed_at             timestamptz,
  paid_at               timestamptz,
  expired_at            timestamptz,
  cancelled_at          timestamptz,
  converted_at          timestamptz,

  -- Set the moment it is signed. Everything downstream reads this rather
  -- than signed_at, so "locked" stays one concept even if a correction is
  -- ever made to a date.
  locked_at             timestamptz,

  -- The frozen document. Written once, never overwritten.
  signed_document_path  text,
  signed_document_hash  text,

  -- Payment, joined to the existing money tables rather than repeating them.
  invoice_id            uuid references public.invoices(id) on delete set null,
  stripe_session_id     text,
  amount_paid_cents     integer not null default 0 check (amount_paid_cents >= 0),

  notes_internal        text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A signed proposal must carry the wording it was signed under, and a
  -- deposit that exceeds the amount due is a data-entry error, not a plan.
  constraint proposals_signed_needs_agreement
    check (signed_at is null or agreement_version_id is not null),
  constraint proposals_deposit_check
    check (deposit_amount_cents = 0 or deposit_amount_cents <= total_cents),
  constraint proposals_no_self_supersede
    check (supersedes_id is null or supersedes_id <> id)
);

create index if not exists proposals_status_idx   on public.proposals (status, updated_at desc);
create index if not exists proposals_lead_idx     on public.proposals (lead_id)     where lead_id is not null;
create index if not exists proposals_deal_idx     on public.proposals (deal_id)     where deal_id is not null;
create index if not exists proposals_customer_idx on public.proposals (customer_id) where customer_id is not null;
create index if not exists proposals_job_idx      on public.proposals (job_id)      where job_id is not null;
create index if not exists proposals_owner_idx    on public.proposals (owner)       where owner is not null;
create index if not exists proposals_expiry_idx   on public.proposals (valid_until)
  where status in ('sent', 'viewed');

-- ---------------------------------------------------------------------
-- proposal_items — the priced lines and the listed obligations.
--
-- One table rather than five, keyed by what the line IS. Scope bullets,
-- deliverables, exclusions and the two responsibility lists are all
-- "an ordered line of text belonging to a proposal"; only add-ons and
-- discounts carry money, and the ones that do not simply leave it at zero.
--
-- `is_billable` is what the totals sum over, so an optional add-on can be
-- shown on the document without silently inflating the price.
-- ---------------------------------------------------------------------
create table if not exists public.proposal_items (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.proposals(id) on delete cascade,

  item_type     text not null default 'scope' check (item_type in (
                  'scope', 'deliverable', 'page', 'integration', 'addon',
                  'discount', 'recurring', 'exclusion',
                  'client_responsibility', 'provider_responsibility')),

  title         text not null,
  description   text,

  quantity      numeric(10,2) not null default 1 check (quantity >= 0),
  unit_price_cents  integer not null default 0,
  total_price_cents integer not null default 0,

  -- Shown as an option the client can consider, not counted in the total.
  is_optional   boolean not null default false,
  -- Counted by the server when it recomputes the price.
  is_billable   boolean not null default false,

  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists proposal_items_proposal_idx
  on public.proposal_items (proposal_id, item_type, sort_order);

-- ---------------------------------------------------------------------
-- proposal_sections — the prose blocks, in the order they are read.
--
-- Seeded from the package template, then edited per client. `is_visible`
-- exists so a section can be dropped from one proposal without deleting the
-- text that the template will want again next time.
-- ---------------------------------------------------------------------
create table if not exists public.proposal_sections (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.proposals(id) on delete cascade,

  section_type  text not null default 'custom' check (section_type in (
                  'executive_summary', 'scope', 'deliverables', 'timeline',
                  'pricing', 'hosting', 'ownership', 'client_responsibilities',
                  'provider_responsibilities', 'exclusions', 'agreement',
                  'custom')),

  title         text not null,
  content       text,

  sort_order    integer not null default 0,
  is_visible    boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists proposal_sections_proposal_idx
  on public.proposal_sections (proposal_id, sort_order);

-- ---------------------------------------------------------------------
-- proposal_signatures — the audit record. THIS is the legal artifact.
--
-- The typed name and the rendered image are presentation. What matters is
-- the row: who accepted, from where, at what moment, under which agreement
-- version, having ticked which confirmations, against a document whose hash
-- is recorded so the file can be proven unchanged.
--
-- The four confirmations are stored as four columns rather than one
-- "accepted_terms" boolean, because "they agreed to everything" is not a
-- claim this table should be able to make on its own.
-- ---------------------------------------------------------------------
create table if not exists public.proposal_signatures (
  id                 uuid primary key default gen_random_uuid(),
  proposal_id        uuid not null references public.proposals(id) on delete cascade,

  signer_name        text not null,
  signer_email       text not null,
  signer_title       text,

  signature_type     text not null default 'typed'
                       check (signature_type in ('typed', 'drawn')),
  signature_text     text,
  -- data: URL for a drawn signature. Null for typed.
  signature_data     text,

  accepted_scope     boolean not null default false,
  accepted_pricing   boolean not null default false,
  accepted_ownership boolean not null default false,
  accepted_agreement boolean not null default false,

  agreement_version    text not null,
  agreement_version_id uuid references public.agreement_versions(id) on delete restrict,

  document_hash      text,
  document_path      text,

  ip_address         inet,
  user_agent         text,

  signed_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),

  -- A signature row may not exist unless every required confirmation was
  -- actually ticked. The route handler checks this too; the database is what
  -- makes the check impossible to skip.
  constraint proposal_signatures_all_confirmed check (
    accepted_scope and accepted_pricing and accepted_ownership and accepted_agreement
  ),
  constraint proposal_signatures_has_mark check (
    (signature_type = 'typed' and coalesce(btrim(signature_text), '') <> '')
    or (signature_type = 'drawn' and coalesce(btrim(signature_data), '') <> '')
  )
);

create index if not exists proposal_signatures_proposal_idx
  on public.proposal_signatures (proposal_id, signed_at desc);

-- ---------------------------------------------------------------------
-- proposal_events — append-only history, same shape as lead_events.
-- ---------------------------------------------------------------------
create table if not exists public.proposal_events (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,

  event_type  text not null check (event_type in (
                'created', 'edited', 'sent', 'resent', 'viewed', 'accepted',
                'declined', 'signed', 'payment_started', 'paid', 'expired',
                'cancelled', 'converted_to_project', 'revised', 'duplicated',
                'reminder_sent', 'note')),

  body        text,
  actor       text,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  inet,

  created_at  timestamptz not null default now()
);

create index if not exists proposal_events_proposal_idx
  on public.proposal_events (proposal_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at, matching the trigger style used since 0001.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['agreement_versions', 'proposals', 'proposal_sections'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- The lock. A signed proposal is a record of what was agreed, so the columns
-- that describe the agreement stop being editable the moment it is signed.
--
-- What may still change afterwards is everything ABOUT the agreement rather
-- than IN it: where it got to (status, paid_at, converted_at), what it is now
-- linked to (invoice, job, customer), and the admin's private notes. A price
-- change after signature is not an edit — it is a new proposal or a change
-- order, which `supersedes_id` exists for.
--
-- Enforced in the database, not only in the action, because the service role
-- bypasses RLS and a route handler bug must not be able to rewrite history.
-- ---------------------------------------------------------------------
create or replace function public.lock_signed_proposal()
returns trigger
language plpgsql
as $fn$
begin
  if old.locked_at is null then
    return new;
  end if;

  if (new.title, new.summary, new.package_key, new.package_name,
      new.client_business_name, new.client_contact_name, new.client_email,
      new.client_phone, new.client_title, new.client_billing_address,
      new.currency, new.subtotal_cents, new.discount_amount_cents,
      new.one_time_price_cents, new.total_cents, new.recurring_price_cents,
      new.recurring_interval, new.deposit_amount_cents, new.payment_mode,
      new.turnaround_note, new.revision_limit, new.hosting_note,
      new.valid_until, new.public_token, new.agreement_version_id,
      new.signed_at, new.kind)
     is distinct from
     (old.title, old.summary, old.package_key, old.package_name,
      old.client_business_name, old.client_contact_name, old.client_email,
      old.client_phone, old.client_title, old.client_billing_address,
      old.currency, old.subtotal_cents, old.discount_amount_cents,
      old.one_time_price_cents, old.total_cents, old.recurring_price_cents,
      old.recurring_interval, old.deposit_amount_cents, old.payment_mode,
      old.turnaround_note, old.revision_limit, old.hosting_note,
      old.valid_until, old.public_token, old.agreement_version_id,
      old.signed_at, old.kind)
  then
    raise exception
      'Proposal % was signed on % and cannot be edited. Issue a revision or a change order instead.',
      old.proposal_number, to_char(old.locked_at, 'YYYY-MM-DD');
  end if;

  -- The frozen document is written once. Overwriting it would destroy the
  -- only evidence of what the signer actually saw.
  if old.signed_document_path is not null
     and new.signed_document_path is distinct from old.signed_document_path then
    raise exception 'The signed document for % is immutable.', old.proposal_number;
  end if;
  if old.signed_document_hash is not null
     and new.signed_document_hash is distinct from old.signed_document_hash then
    raise exception 'The signed document hash for % is immutable.', old.proposal_number;
  end if;

  return new;
end;
$fn$;

drop trigger if exists proposals_lock on public.proposals;
create trigger proposals_lock
  before update on public.proposals
  for each row execute function public.lock_signed_proposal();

-- The same protection for the content tables. Their rows have no lock column
-- of their own, so they ask the parent.
create or replace function public.guard_signed_proposal_child()
returns trigger
language plpgsql
as $fn$
declare
  pid    uuid := coalesce(new.proposal_id, old.proposal_id);
  locked timestamptz;
  num    text;
begin
  select p.locked_at, p.proposal_number into locked, num
    from public.proposals p where p.id = pid;

  if locked is not null then
    raise exception
      'Proposal % was signed on % — its scope and pricing lines cannot be changed.',
      num, to_char(locked, 'YYYY-MM-DD');
  end if;

  return coalesce(new, old);
end;
$fn$;

do $$
declare t text;
begin
  foreach t in array array['proposal_items', 'proposal_sections'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_guard', t);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.guard_signed_proposal_child()',
      t || '_guard', t);
  end loop;
end $$;

-- A signature is never edited and never deleted. Correcting one means a new
-- proposal, exactly as it would on paper.
create or replace function public.reject_signature_change()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'Signature records are immutable.';
end;
$fn$;

drop trigger if exists proposal_signatures_immutable on public.proposal_signatures;
create trigger proposal_signatures_immutable
  before update or delete on public.proposal_signatures
  for each row execute function public.reject_signature_change();

-- Events are an append-only log; the same reasoning applies.
drop trigger if exists proposal_events_immutable on public.proposal_events;
create trigger proposal_events_immutable
  before update or delete on public.proposal_events
  for each row execute function public.reject_signature_change();

-- ---------------------------------------------------------------------
-- RLS — deny by default, admins only, anon revoked. Identical to 0001/0015.
-- The client's access is not a database grant: it is the service role acting
-- on their behalf after a route handler has checked their token.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'agreement_versions', 'proposal_counters', 'proposals', 'proposal_items',
    'proposal_sections', 'proposal_signatures', 'proposal_events'
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

-- ---------------------------------------------------------------------
-- Private storage for signed documents.
--
-- Never public: a guessable URL to somebody's signed contract, carrying their
-- name, business and price, is a leak with their name on it. The admin reads
-- it through a short-lived signed URL, exactly as 0011 and 0015 do.
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
  values ('proposal-documents', 'proposal-documents', false, 10485760)
  on conflict (id) do update set public = false;

  execute 'drop policy if exists proposal_docs_admin_read on storage.objects';
  execute 'drop policy if exists proposal_docs_admin_write on storage.objects';
  execute 'drop policy if exists proposal_docs_admin_delete on storage.objects';

  execute $p$
    create policy proposal_docs_admin_read on storage.objects
      for select to authenticated
      using (bucket_id = 'proposal-documents' and public.is_admin())
  $p$;
  execute $p$
    create policy proposal_docs_admin_write on storage.objects
      for insert to authenticated
      with check (bucket_id = 'proposal-documents' and public.is_admin())
  $p$;
  execute $p$
    create policy proposal_docs_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'proposal-documents' and public.is_admin())
  $p$;
  -- Deliberately no update policy: a signed document is written once.
end $$;

-- ---------------------------------------------------------------------
-- Seed: agreement version 1.0.
--
-- This is the Website Development, Hosting & Software License Agreement as
-- supplied, transcribed clause for clause. Nothing has been added, softened
-- or invented — where the paper contract says something, this says the same
-- thing, and where it does not, this is silent.
--
-- Exhibit A (Project Order / Commercial Terms) is deliberately NOT stored
-- here. The proposal itself IS the Project Order: its scope items, package,
-- build fee, hosting fee, payment schedule and ownership selection are the
-- rows above, and the public page renders them in Exhibit A's place. Keeping
-- a second blank copy in the agreement text would guarantee the two disagree.
--
-- `on conflict (version) do nothing` so re-running the migration never
-- overwrites wording that has since been edited in Admin Settings.
-- ---------------------------------------------------------------------
insert into public.agreement_versions
  (version, title, intro, status, published_at, created_by, sections, ownership_rows)
values (
  '1.0',
  'Website Development, Hosting & Software License Agreement',
  $intro$Professional client agreement for websites, admin centers, business systems, automation, AI features and managed hosting.

Parties. This Website Development, Hosting & Software License Agreement (the "Agreement") is entered into by and between Tomorrow's Tech AI ("Provider") and the client identified above ("Client"). The Agreement consists of these general terms together with any signed Project Order, proposal, invoice, statement of work, or addendum incorporated by reference.

Core ownership principle. Client owns its brand, client-provided materials, domain rights it controls, and its business/customer data. Provider retains ownership of Provider Technology, including reusable or proprietary code, admin centers, backend software, frameworks, automation, AI systems, integrations, architecture, templates, libraries, workflows, and other technology developed or supplied by Provider. Standard website pricing provides a license to use Provider Technology; it does not transfer Provider Technology source-code ownership.$intro$,
  'published',
  now(),
  'system',
  $json$[
  {
    "n": "1",
    "heading": "Services and Project Scope",
    "paragraphs": [
      "1.1 Project Services. Provider will perform only the services identified in the applicable Project Order, proposal, invoice, statement of work, or written change order. Services may include website design/development, hosting, database configuration, admin-center functionality, CRM features, inventory systems, integrations, automation, AI-enabled functionality, e-commerce, analytics, or related implementation work.",
      "1.2 Scope Boundary. Anything not expressly included in the agreed scope is excluded. Examples may include additional pages, bulk data entry, custom applications, complex integrations, paid third-party services, custom copywriting, extensive media production, or unlimited revisions unless specifically listed.",
      "1.3 Acceptance. Client will review deliverables promptly. Unless the Project Order provides a different period, a deliverable is deemed accepted when Client approves it in writing, publishes/uses it in production, or fails to identify a material scope-related defect within ten (10) calendar days after delivery for review."
    ],
    "bullets": []
  },
  {
    "n": "2",
    "heading": "Fees, Payments and Change Orders",
    "paragraphs": [
      "2.1 Fees. Client will pay the build fee, recurring hosting/management fees, and any other charges shown in the Project Order or invoice. Third-party fees may be billed directly by the vendor or passed through to Client as disclosed.",
      "2.2 Payment Timing. Unless otherwise stated in writing, invoices are due upon receipt. Provider may pause work, withhold launch, suspend managed services, or delay transfer assistance while undisputed amounts are overdue.",
      "2.3 Changes. Requests beyond the agreed scope require a written change order, revised proposal, or additional invoice before work begins. Schedule and price may change accordingly.",
      "2.4 No Ownership Transfer Before Payment. No ownership, expanded license, source-code release, export assistance, or transfer obligation becomes effective until all amounts due for the applicable work are paid in full."
    ],
    "bullets": []
  },
  {
    "n": "3",
    "heading": "Client Responsibilities",
    "paragraphs": [
      "Project delays caused by missing materials, access, approvals, or third-party dependencies may extend delivery dates without constituting Provider delay."
    ],
    "bullets": [
      "Provide accurate business information, branding, content, images, product/service details, approvals, credentials, and other materials reasonably needed for the project.",
      "Confirm that Client has the legal right to use all materials supplied to Provider.",
      "Maintain accurate contact information and timely access to decision-makers.",
      "Review and approve content, legal disclosures, pricing, financing claims, product claims, and regulated-business statements before publication.",
      "Maintain required licenses, permits, privacy notices, terms, compliance notices, and industry-specific obligations applicable to Client's business."
    ]
  },
  {
    "n": "4",
    "heading": "Ownership of Client Materials and Client Data",
    "paragraphs": [
      "4.1 Client Materials. As between the parties, Client retains ownership of trademarks, logos, photographs, videos, copy, product data, music, artwork, and other materials that Client owned or controlled before providing them to Provider (\"Client Materials\").",
      "4.2 Client Data. Client retains ownership of its customer records, leads, inventory records, orders, submitted form data, and other business data generated through the site or system (\"Client Data\"), subject to applicable law and third-party platform terms.",
      "4.3 License to Provider. Client grants Provider a limited license to host, process, reproduce, transform, display, and transmit Client Materials and Client Data only as reasonably necessary to provide, secure, maintain, support, improve, migrate, or troubleshoot the contracted services."
    ],
    "bullets": []
  },
  {
    "n": "5",
    "heading": "Provider Technology and Intellectual Property",
    "paragraphs": [
      "5.1 Provider Technology. \"Provider Technology\" means all technology, intellectual property, know-how, methods, reusable assets, and systems owned, developed, licensed, or created by Provider outside or during the project that are reusable across clients or form part of Provider's business platform. Provider Technology includes, without limitation:",
      "5.2 Retained Ownership. Provider retains all right, title, and interest in Provider Technology, including all improvements, derivatives, modifications, and reusable techniques, even when Provider Technology is configured, branded, or customized for Client.",
      "5.3 No Implied Source-Code Sale. A website build fee, setup fee, monthly hosting fee, maintenance fee, or feature-development fee does not by itself constitute a sale or assignment of Provider Technology or its source code."
    ],
    "bullets": [
      "Admin centers, dashboards, backend systems, internal consoles, and operational software.",
      "Source code, reusable components, templates, themes, modules, libraries, schemas, database architecture, APIs, middleware, and integration layers.",
      "CRM logic, lead pipelines, inventory-management logic, workflow engines, automations, notifications, analytics systems, and reporting structures.",
      "AI prompts, agents, orchestration logic, AI workflows, model integrations, retrieval systems, automation architecture, and related implementation methods.",
      "Deployment methods, DevOps configuration, security patterns, documentation, utilities, scripts, internal tooling, and technical know-how."
    ]
  },
  {
    "n": "6",
    "heading": "Client License to Use Provider Technology",
    "paragraphs": [
      "6.1 Standard License. Upon full payment, Provider grants Client a non-exclusive, non-transferable (except in connection with a permitted business transfer), non-sublicensable license to use the Provider Technology incorporated into the delivered solution solely for Client's own business operations and public-facing website experience, subject to this Agreement and any applicable recurring service terms.",
      "6.2 Restrictions. Unless Provider agrees otherwise in writing, Client may not sell, sublicense, publish, distribute, provide source access to, reverse engineer, copy for competing commercial use, or authorize a third party to extract and reuse Provider Technology as a standalone product or development framework.",
      "6.3 Client-Controlled Frontend Content. Provider may, at its discretion or if stated in the Project Order, provide exportable frontend files or a portable public-site build. Such delivery does not include Provider Technology excluded under Section 5 unless specifically identified in a signed source-code buyout."
    ],
    "bullets": []
  },
  {
    "n": "7",
    "heading": "Source-Code and Backend Buyout",
    "paragraphs": [
      "7.1 Not Included by Default. Full ownership of source code, backend systems, admin-center software, database architecture, automations, AI systems, or other Provider Technology is not included in standard website pricing.",
      "7.2 Separate Buyout. If Client requests ownership of identified Provider Technology, the parties may execute a separate Source-Code / IP Buyout Addendum that identifies the exact assets being transferred, excluded reusable assets, transfer date, support obligations, third-party limitations, and buyout price.",
      "7.3 No Obligation to Sell. Provider is not required to sell or assign Provider Technology. Provider may instead offer an expanded license, migration package, API access, or other commercial arrangement."
    ],
    "bullets": []
  },
  {
    "n": "8",
    "heading": "Hosting, Management and Managed Services",
    "paragraphs": [
      "8.1 Separate Service. Hosting, monitoring, maintenance, backups, deployment management, updates, technical support, analytics, and related managed services are separate from the one-time build fee and are billed at the recurring rate stated in the Project Order.",
      "8.2 Service Dependencies. Hosting and application functionality may depend on third-party providers such as Vercel, Supabase, domain registrars, payment processors, communications providers, e-commerce platforms, AI vendors, analytics providers, or other services. Provider does not control their uptime, policies, pricing, or future availability.",
      "8.3 Suspension. Provider may suspend managed services for nonpayment, security risk, unlawful use, abuse, or material breach after reasonable notice when practicable.",
      "8.4 Cancellation. Either party may cancel recurring hosting/management according to the notice period in the Project Order. Cancellation does not transfer Provider Technology. Client remains entitled to Client Materials and Client Data, subject to payment of outstanding amounts and reasonable export/transition procedures."
    ],
    "bullets": []
  },
  {
    "n": "9",
    "heading": "Offboarding, Portability and Data Export",
    "paragraphs": [
      "9.1 Client Property. On termination and after payment of all undisputed amounts due, Provider will make commercially reasonable efforts to provide Client with Client Materials and Client Data then held by Provider in a commonly usable format.",
      "9.2 Portable Website. If the Project Order includes a portable website handoff, Provider will provide the deliverables expressly identified there. Provider may remove, replace, disable, or retain Provider Technology, credentials, internal tools, proprietary services, shared infrastructure, automation systems, and licensed third-party assets before handoff.",
      "9.3 Transition Services. Domain changes, migrations, deployment transfer, data conversion, documentation, training, or assistance to another developer may be billed at Provider's then-current rate unless included in the Project Order.",
      "9.4 Retention Window. Unless otherwise required by law or agreed in writing, Provider may delete hosted Client Data and project environments thirty (30) days after service termination. Client should complete any requested exports before that period expires."
    ],
    "bullets": []
  },
  {
    "n": "10",
    "heading": "Third-Party Services, Licenses and Accounts",
    "paragraphs": [
      "Third-party platforms, APIs, fonts, stock assets, payment processors, hosting systems, communications services, repositories, AI providers, e-commerce services, and similar products are governed by their own terms and licenses. Client is responsible for third-party charges assigned to Client and for maintaining any Client-owned accounts. Provider cannot transfer rights that a third party does not permit to be transferred."
    ],
    "bullets": []
  },
  {
    "n": "11",
    "heading": "Privacy, Security and Regulated Information",
    "paragraphs": [
      "11.1 Reasonable Safeguards. Provider will use commercially reasonable technical and organizational measures appropriate to the services being provided, but no system can be guaranteed completely secure or uninterrupted.",
      "11.2 Sensitive Data. Client will not direct Provider to collect or store highly sensitive information, regulated financial data, health data, government identifiers, full payment-card data, or other specially regulated information unless the parties expressly agree on the required security/compliance architecture in writing.",
      "11.3 Client Compliance. Client is responsible for determining which privacy, consumer-protection, accessibility, marketing, financing, advertising, recordkeeping, and industry-specific laws apply to Client's operations and content."
    ],
    "bullets": []
  },
  {
    "n": "12",
    "heading": "Confidentiality",
    "paragraphs": [
      "Each party may receive non-public business, technical, financial, customer, security, or strategic information from the other party (\"Confidential Information\"). The receiving party will use reasonable care to protect Confidential Information and will use it only to perform or receive services under this Agreement. Confidential Information does not include information that is public through no breach, independently developed without use of the other party's information, or lawfully received from another source without confidentiality duty."
    ],
    "bullets": []
  },
  {
    "n": "13",
    "heading": "Portfolio and Publicity",
    "paragraphs": [
      "Unless Client opts out in writing before launch, Provider may identify Client by business name and display publicly available screenshots, links, and a general description of the completed project in Provider's portfolio, proposals, case studies, and marketing. Provider will not disclose Client Confidential Information or non-public Client Data for this purpose."
    ],
    "bullets": []
  },
  {
    "n": "14",
    "heading": "Warranties and Disclaimers",
    "paragraphs": [
      "14.1 Workmanship. Provider warrants that it will perform services in a professional and workmanlike manner consistent with the agreed scope.",
      "14.2 No Business-Outcome Guarantee. Provider does not guarantee search rankings, advertising performance, lead volume, sales, financing approvals, revenue, uptime of third-party systems, AI-output accuracy, or any particular business result.",
      "14.3 Third-Party and AI Outputs. Third-party services and AI-generated outputs may contain errors, limitations, interruptions, or changing functionality. Client remains responsible for reviewing business-critical, legal, financial, medical, regulated, or customer-facing outputs before relying on them.",
      "14.4 Except for express warranties in this Agreement, services and deliverables are provided \"as is\" to the maximum extent permitted by law."
    ],
    "bullets": []
  },
  {
    "n": "15",
    "heading": "Indemnification",
    "paragraphs": [
      "Client will defend and indemnify Provider from third-party claims arising from Client Materials, Client's products/services, Client's unlawful or misleading content, Client's misuse of the services, or Client's violation of third-party rights or applicable law. Provider will defend and indemnify Client from third-party claims that Provider-created deliverables, when used as authorized and excluding Client Materials and third-party components, directly infringe a United States copyright or trademark, subject to prompt notice and Provider control of the defense."
    ],
    "bullets": []
  },
  {
    "n": "16",
    "heading": "Limitation of Liability",
    "paragraphs": [
      "To the maximum extent permitted by law, neither party will be liable to the other for indirect, incidental, special, exemplary, punitive, or consequential damages, or for lost profits, lost revenue, loss of goodwill, or loss of business opportunity arising from this Agreement. Provider's aggregate liability arising from the applicable project or service will not exceed the fees actually paid to Provider for that project or service during the six (6) months immediately preceding the event giving rise to the claim, except to the extent such limitation is prohibited by law."
    ],
    "bullets": []
  },
  {
    "n": "17",
    "heading": "Term and Termination",
    "paragraphs": [
      "17.1 Project Term. Development obligations begin on the Effective Date and continue until the agreed project is completed, terminated, or superseded by a new written scope.",
      "17.2 Managed-Service Term. Recurring services continue month-to-month unless a different term is stated in the Project Order.",
      "17.3 Termination for Breach. Either party may terminate for material breach if the breach is not cured within ten (10) calendar days after written notice, unless the breach is not reasonably curable or immediate suspension is necessary for security, legal, or abuse reasons.",
      "17.4 Effect of Termination. Accrued payment obligations, ownership provisions, license restrictions, confidentiality, disclaimers, indemnification, liability limitations, and provisions intended by their nature to survive will survive termination."
    ],
    "bullets": []
  },
  {
    "n": "18",
    "heading": "Governing Law and Disputes",
    "paragraphs": [
      "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-law rules. Before filing suit, the parties will attempt in good faith to resolve any dispute through direct business discussions. Unless otherwise agreed in writing, venue for any permitted court proceeding will lie in a state or federal court located in the Texas county in which Provider maintains its principal place of business, to the extent legally enforceable."
    ],
    "bullets": []
  },
  {
    "n": "19",
    "heading": "General Terms",
    "paragraphs": [
      "This Agreement and incorporated Project Orders constitute the entire agreement concerning the subject matter and supersede prior discussions about that subject. Amendments must be in writing and accepted by both parties. Client may not assign this Agreement except in connection with a sale of substantially all of Client's business or assets, and only if the assignee accepts this Agreement; Provider may assign this Agreement in connection with a reorganization, sale, or transfer of its business. If any provision is unenforceable, the remaining provisions remain effective. Failure to enforce a provision is not a waiver. Electronic signatures and counterparts are valid to the extent permitted by law."
    ],
    "bullets": []
  }
]$json$::jsonb,
  $own$[
  { "asset": "Client logo, brand, supplied photos/content", "owner": "Client", "treatment": "Client keeps ownership; Provider may use only as needed to perform services." },
  { "asset": "Client customer records, leads, inventory and orders", "owner": "Client", "treatment": "Exportable subject to payment, law, platform limits and reasonable transition procedures." },
  { "asset": "Domain registered to Client", "owner": "Client", "treatment": "Client retains control subject to registrar rules and account ownership." },
  { "asset": "Public website experience", "owner": "Client licensed / as ordered", "treatment": "Client may use the delivered site; portability depends on the Project Order." },
  { "asset": "Admin center / backend software", "owner": "Tomorrow's Tech AI", "treatment": "Provider Technology; not sold through standard build pricing." },
  { "asset": "CRM, pipeline, workflow and automation logic", "owner": "Tomorrow's Tech AI", "treatment": "Provider Technology; licensed for Client use." },
  { "asset": "AI systems, prompts, agents and orchestration", "owner": "Tomorrow's Tech AI", "treatment": "Provider Technology; third-party AI terms also apply." },
  { "asset": "Reusable code, components, templates and frameworks", "owner": "Tomorrow's Tech AI", "treatment": "Provider retains ownership and may reuse across projects." },
  { "asset": "Third-party services, APIs, fonts and licensed media", "owner": "Third party / license owner", "treatment": "Governed by third-party terms; cannot be transferred beyond allowed rights." },
  { "asset": "Full backend/source-code ownership", "owner": "Only by separate written buyout", "treatment": "Requires a specifically priced Source-Code / IP Buyout Addendum." }
]$own$::jsonb
)
on conflict (version) do nothing;
