-- ─────────────────────────────────────────────────────────────────────
-- Make the ON CONFLICT targets reachable from PostgREST.
--
-- THE BUG: four upserts name a conflict target of plain columns —
--   email_audience_members     (audience_id, email)
--   email_sequence_enrollments (sequence_id, email)
--   email_campaign_recipients  (campaign_id, email)   <- the SEND path
--   software_plan_limits       (plan_id, limit_key)
-- but each table's unique index is on an EXPRESSION, lower(email).
-- Postgres will not match a bare-column ON CONFLICT specification to an
-- expression index, so every one of those upserts fails outright with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Importing contacts, enrolling a sequence, building a
-- recipient list and saving a plan limit were all dead.
--
-- THE FIX: keep the case-insensitive guarantee, but move it from the index
-- to the write. A BEFORE trigger lowercases the column, so the value stored
-- is already canonical and a plain unique index on the bare columns means
-- exactly what the expression index meant — while also being a target
-- PostgREST can name.
--
-- Lowercasing existing rows cannot collide: the expression index being
-- dropped already guaranteed no two rows differ only by case.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ── the normalisers ──────────────────────────────────────────────────
-- One function per column name rather than one clever dynamic function:
-- a trigger that reads TG_ARGV and pokes at NEW by name needs plpgsql
-- record surgery, and this is three lines.

create or replace function public.email_lowercase_email()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

create or replace function public.software_lowercase_limit_key()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  new.limit_key := lower(trim(new.limit_key));
  return new;
end;
$$;

-- ── email_audience_members ───────────────────────────────────────────
update public.email_audience_members
   set email = lower(trim(email))
 where email is distinct from lower(trim(email));

drop index if exists public.email_audience_members_unique_idx;
create unique index if not exists email_audience_members_unique_idx
  on public.email_audience_members (audience_id, email);

drop trigger if exists email_audience_members_lower on public.email_audience_members;
create trigger email_audience_members_lower
  before insert or update of email on public.email_audience_members
  for each row execute function public.email_lowercase_email();

-- ── email_sequence_enrollments ───────────────────────────────────────
update public.email_sequence_enrollments
   set email = lower(trim(email))
 where email is distinct from lower(trim(email));

drop index if exists public.email_sequence_enrollments_unique_idx;
create unique index if not exists email_sequence_enrollments_unique_idx
  on public.email_sequence_enrollments (sequence_id, email);

drop trigger if exists email_sequence_enrollments_lower on public.email_sequence_enrollments;
create trigger email_sequence_enrollments_lower
  before insert or update of email on public.email_sequence_enrollments
  for each row execute function public.email_lowercase_email();

-- ── email_campaign_recipients ────────────────────────────────────────
update public.email_campaign_recipients
   set email = lower(trim(email))
 where email is distinct from lower(trim(email));

drop index if exists public.email_campaign_recipients_unique_idx;
create unique index if not exists email_campaign_recipients_unique_idx
  on public.email_campaign_recipients (campaign_id, email);

drop trigger if exists email_campaign_recipients_lower on public.email_campaign_recipients;
create trigger email_campaign_recipients_lower
  before insert or update of email on public.email_campaign_recipients
  for each row execute function public.email_lowercase_email();

-- ── software_plan_limits ─────────────────────────────────────────────
update public.software_plan_limits
   set limit_key = lower(trim(limit_key))
 where limit_key is distinct from lower(trim(limit_key));

drop index if exists public.software_plan_limits_unique_idx;
create unique index if not exists software_plan_limits_unique_idx
  on public.software_plan_limits (plan_id, limit_key);

drop trigger if exists software_plan_limits_lower on public.software_plan_limits;
create trigger software_plan_limits_lower
  before insert or update of limit_key on public.software_plan_limits
  for each row execute function public.software_lowercase_limit_key();

commit;
