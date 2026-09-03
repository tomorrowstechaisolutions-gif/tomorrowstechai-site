-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 — Client action requests
--
-- The recurring shape this exists for: a build stalls on something only the
-- client can do. Open the Stripe account. Unlock the domain. Send the logo.
-- Grant access to the Google Business Profile. Every one of those was being
-- chased by hand over text and email, and "who is holding the ball" was only
-- ever in John's head.
--
-- One button now sends a branded email and a tokenised page that says what
-- is on them, how to do it, and what to send back — and the row here is what
-- turns that from a sent message into a tracked obligation with a status.
--
-- WHAT THE TEMPLATES SAY LIVES IN CODE, NOT HERE.
-- `src/lib/requests/config.ts` owns the steps, the fields and the copy, the
-- same seam tasks/config.ts uses. A new kind of request is a new object in
-- that file, not a migration. This table stores only what is true about one
-- SENT request: who, when, where it got to, and what came back.
--
-- The client is never an authenticated user. Every read and write on their
-- side goes through a route handler using the service role, keyed by the
-- token — the decision made in 0001 and repeated in 0015, for the same
-- reason: an anon-writable table bypasses the token check and the expiry.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------
-- client_requests — one row per thing asked of one client, once.
--
-- Attachable to a customer, a lead, a project or a proposal, all nullable,
-- because the ask lands at different points in the relationship. Stripe is
-- usually asked of a customer mid-build; domain access is often asked of a
-- lead before anything is signed. Requiring a customer_id would mean
-- creating a fake client to send an email.
-- ---------------------------------------------------------------------
create table if not exists public.client_requests (
  id                uuid primary key default gen_random_uuid(),

  customer_id       uuid references public.customers(id) on delete cascade,
  lead_id           uuid references public.leads(id)     on delete set null,
  job_id            uuid references public.jobs(id)      on delete set null,
  proposal_id       uuid references public.proposals(id) on delete set null,

  -- Which template built this. Not a foreign key and not constrained to a
  -- list: the catalogue is in code, it will grow, and a check constraint
  -- here would mean a migration every time John adds a request type.
  template_key      text not null,

  -- Snapshot of what the client was actually asked, taken at send time.
  -- The template copy will be edited; a request sent in September must
  -- still say in December what it said when it went out.
  title             text not null,
  summary           text,

  -- The client's only credential. Long, random, expiring — a link that
  -- works forever is a link that still works after it leaks.
  token             text not null unique,
  token_expires_at  timestamptz not null default (now() + interval '60 days'),

  -- draft   — built, not sent. Lets John look before it goes.
  -- sent    — delivered (or attempted; see delivered).
  -- opened  — they loaded the page at least once.
  -- started — they saved something without finishing.
  -- completed — they pressed the final button.
  -- canceled — no longer needed, or superseded by a re-send.
  status            text not null default 'draft' check (status in
                      ('draft', 'sent', 'opened', 'started', 'completed', 'canceled')),

  to_email          text not null,
  to_name           text,

  -- John's own line at the top of the email. The difference between a
  -- form letter and a message from a person.
  note              text,

  -- When this stops being polite and starts being a blocker.
  due_at            timestamptz,

  -- Whether Resend accepted it. Separate from `status` on purpose: a send
  -- that failed must not look like a client who has not replied yet.
  delivered         boolean not null default false,

  sent_at           timestamptz,
  first_opened_at   timestamptz,
  last_opened_at    timestamptz,
  completed_at      timestamptz,
  canceled_at       timestamptz,

  reminder_count    integer not null default 0 check (reminder_count >= 0),
  last_reminded_at  timestamptz,

  -- What they ticked off, as template step ids: ["invite", "verify"].
  steps_done        jsonb not null default '[]'::jsonb,

  -- What they sent back, keyed by the template's field keys.
  --
  -- NEVER A SECRET. No passwords, no API keys, no card numbers — the
  -- templates ask clients to INVITE us to their account instead, and
  -- config.ts refuses at module load to build a template with a field key
  -- that looks like a credential. This column is plain jsonb in a database
  -- John's admin can read; treat it as a postcard, not an envelope.
  payload           jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists client_requests_customer_idx
  on public.client_requests (customer_id, created_at desc);
create index if not exists client_requests_status_idx
  on public.client_requests (status, created_at desc);
create index if not exists client_requests_job_idx
  on public.client_requests (job_id);
create index if not exists client_requests_open_idx
  on public.client_requests (due_at)
  where status in ('sent', 'opened', 'started');

drop trigger if exists client_requests_touch on public.client_requests;
create trigger client_requests_touch before update on public.client_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- client_request_events — the history, append-only.
--
-- Same posture as task_events: every state change writes a row, so "I sent
-- that twice and they opened it once" is answerable three weeks later
-- without anyone remembering. Nothing reads this to compute state; the
-- columns above are the state. This is the audit trail.
-- ---------------------------------------------------------------------
create table if not exists public.client_request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.client_requests(id) on delete cascade,

  kind        text not null check (kind in
                ('created', 'sent', 'send_failed', 'opened', 'saved',
                 'submitted', 'reminded', 'canceled', 'reopened')),
  detail      text,
  meta        jsonb not null default '{}'::jsonb,

  at          timestamptz not null default now()
);

create index if not exists client_request_events_request_idx
  on public.client_request_events (request_id, at desc);

-- ---------------------------------------------------------------------
-- RLS — deny by default, admins only, anon revoked. Identical to 0015.
-- The client's access is not a database grant; it is the service role
-- acting on their behalf after the route handler has checked their token.
-- ---------------------------------------------------------------------
alter table public.client_requests       enable row level security;
alter table public.client_request_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['client_requests', 'client_request_events'] loop
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
