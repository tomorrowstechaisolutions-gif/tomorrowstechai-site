-- ---------------------------------------------------------------------
-- 0014 — the Pipeline.
--
-- `deals` already exists (0013) with company_id, lead_id, customer_id,
-- catalog_item_id, stage, value_cents, billing, expected_close, won_at,
-- lost_at, lost_reason, owner and source. The eight stages are already the
-- ones the dashboard pipeline uses. None of that is rebuilt here.
--
-- Four things the sales-execution screen needs that a deal record alone
-- cannot answer:
--
--   "how likely is this?"        → probability
--   "how long has it sat here?"  → stage_entered_at
--   "where do deals leak?"       → deal_stage_history
--   "are we going to make it?"   → sales_targets
--
-- And one that no table can answer without being told over time:
--   "what was the pipeline worth last month?" → pipeline_snapshots,
--   which starts recording from today. There is no way to reconstruct a
--   past pipeline from present rows, and inventing the line would make the
--   only chart on this page that looks like history into a fiction.
-- ---------------------------------------------------------------------

-- ── Columns on deals ─────────────────────────────────────────────────
alter table public.deals
  add column if not exists probability integer,
  add column if not exists stage_entered_at timestamptz not null default now(),
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists campaign text,
  add column if not exists last_activity_at timestamptz,
  -- Set by the owner, not by a formula: "I am counting on this one."
  -- Commit is a promise a person makes; deriving it from probability would
  -- turn a forecast into a restatement of the same guess.
  add column if not exists committed boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deals_probability_check') then
    alter table public.deals add constraint deals_probability_check
      check (probability is null or (probability >= 0 and probability <= 100));
  end if;
end $$;

create index if not exists deals_stage_age_idx on public.deals (stage_entered_at)
  where stage not in ('won', 'lost');
create index if not exists deals_commit_idx on public.deals (committed)
  where committed and stage not in ('won', 'lost');

-- ── deal_stage_history ───────────────────────────────────────────────
-- Every stage move, with how long the deal sat in the stage it left.
--
-- This is what makes conversion reporting real. Counting how many deals are
-- currently in each stage tells you the shape of the pipeline today; it
-- cannot tell you that 24 deals entered Qualified and 17 went on to
-- Discovery, because the other 7 have already moved past or out. Only a log
-- of the transitions themselves can answer that.
create table if not exists public.deal_stage_history (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals(id) on delete cascade,

  from_stage    text,
  to_stage      text not null,

  -- Recorded at the moment of the move, because the deal's value can change
  -- afterwards and the history must not change with it.
  value_cents   integer,
  probability   integer,

  days_in_previous_stage numeric(8, 2),
  changed_by    text,
  note          text,
  changed_at    timestamptz not null default now()
);

create index if not exists deal_stage_history_deal_idx
  on public.deal_stage_history (deal_id, changed_at desc);
create index if not exists deal_stage_history_transition_idx
  on public.deal_stage_history (from_stage, to_stage, changed_at desc);

-- ── The trigger that keeps history honest ────────────────────────────
-- Written in the database rather than in a server action, because a stage
-- change made from anywhere — a form, a script, the SQL editor, a future
-- automation — must leave the same trail. History that depends on every
-- caller remembering to write it is history that has holes in it.
create or replace function public.record_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.deal_stage_history
      (deal_id, from_stage, to_stage, value_cents, probability, changed_by)
    values (new.id, null, new.stage, new.value_cents, new.probability, new.owner);
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into public.deal_stage_history
      (deal_id, from_stage, to_stage, value_cents, probability,
       days_in_previous_stage, changed_by)
    values (
      new.id, old.stage, new.stage, new.value_cents, new.probability,
      round(extract(epoch from (now() - old.stage_entered_at)) / 86400.0, 2),
      new.owner
    );
    -- The clock restarts here, so "days in stage" is always the current
    -- stage rather than the age of the deal.
    new.stage_entered_at := now();
  end if;

  return new;
end $$;

drop trigger if exists deals_stage_history_ins on public.deals;
create trigger deals_stage_history_ins
  after insert on public.deals
  for each row execute function public.record_deal_stage_change();

drop trigger if exists deals_stage_history_upd on public.deals;
create trigger deals_stage_history_upd
  before update of stage on public.deals
  for each row execute function public.record_deal_stage_change();

-- ── sales_targets ────────────────────────────────────────────────────
-- A forecast gap is meaningless without a number to miss.
--
-- No target is invented. The screen says "no sales target configured" and
-- offers to set one, because a made-up target produces a made-up gap and
-- that gap is what somebody would change their week over.
create table if not exists public.sales_targets (
  id            uuid primary key default gen_random_uuid(),
  -- The first day of the month this target covers.
  period_start  date not null,
  period        text not null default 'month' check (period in ('month', 'quarter', 'year')),
  target_cents  integer not null check (target_cents >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists sales_targets_period_idx
  on public.sales_targets (period, period_start);

-- ── pipeline_snapshots ───────────────────────────────────────────────
-- What the pipeline was worth on a given day.
--
-- This CANNOT be reconstructed from today's rows: a deal's value changes,
-- deals are created and closed, and nothing in the present tells you what
-- the total was three weeks ago. So the chart starts empty and fills in one
-- day at a time from here. Drawing a line through invented points would
-- make the one chart on this page that looks like history into a fiction.
create table if not exists public.pipeline_snapshots (
  id               uuid primary key default gen_random_uuid(),
  captured_on      date not null,

  open_deals       integer not null default 0,
  pipeline_cents   integer not null default 0,
  weighted_cents   integer not null default 0,
  committed_cents  integer not null default 0,
  won_month_cents  integer not null default 0,
  won_month_count  integer not null default 0,

  created_at       timestamptz not null default now()
);

create unique index if not exists pipeline_snapshots_day_idx
  on public.pipeline_snapshots (captured_on);

-- ── updated_at ───────────────────────────────────────────────────────
drop trigger if exists sales_targets_touch on public.sales_targets;
create trigger sales_targets_touch before update on public.sales_targets
  for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['deal_stage_history', 'sales_targets', 'pipeline_snapshots'] loop
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

-- ── No probability backfill, on purpose ──────────────────────────────
-- The obvious move here is to fill `probability` in from the stage for every
-- existing deal. It is the wrong move: a stored probability stops tracking
-- the stage. A deal backfilled at 10 for "new" would still weigh 10% after
-- it reached Proposal, and the weighted pipeline would quietly understate
-- itself for every deal that predates this migration.
--
-- Null is the more useful value. `effectiveProbability()` in
-- src/lib/pipeline/forecast.ts reads null as "use the stage default", so an
-- untouched deal follows its stage automatically and only an owner typing a
-- number pins it. That also keeps "nobody has judged this one" and "somebody
-- said 40%" distinguishable, which is the difference the Advisor reads.
