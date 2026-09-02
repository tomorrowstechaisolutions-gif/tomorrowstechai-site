-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Calendar: the one table the schedule was actually missing.
--
-- The Calendar page AGGREGATES. It does not own the dates it shows, and this
-- migration adds exactly one table because everything else already has a home:
--
--   tasks              due_at, due_time, start_date          (0007, 0017)
--   jobs               started_at, due_at, launched_at        (0004)
--   proposals          sent_at, valid_until                   (0016)
--   leads              next_followup_at                       (0001)
--   lead_followups     due_at — the automated 24h/72h sequence (0001)
--   appointments       scheduled_at — booked client meetings   (0001)
--   social_posts       scheduled_at, published_at             (0011)
--   website_renewals   renews_at, by kind: domain/hosting/ssl (0010)
--   customers          renews_at — the subscription bill date  (0010)
--
-- Copying any of those into a calendar row would create a second answer to
-- "when is this due", and the two would drift the first time somebody edited
-- the wrong one. src/lib/calendar/service.ts reads them where they live and
-- normalises them into one shape.
--
-- What genuinely had nowhere to live is a meeting, a huddle, a standing
-- review — something scheduled that is not a task, a build, a proposal or a
-- renewal. That is what this table is for, and nothing else.
--
-- `appointments` already exists and is NOT replaced: it is where the public
-- booking flow writes, keyed to a lead. This table is what the admin creates
-- by hand, and the calendar shows both.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.calendar_events (
  id            uuid primary key default gen_random_uuid(),

  title         text not null,
  description   text,

  -- The same category vocabulary every aggregated source is normalised into,
  -- so a hand-made event and a task deadline can share one legend.
  event_type    text not null default 'meeting' check (event_type in (
                  'task', 'meeting', 'project', 'milestone', 'proposal',
                  'sales_followup', 'launch', 'content', 'hosting',
                  'domain', 'internal')),

  -- What it is about. All nullable: an internal huddle belongs to nobody.
  client_id     uuid references public.customers(id) on delete set null,
  project_id    uuid references public.jobs(id)      on delete set null,
  proposal_id   uuid references public.proposals(id) on delete set null,
  lead_id       uuid references public.leads(id)     on delete set null,
  task_id       uuid references public.tasks(id)     on delete set null,

  -- Text, matching tasks.owner and every other owner column in this database.
  assigned_to   text,

  start_at      timestamptz not null,
  -- Null means a point in time rather than a span — a deadline, not a block.
  end_at        timestamptz,
  all_day       boolean not null default false,

  location      text,
  meeting_url   text,

  status        text not null default 'scheduled' check (status in (
                  'scheduled', 'in_progress', 'waiting', 'completed', 'canceled')),
  priority      text not null default 'medium'
                  check (priority in ('low', 'medium', 'high', 'critical')),

  -- An RFC 5545 RRULE, e.g. FREQ=WEEKLY;BYDAY=MO. Stored as the standard
  -- string rather than a set of columns so a rule this app cannot yet build
  -- is still a rule it can store, and so an export to a real calendar later
  -- is a copy rather than a translation.
  recurrence_rule text,
  -- When the repetition stops. Null repeats indefinitely; the service only
  -- ever expands occurrences inside the window being viewed.
  recurrence_until timestamptz,

  -- Minutes before start_at. Null means no reminder. Stored now, delivered
  -- when there is something to deliver with — this app has no notification
  -- infrastructure yet and inventing one here would be a fake integration.
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes >= 0),

  tags          text[] not null default '{}',

  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  canceled_at   timestamptz,

  -- An event that ends before it starts is a typo, not a schedule.
  constraint calendar_events_span check (end_at is null or end_at >= start_at),
  -- A recurrence that stops before it starts would expand to nothing.
  constraint calendar_events_recurrence check (
    recurrence_until is null or recurrence_rule is not null
  )
);

-- The range scan the week and month views run, and the per-entity lookups the
-- project and client screens will want.
create index if not exists calendar_events_window_idx
  on public.calendar_events (start_at, end_at);
create index if not exists calendar_events_owner_idx
  on public.calendar_events (assigned_to, start_at) where assigned_to is not null;
create index if not exists calendar_events_client_idx
  on public.calendar_events (client_id) where client_id is not null;
create index if not exists calendar_events_project_idx
  on public.calendar_events (project_id) where project_id is not null;
create index if not exists calendar_events_task_idx
  on public.calendar_events (task_id) where task_id is not null;
-- Recurring rows are fetched for every window regardless of their start date,
-- so they get their own small index rather than riding the range scan.
create index if not exists calendar_events_recurring_idx
  on public.calendar_events (recurrence_rule) where recurrence_rule is not null;

-- ---------------------------------------------------------------------
-- Status stamps, so "completed" always says when.
-- ---------------------------------------------------------------------
create or replace function public.stamp_calendar_event()
returns trigger
language plpgsql
as $fn$
begin
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  if new.status = 'canceled' and new.canceled_at is null then
    new.canceled_at := now();
  elsif new.status <> 'canceled' then
    new.canceled_at := null;
  end if;

  return new;
end;
$fn$;

drop trigger if exists calendar_events_stamp on public.calendar_events;
create trigger calendar_events_stamp
  before insert or update on public.calendar_events
  for each row execute function public.stamp_calendar_event();

drop trigger if exists calendar_events_touch on public.calendar_events;
create trigger calendar_events_touch
  before update on public.calendar_events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS — deny by default, admins only, anon revoked. Identical to 0001/0017.
-- ---------------------------------------------------------------------
alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_admin_select on public.calendar_events;
drop policy if exists calendar_events_admin_insert on public.calendar_events;
drop policy if exists calendar_events_admin_update on public.calendar_events;
drop policy if exists calendar_events_admin_delete on public.calendar_events;

create policy calendar_events_admin_select on public.calendar_events
  for select to authenticated using (public.is_admin());
create policy calendar_events_admin_insert on public.calendar_events
  for insert to authenticated with check (public.is_admin());
create policy calendar_events_admin_update on public.calendar_events
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy calendar_events_admin_delete on public.calendar_events
  for delete to authenticated using (public.is_admin());

revoke all on public.calendar_events from anon;
