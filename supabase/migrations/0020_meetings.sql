-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — Meetings: scheduling a real conversation with a real person, and
--        the conferencing provider that hosts it.
--
-- The journey this completes:
--   Lead / Client → Schedule → Google Calendar event + Meet link → invite
--        → the existing admin Calendar → Start → Complete → notes, outcome,
--          follow-up task → CRM timeline
--
-- WHAT ALREADY EXISTED and is NOT duplicated here:
--   leads / customers / companies   who the meeting is with (0001, 0013).
--   jobs / proposals                what it is about (0004, 0016).
--   tasks                           follow-up work. A meeting that needs a
--                                   follow-up writes a `tasks` row and points
--                                   at it; there is no second task system.
--   lead_events / job_events        the CRM and project timelines. Meetings
--                                   append to those rather than opening a
--                                   third activity log.
--   calendar_events                 the calendar's OWN rows. A meeting is not
--                                   one of those — it is a tenth source that
--                                   getCalendarItems() reads where it lives,
--                                   exactly as 0019 intended.
--
--   appointments (0001) is deliberately left alone. It is the website's
--   booking log — nine columns, lead-only, counted by the marketing funnel as
--   "appointments booked". Widening it into a full meetings record would have
--   changed what that funnel metric means. The two coexist on the calendar as
--   two different facts: someone asked for a call, versus a call is scheduled
--   with a provider, an agenda and an outcome.
--
-- WHAT GENUINELY DID NOT EXIST: a meeting with a start and an end, a
-- conferencing provider, an attendee, an agenda, an outcome and a follow-up.
--
-- Provider design: `provider`, `provider_event_id`, `meeting_url` and
-- `provider_metadata` are provider-agnostic on purpose. Google Meet is the
-- first implementation; Zoom is a second row in a check constraint and a
-- second file in src/lib/meetings/providers/, not a schema change.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------
-- integration_credentials — OAuth tokens, and nothing else.
--
-- Its own table rather than columns on a settings row, because the security
-- posture is different from everything else in the database: RLS is enabled
-- and NO policy is created, so an authenticated admin session cannot read it
-- at all. Only the service role — which lives in server-side route handlers
-- and never reaches the browser — can. A refresh token is a permanent key to
-- someone's calendar; it should not be one SQL injection away from a session.
-- ---------------------------------------------------------------------
create table if not exists public.integration_credentials (
  id                uuid primary key default gen_random_uuid(),

  -- One connected account per provider. Re-connecting replaces it.
  provider          text not null unique
                      check (provider in ('google', 'zoom')),

  -- Which account is connected, so the UI can say so without holding a token.
  account_email     text,
  account_name      text,

  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  scope             text,

  -- Which calendar events are written to. 'primary' unless told otherwise.
  calendar_id       text not null default 'primary',

  connected_by      text,
  connected_at      timestamptz,
  -- Set when a refresh fails, so the UI can say "reconnect" instead of
  -- failing silently the next time someone schedules something.
  last_error        text,
  last_error_at     timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------
create table if not exists public.meetings (
  id                   uuid primary key default gen_random_uuid(),

  -- Who and what it is about. All nullable, because a meeting may be with a
  -- lead who is not yet a client, about a proposal that is not yet a project.
  lead_id              uuid references public.leads(id)      on delete set null,
  customer_id          uuid references public.customers(id)  on delete set null,
  company_id           uuid references public.companies(id)  on delete set null,
  job_id               uuid references public.jobs(id)       on delete set null,
  proposal_id          uuid references public.proposals(id)  on delete set null,

  title                text not null,
  meeting_type         text not null default 'discovery' check (meeting_type in (
                         'discovery', 'demo', 'proposal_review', 'kickoff',
                         'strategy', 'support', 'progress_review', 'training',
                         'final_review', 'follow_up', 'custom')),
  description          text,
  agenda               text,
  -- Free text for 'in_person'. Google Meet fills meeting_url instead.
  location             text,

  -- ── Provider ────────────────────────────────────────────────────
  provider             text not null default 'google_meet' check (provider in (
                         'google_meet', 'zoom', 'phone', 'in_person')),
  -- The provider's own id for the event, so an update is an update and not a
  -- second event. Unique per provider: this is what stops a double-create.
  provider_event_id    text,
  provider_calendar_id text,
  meeting_url          text,
  -- Anything provider-shaped the UI should not need to understand:
  -- htmlLink, hangoutLink, conferenceId, entry points, Zoom host url later.
  provider_metadata    jsonb not null default '{}'::jsonb,
  provider_synced_at   timestamptz,
  -- The last thing the provider said went wrong. Never swallowed.
  provider_error       text,

  -- ── When ────────────────────────────────────────────────────────
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  -- Kept by trigger, not by the caller, so it can never disagree with the
  -- two columns it is derived from.
  duration_minutes     integer not null default 30,
  timezone             text not null default 'America/Chicago',

  status               text not null default 'scheduled' check (status in (
                         'scheduled', 'confirmed', 'in_progress', 'completed',
                         'cancelled', 'no_show', 'rescheduled')),

  -- ── Who is coming ───────────────────────────────────────────────
  attendee_name        text,
  attendee_email       text,
  attendee_phone       text,
  -- Extra invitees, as [{ email, name }]. The one required attendee stays in
  -- its own columns because every screen prints it.
  extra_attendees      jsonb not null default '[]'::jsonb,

  -- ── After it happens ────────────────────────────────────────────
  internal_notes       text,
  outcome              text check (outcome is null or outcome in (
                         'successful', 'follow_up_needed', 'proposal_requested',
                         'client_interested', 'client_not_interested',
                         'project_approved', 'needs_more_information', 'other')),
  next_steps           text,
  follow_up_required   boolean not null default false,
  follow_up_date       date,
  -- The task the follow-up became, in the existing tasks table.
  follow_up_task_id    uuid references public.tasks(id) on delete set null,

  -- ── Rescheduling and cancelling ─────────────────────────────────
  reschedule_count     integer not null default 0 check (reschedule_count >= 0),
  original_start_at    timestamptz,
  cancel_reason        text,

  owner                text,
  created_by           text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz,
  cancelled_at         timestamptz,

  -- A meeting is with somebody. Without this a row can exist that no screen
  -- can address and no invitation can reach.
  constraint meetings_has_a_person
    check (lead_id is not null or customer_id is not null or attendee_email is not null),
  -- An end before its start breaks every window query silently.
  constraint meetings_span check (end_at > start_at),
  -- A conferencing provider needs a link to be startable; phone and in-person
  -- do not. Not enforced at insert because the link arrives from the provider
  -- a moment later — enforced in the service, stated here for the reader.
  constraint meetings_followup_has_date
    check (follow_up_required = false or follow_up_date is not null or status <> 'completed')
);

-- ---------------------------------------------------------------------
-- Indexes.
-- ---------------------------------------------------------------------

-- The calendar's window scan, and the Meetings Center's Today / Upcoming.
create index if not exists meetings_window_idx
  on public.meetings (start_at, end_at);
create index if not exists meetings_status_start_idx
  on public.meetings (status, start_at);

-- "Meetings on this record" — the panels on a lead, client, project, proposal.
create index if not exists meetings_lead_idx
  on public.meetings (lead_id, start_at desc) where lead_id is not null;
create index if not exists meetings_customer_idx
  on public.meetings (customer_id, start_at desc) where customer_id is not null;
create index if not exists meetings_job_idx
  on public.meetings (job_id, start_at desc) where job_id is not null;
create index if not exists meetings_proposal_idx
  on public.meetings (proposal_id, start_at desc) where proposal_id is not null;

-- Needs-follow-up tab.
create index if not exists meetings_followup_idx
  on public.meetings (follow_up_date) where follow_up_required = true;

-- The double-create guard. A provider's event id identifies one event on one
-- provider; two meeting rows must never claim the same one, or an "update"
-- would race an "update" and the client would get two invitations.
create unique index if not exists meetings_provider_event_key
  on public.meetings (provider, provider_event_id)
  where provider_event_id is not null;

-- ---------------------------------------------------------------------
-- Derived columns and status stamps.
--
-- duration_minutes, completed_at and cancelled_at are facts about other
-- columns. Computing them here rather than in the action means they are still
-- right when a row is changed by a webhook, a backfill or psql.
-- ---------------------------------------------------------------------
create or replace function public.stamp_meeting()
returns trigger
language plpgsql
as $fn$
begin
  new.duration_minutes := greatest(
    1, (extract(epoch from (new.end_at - new.start_at)) / 60)::int);

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;

  -- The first time a meeting moves, remember where it was. Only the first,
  -- because "originally" means originally.
  if tg_op = 'UPDATE' and new.start_at is distinct from old.start_at then
    if new.original_start_at is null then
      new.original_start_at := old.start_at;
    end if;
    if new.reschedule_count = old.reschedule_count then
      new.reschedule_count := old.reschedule_count + 1;
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists meetings_stamp on public.meetings;
create trigger meetings_stamp
  before insert or update on public.meetings
  for each row execute function public.stamp_meeting();

drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch
  before update on public.meetings
  for each row execute function public.touch_updated_at();

drop trigger if exists integration_credentials_touch on public.integration_credentials;
create trigger integration_credentials_touch
  before update on public.integration_credentials
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- tasks gains one optional link, so a follow-up task knows which meeting it
-- came out of. Additive, nullable, and consistent with the lead/job/customer
-- links the table already carries.
-- ---------------------------------------------------------------------
alter table public.tasks
  add column if not exists meeting_id uuid references public.meetings(id) on delete set null;

create index if not exists tasks_meeting_idx
  on public.tasks (meeting_id) where meeting_id is not null;

-- ---------------------------------------------------------------------
-- RLS — deny by default, admins only, anon revoked. Identical to 0019.
-- ---------------------------------------------------------------------
alter table public.meetings enable row level security;

drop policy if exists meetings_admin_select on public.meetings;
drop policy if exists meetings_admin_insert on public.meetings;
drop policy if exists meetings_admin_update on public.meetings;
drop policy if exists meetings_admin_delete on public.meetings;

create policy meetings_admin_select on public.meetings
  for select to authenticated using (public.is_admin());
create policy meetings_admin_insert on public.meetings
  for insert to authenticated with check (public.is_admin());
create policy meetings_admin_update on public.meetings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy meetings_admin_delete on public.meetings
  for delete to authenticated using (public.is_admin());

revoke all on public.meetings from anon;

-- integration_credentials: RLS on, and DELIBERATELY NO POLICY.
--
-- Zero policies means zero rows for anon and for authenticated, including an
-- admin session. The service role bypasses RLS, and it is the only thing that
-- ever touches this table — from server-side route handlers that never reach
-- the browser. This is the same reasoning as the token-gated proposal routes
-- in 0016, applied to something even more dangerous than a proposal.
alter table public.integration_credentials enable row level security;
revoke all on public.integration_credentials from anon;
revoke all on public.integration_credentials from authenticated;
