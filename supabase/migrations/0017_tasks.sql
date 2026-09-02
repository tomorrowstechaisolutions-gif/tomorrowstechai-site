-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — Tasks: the work register.
--
-- THIS EXTENDS THE EXISTING `tasks` TABLE. It does not create a second one.
--
-- `tasks` has existed since 0007 and three things already depend on its exact
-- shape. None of them are touched by this migration:
--
--   src/lib/dashboard/today.ts     reads  done = false, orders by due_at
--   src/lib/dashboard/activity.ts  reads  done = true AND done_at is not null
--   dashboard-actions.ts           writes done / done_at from the checkbox
--   proposal-actions.ts            upserts a followup task per lead
--
-- That is why `done` survives alongside the new nine-value `status`. A trigger
-- keeps them honest in both directions, so the dashboard keeps working with
-- no change while the Tasks screen gets a real status vocabulary:
--
--   status → completed   sets done = true  and stamps done_at
--   status → canceled    sets done = true  and leaves done_at NULL, so the
--                        task drops off Today WITHOUT appearing in the
--                        activity feed as something that was completed
--   done   → true        sets status = completed if it was still open
--   done   → false       reopens a completed/canceled task as in_progress
--
-- Two other deliberate non-additions:
--
--   assigned_to — `owner` already is the assignee, as text, exactly as it is
--                 on deals, companies and customers. A parallel uuid column
--                 would be a second answer to "whose is this".
--   project_id / client_id — `job_id` and `customer_id` already are those.
--                 The admin calls jobs "Projects"; renaming the column would
--                 break every screen that reads it for no gain.
--
-- `kind` also stays exactly as it was. It answers "what shape of reminder is
-- this" for the dashboard's Today list; the new `type` answers "what area of
-- the business is this work in" for the Tasks board. Different questions.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------
-- tasks — the new columns.
-- ---------------------------------------------------------------------
alter table public.tasks
  add column if not exists status          text not null default 'not_started',
  add column if not exists type            text not null default 'internal',

  -- The rest of the business. All nullable: a task is allowed to be just a
  -- task, which is why 0007 made every link optional and this keeps that.
  add column if not exists proposal_id     uuid references public.proposals(id)      on delete set null,
  add column if not exists service_id      uuid references public.catalog_items(id)  on delete set null,
  add column if not exists parent_task_id  uuid references public.tasks(id)          on delete cascade,

  add column if not exists start_date      date,
  -- Split from due_at so "Tuesday, no particular time" stays expressible.
  -- due_at remains the sortable instant every existing query uses.
  add column if not exists due_time        time,

  add column if not exists estimated_hours numeric(6,2) check (estimated_hours is null or estimated_hours >= 0),
  add column if not exists actual_hours    numeric(6,2) check (actual_hours    is null or actual_hours    >= 0),

  add column if not exists sort_order      integer not null default 0,
  add column if not exists tags            text[] not null default '{}',

  -- Template rows are the blueprint a project is built from. They never
  -- appear on the board: every list query filters is_template = false.
  add column if not exists is_template     boolean not null default false,
  add column if not exists template_key    text,

  add column if not exists created_by      text,
  -- Why a blocked task is blocked. A status with no reason is a dead end.
  add column if not exists blocked_reason  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_status_check') then
    alter table public.tasks add constraint tasks_status_check check (status in (
      'backlog', 'not_started', 'ready', 'in_progress',
      'waiting', 'review', 'blocked', 'completed', 'canceled'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_type_check') then
    alter table public.tasks add constraint tasks_type_check check (type in (
      'sales', 'proposal', 'client_intake', 'website', 'development', 'design',
      'content', 'seo', 'hosting', 'domain', 'ai', 'automation', 'crm',
      'ecommerce', 'quality', 'launch', 'billing', 'support', 'internal'));
  end if;

  -- A task cannot be its own parent. Deeper cycles are prevented in the
  -- service layer; this catches the one that a single UPDATE can create.
  if not exists (select 1 from pg_constraint where conname = 'tasks_parent_not_self') then
    alter table public.tasks add constraint tasks_parent_not_self
      check (parent_task_id is null or parent_task_id <> id);
  end if;
end $$;

-- Indexes for the queries the Tasks screen actually runs: the open board,
-- the per-entity views, and the template lookup.
create index if not exists tasks_board_idx
  on public.tasks (status, due_at) where is_template = false;
create index if not exists tasks_owner_idx
  on public.tasks (owner, done, due_at) where is_template = false;
create index if not exists tasks_type_idx
  on public.tasks (type) where is_template = false;
create index if not exists tasks_customer_idx
  on public.tasks (customer_id) where customer_id is not null;
create index if not exists tasks_proposal_idx
  on public.tasks (proposal_id) where proposal_id is not null;
create index if not exists tasks_parent_idx
  on public.tasks (parent_task_id) where parent_task_id is not null;
create index if not exists tasks_template_idx
  on public.tasks (template_key) where is_template = true;

-- ---------------------------------------------------------------------
-- Backfill. Every task that already exists gets a status consistent with
-- the flag it already had, so nothing starts life in a contradiction.
-- ---------------------------------------------------------------------
update public.tasks
   set status = case when done then 'completed' else 'not_started' end
 where status = 'not_started' and done = true;

-- The `kind` a task was created with is a decent first guess at its type.
update public.tasks set type = 'sales'    where type = 'internal' and kind in ('followup', 'callback');
update public.tasks set type = 'content'  where type = 'internal' and kind = 'content';
update public.tasks set type = 'billing'  where type = 'internal' and kind = 'invoice';

-- ---------------------------------------------------------------------
-- done ↔ status, kept in step in both directions.
--
-- Written as a trigger rather than as application code because BOTH sides
-- have live writers: the Tasks screen sets status, and the dashboard
-- checkbox sets done. Whichever one moves, the other has to follow, or the
-- same task is open on one screen and finished on another.
-- ---------------------------------------------------------------------
create or replace function public.sync_task_completion()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.status in ('completed', 'canceled') then
      new.done := true;
      if new.status = 'completed' and new.done_at is null then
        new.done_at := now();
      end if;
    elsif new.done then
      new.status := 'completed';
      new.done_at := coalesce(new.done_at, now());
    end if;
    return new;
  end if;

  -- The status moved: the flag follows it.
  if new.status is distinct from old.status then
    if new.status = 'completed' then
      new.done := true;
      new.done_at := coalesce(new.done_at, now());
    elsif new.status = 'canceled' then
      new.done := true;
      -- Deliberately NOT stamped. activity.ts lists done_at IS NOT NULL as
      -- "completed"; a cancelled task did not get done.
      new.done_at := null;
    else
      new.done := false;
      new.done_at := null;
    end if;
    return new;
  end if;

  -- The flag moved: the status follows it.
  if new.done is distinct from old.done then
    if new.done then
      new.status := 'completed';
      new.done_at := coalesce(new.done_at, now());
    else
      new.status := case when old.status in ('completed', 'canceled')
                         then 'in_progress' else old.status end;
      new.done_at := null;
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists tasks_sync_completion on public.tasks;
create trigger tasks_sync_completion
  before insert or update on public.tasks
  for each row execute function public.sync_task_completion();

-- ---------------------------------------------------------------------
-- task_checklist_items — the small steps inside one task.
--
-- Not subtasks. A subtask is a task with a parent_task_id: it has its own
-- due date, assignee and status. A checklist item is a tick inside a single
-- piece of work and never needs any of that.
-- ---------------------------------------------------------------------
create table if not exists public.task_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,

  title        text not null,
  is_completed boolean not null default false,
  sort_order   integer not null default 0,

  created_at   timestamptz not null default now(),
  completed_at timestamptz,

  -- A finished item has to say when. Without it "2/5 done" cannot be dated.
  constraint task_checklist_completed_check
    check (is_completed = false or completed_at is not null)
);

create index if not exists task_checklist_task_idx
  on public.task_checklist_items (task_id, sort_order);

create or replace function public.stamp_checklist_completion()
returns trigger
language plpgsql
as $fn$
begin
  if new.is_completed and new.completed_at is null then
    new.completed_at := now();
  elsif not new.is_completed then
    new.completed_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists task_checklist_stamp on public.task_checklist_items;
create trigger task_checklist_stamp
  before insert or update on public.task_checklist_items
  for each row execute function public.stamp_checklist_completion();

-- ---------------------------------------------------------------------
-- task_comments — the conversation about the work.
--
-- `author` is text, matching tasks.owner and every other owner column in
-- this database. `user_id` is kept alongside it so a comment can still be
-- traced to an auth account, but the display name does not depend on a join
-- that would break if the account were removed.
-- ---------------------------------------------------------------------
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,

  user_id    uuid references auth.users(id) on delete set null,
  author     text not null,
  comment    text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx
  on public.task_comments (task_id, created_at desc);

-- ---------------------------------------------------------------------
-- task_attachments — files against a task, in the private bucket.
-- ---------------------------------------------------------------------
create table if not exists public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,

  file_name    text not null,
  storage_path text not null,
  mime_type    text,
  file_size    integer check (file_size is null or file_size >= 0),

  uploaded_by  text,
  created_at   timestamptz not null default now()
);

create index if not exists task_attachments_task_idx
  on public.task_attachments (task_id, created_at desc);

-- ---------------------------------------------------------------------
-- task_dependencies — what has to happen first.
--
-- Deliberately small: one row means "this task waits on that one". The
-- service layer refuses a dependency that would close a loop; the database
-- catches the one-hop case here.
-- ---------------------------------------------------------------------
create table if not exists public.task_dependencies (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,

  dependency_type    text not null default 'blocks'
                       check (dependency_type in ('blocks', 'relates')),
  created_at         timestamptz not null default now(),

  constraint task_dependencies_not_self check (task_id <> depends_on_task_id),
  constraint task_dependencies_unique unique (task_id, depends_on_task_id)
);

create index if not exists task_dependencies_task_idx
  on public.task_dependencies (task_id);
create index if not exists task_dependencies_upstream_idx
  on public.task_dependencies (depends_on_task_id);

-- ---------------------------------------------------------------------
-- task_events — the per-task history.
--
-- Same shape as lead_events, job_events and proposal_events, on purpose.
-- This repository has no single global activity table: activity.ts unions
-- the per-entity ones. A competing events table would have to be unioned in
-- anyway, so this follows the pattern already in place rather than starting
-- a second one.
-- ---------------------------------------------------------------------
create table if not exists public.task_events (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,

  event_type text not null check (event_type in (
               'created', 'assigned', 'status_changed', 'priority_changed',
               'due_changed', 'completed', 'reopened', 'comment_added',
               'attachment_added', 'checklist_completed', 'subtask_added',
               'dependency_added', 'generated', 'note')),

  body       text,
  actor      text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_idx
  on public.task_events (task_id, created_at desc);

-- ---------------------------------------------------------------------
-- task_templates — the reusable delivery workflows.
--
-- A template is rows, not a hardcoded array in a component. When a project
-- is created from a package, the template for that package is copied into
-- real tasks; changing what a Classic build involves is then a data change
-- somebody can make, not a deploy.
--
-- `package_key` matches the proposal package keys from 0016 —
-- starter_149, classic_399, professional_699, ecommerce_999 — so the
-- proposal that was signed picks its own workflow with no lookup table.
-- ---------------------------------------------------------------------
create table if not exists public.task_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  package_key text,
  active      boolean not null default true,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists task_templates_package_idx
  on public.task_templates (package_key) where active = true;

create table if not exists public.task_template_items (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.task_templates(id) on delete cascade,

  title           text not null,
  description     text,
  type            text not null default 'internal',
  priority        text not null default 'medium'
                    check (priority in ('low', 'medium', 'high', 'critical')),
  -- What part of delivery this belongs to. Shown as a group heading when a
  -- generated project's tasks are listed.
  phase           text not null default 'Build',
  -- Days after the project starts. The generator turns this into a due date.
  offset_days     integer not null default 0 check (offset_days >= 0),
  estimated_hours numeric(6,2) check (estimated_hours is null or estimated_hours >= 0),
  -- The item this one waits on, by position within the same template. Kept
  -- as an index rather than a row reference because a template's items do
  -- not exist as tasks until the moment they are generated.
  depends_on_order integer,
  sort_order      integer not null default 0,

  created_at      timestamptz not null default now()
);

create index if not exists task_template_items_template_idx
  on public.task_template_items (template_id, sort_order);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_template_items_type_check') then
    alter table public.task_template_items add constraint task_template_items_type_check
      check (type in (
        'sales', 'proposal', 'client_intake', 'website', 'development', 'design',
        'content', 'seo', 'hosting', 'domain', 'ai', 'automation', 'crm',
        'ecommerce', 'quality', 'launch', 'billing', 'support', 'internal'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- updated_at, matching the trigger style used since 0001.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['task_comments', 'task_templates'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS — deny by default, admins only, anon revoked. Identical to 0001/0016.
-- `tasks` itself already has these policies from 0007 and is not re-granted
-- here; adding columns does not change who may read the row.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'task_checklist_items', 'task_comments', 'task_attachments',
    'task_dependencies', 'task_events', 'task_templates', 'task_template_items'
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
-- Private storage for task attachments. Same posture as 0011/0015/0016.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (scratch database) — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('task-attachments', 'task-attachments', false, 26214400)
  on conflict (id) do update set public = false;

  execute 'drop policy if exists task_files_admin_read on storage.objects';
  execute 'drop policy if exists task_files_admin_write on storage.objects';
  execute 'drop policy if exists task_files_admin_delete on storage.objects';

  execute $p$
    create policy task_files_admin_read on storage.objects
      for select to authenticated
      using (bucket_id = 'task-attachments' and public.is_admin())
  $p$;
  execute $p$
    create policy task_files_admin_write on storage.objects
      for insert to authenticated
      with check (bucket_id = 'task-attachments' and public.is_admin())
  $p$;
  execute $p$
    create policy task_files_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'task-attachments' and public.is_admin())
  $p$;
end $$;

-- ---------------------------------------------------------------------
-- Seed: the four delivery workflows, one per website package.
--
-- These are the steps that actually happen on a build, in the order they
-- happen, with the phase they belong to and how many days after kickoff each
-- is due. Generating a project copies them into real tasks.
--
-- `on conflict (key) do nothing` so re-running never overwrites a workflow
-- somebody has since edited.
-- ---------------------------------------------------------------------
insert into public.task_templates (key, name, description, package_key) values
  ('starter_149',      'Starter Website delivery',          'The 2-3 day Starter build, from content received to live.',        'starter_149'),
  ('classic_399',      'Classic Business Website delivery', 'The standard five-page build with lead capture and starter CRM.',  'classic_399'),
  ('professional_699', 'Professional Website delivery',     'The ten-page custom build with CRM, tracking and launch support.', 'professional_699'),
  ('ecommerce_999',    'E-Commerce Website delivery',       'The store build: catalog, payments, shipping, tax and testing.',   'ecommerce_999')
on conflict (key) do nothing;

-- ── Classic ($399) — the reference workflow ──────────────────────────
insert into public.task_template_items
  (template_id, sort_order, phase, type, priority, offset_days, title, description)
select t.id, v.sort_order, v.phase, v.type, v.priority, v.offset_days, v.title, v.description
from public.task_templates t
cross join (values
  ( 1, 'Intake',  'client_intake', 'high',   0, 'Collect client assets',        'Logo, photos, service list and business details.'),
  ( 2, 'Intake',  'design',        'medium', 0, 'Confirm branding',             'Colours, type and how the logo is used.'),
  ( 3, 'Intake',  'domain',        'high',   1, 'Confirm domain access',        'Do they own it, and can we reach the registrar?'),
  ( 4, 'Build',   'website',       'high',   2, 'Build homepage',               null),
  ( 5, 'Build',   'website',       'medium', 3, 'Build About page',             null),
  ( 6, 'Build',   'website',       'medium', 3, 'Build Services page',          null),
  ( 7, 'Build',   'website',       'medium', 4, 'Build Projects/Gallery page',  null),
  ( 8, 'Build',   'website',       'medium', 4, 'Build Contact page',           null),
  ( 9, 'Build',   'development',   'high',   5, 'Configure lead form',          'Validated, spam-protected and routed to the inbox.'),
  (10, 'Build',   'development',   'low',    5, 'Configure Google Maps',        null),
  (11, 'Build',   'content',       'low',    5, 'Connect social links',         null),
  (12, 'QA',      'quality',       'high',   6, 'Mobile QA',                    'Every page at 390px. Most customers arrive on a phone.'),
  (13, 'QA',      'quality',       'medium', 6, 'Desktop QA',                   null),
  (14, 'Review',  'website',       'high',   7, 'Client review',                'Walk them through it and collect changes in one pass.'),
  (15, 'Review',  'website',       'medium', 8, 'Revision round 1',             null),
  (16, 'Review',  'website',       'low',    9, 'Revision round 2',             'Only if the package includes it.'),
  (17, 'Review',  'website',       'high',  10, 'Final approval',               'Written approval before anything goes live.'),
  (18, 'Launch',  'domain',        'high',  11, 'Connect domain',               null),
  (19, 'Launch',  'launch',        'high',  11, 'Production launch',            null),
  (20, 'Launch',  'quality',       'high',  11, 'Verify SSL',                   null),
  (21, 'Launch',  'quality',       'high',  12, 'Verify forms',                 'Submit each one and confirm it actually arrives.'),
  (22, 'Launch',  'seo',           'medium',12, 'Verify analytics',             null),
  (23, 'Handoff', 'internal',      'medium',13, 'Close project',                'Logins handed over and the 30-day check-in booked.')
) as v(sort_order, phase, type, priority, offset_days, title, description)
where t.key = 'classic_399'
  and not exists (select 1 from public.task_template_items i where i.template_id = t.id);

-- ── Starter ($149) — the same shape, far shorter ─────────────────────
insert into public.task_template_items
  (template_id, sort_order, phase, type, priority, offset_days, title, description)
select t.id, v.sort_order, v.phase, v.type, v.priority, v.offset_days, v.title, v.description
from public.task_templates t
cross join (values
  (1, 'Intake', 'client_intake', 'high', 0, 'Confirm intake is complete',     'Everything in the wizard is in; the build clock starts here.'),
  (2, 'Build',  'website',       'high', 0, 'Build Home page',                null),
  (3, 'Build',  'website',       'high', 1, 'Build Services page',            null),
  (4, 'Build',  'website',       'high', 1, 'Build Contact page',             null),
  (5, 'Build',  'development',   'high', 1, 'Configure lead form',            null),
  (6, 'QA',     'quality',       'high', 2, 'Mobile and desktop QA',          null),
  (7, 'Review', 'website',       'high', 2, 'Client review and one revision', 'The package includes a single revision round.'),
  (8, 'Launch', 'domain',        'high', 3, 'Connect domain and SSL',         null),
  (9, 'Launch', 'launch',        'high', 3, 'Production launch',              null)
) as v(sort_order, phase, type, priority, offset_days, title, description)
where t.key = 'starter_149'
  and not exists (select 1 from public.task_template_items i where i.template_id = t.id);

-- ── Professional ($699) — Classic plus what the tier actually adds ───
insert into public.task_template_items
  (template_id, sort_order, phase, type, priority, offset_days, title, description)
select t.id, v.sort_order, v.phase, v.type, v.priority, v.offset_days, v.title, v.description
from public.task_templates t
cross join (values
  ( 1, 'Intake',  'client_intake', 'high',   0, 'Collect client assets',               'Logo, photos, service list and business details.'),
  ( 2, 'Intake',  'design',        'high',   0, 'Confirm branding and direction',      'This tier is designed around the brand, not dropped into a layout.'),
  ( 3, 'Intake',  'domain',        'high',   1, 'Confirm domain access',               null),
  ( 4, 'Design',  'design',        'high',   2, 'Custom design pass',                  'Up to ten pages, designed rather than templated.'),
  ( 5, 'Design',  'design',        'medium', 3, 'Custom graphics and image treatment', null),
  ( 6, 'Build',   'website',       'high',   4, 'Build core pages',                    null),
  ( 7, 'Build',   'website',       'medium', 6, 'Build service and location pages',    null),
  ( 8, 'Build',   'content',       'medium', 7, 'Build blog / news capability',        null),
  ( 9, 'Build',   'development',   'high',   7, 'Configure multiple lead forms',       'Different forms for different intents.'),
  (10, 'Build',   'development',   'high',   8, 'Build quote / request workflow',      null),
  (11, 'Build',   'crm',           'high',   8, 'CRM configuration',                   'Leads flow in cleanly and land against the right record.'),
  (12, 'Build',   'crm',           'high',   9, 'Lead capture workflow',               'Where it goes, who is told, what they see next.'),
  (13, 'Build',   'crm',           'medium', 9, 'Appointment / inquiry workflow',      null),
  (14, 'Build',   'automation',    'medium', 9, 'Email notification automation',       null),
  (15, 'Build',   'seo',           'high',  10, 'Enhanced on-page SEO',                'Structured data, internal linking and per-page targeting.'),
  (16, 'Build',   'seo',           'medium',10, 'Google Analytics',                    null),
  (17, 'Build',   'seo',           'medium',10, 'Google Search Console setup',         null),
  (18, 'Build',   'seo',           'high',  11, 'Conversion tracking',                 'Which pages and forms actually produce work.'),
  (19, 'QA',      'quality',       'high',  12, 'Mobile QA',                           null),
  (20, 'QA',      'quality',       'medium',12, 'Desktop QA',                          null),
  (21, 'Review',  'website',       'high',  13, 'Client review',                       null),
  (22, 'Review',  'website',       'medium',14, 'Revision round 1',                    null),
  (23, 'Review',  'website',       'medium',15, 'Revision round 2',                    null),
  (24, 'Review',  'website',       'low',   16, 'Revision round 3',                    'This tier includes three rounds.'),
  (25, 'Review',  'website',       'high',  17, 'Final approval',                      null),
  (26, 'Launch',  'domain',        'high',  18, 'Connect domain',                      null),
  (27, 'Launch',  'launch',        'high',  18, 'Production launch',                   null),
  (28, 'Launch',  'quality',       'high',  18, 'Verify SSL, forms and tracking',      null),
  (29, 'Handoff', 'support',       'medium',19, 'Start 30-day launch support',         'A month on hand while the site meets real traffic.'),
  (30, 'Handoff', 'internal',      'medium',49, 'Close 30-day support window',         null)
) as v(sort_order, phase, type, priority, offset_days, title, description)
where t.key = 'professional_699'
  and not exists (select 1 from public.task_template_items i where i.template_id = t.id);

-- ── E-Commerce ($999) — the store-specific work ──────────────────────
insert into public.task_template_items
  (template_id, sort_order, phase, type, priority, offset_days, title, description)
select t.id, v.sort_order, v.phase, v.type, v.priority, v.offset_days, v.title, v.description
from public.task_templates t
cross join (values
  ( 1, 'Intake',  'client_intake', 'high',   0, 'Collect client assets',              'Logo, brand, product photography and copy.'),
  ( 2, 'Intake',  'ecommerce',     'high',   1, 'Collect product data',               'Names, prices, options, images and fulfillment details.'),
  ( 3, 'Intake',  'domain',        'high',   1, 'Confirm domain access',              null),
  ( 4, 'Design',  'ecommerce',     'high',   2, 'Store architecture',                 'Structured so the 21st product is easy, not a rebuild.'),
  ( 5, 'Design',  'design',        'high',   3, 'Store design pass',                  null),
  ( 6, 'Build',   'website',       'high',   4, 'Build informational pages',          'Home, about, contact, shipping, returns, FAQ.'),
  ( 7, 'Build',   'ecommerce',     'high',   5, 'Product categories and collections', null),
  ( 8, 'Build',   'ecommerce',     'high',   6, 'Initial product entry',              'The first twenty products entered by us.'),
  ( 9, 'Build',   'ecommerce',     'high',   7, 'Product search',                     null),
  (10, 'Build',   'ecommerce',     'high',   7, 'Cart',                               null),
  (11, 'Build',   'billing',       'high',   8, 'Payment setup',                      'Money lands in their account, not ours.'),
  (12, 'Build',   'ecommerce',     'high',   9, 'Shipping configuration',             'Rates, zones and options as they actually ship.'),
  (13, 'Build',   'billing',       'high',   9, 'Tax configuration',                  'Correct for where they sell, not fixed at year end.'),
  (14, 'Build',   'automation',    'high',  10, 'Order notifications',                'They know, and so does the customer.'),
  (15, 'Build',   'ecommerce',     'medium',10, 'Customer accounts',                  null),
  (16, 'QA',      'quality',       'high',  11, 'Cart testing',                       null),
  (17, 'QA',      'quality',       'high',  11, 'Checkout testing',                   'A real transaction, end to end.'),
  (18, 'QA',      'quality',       'high',  12, 'Order notification testing',         null),
  (19, 'QA',      'quality',       'medium',12, 'Customer account testing',           null),
  (20, 'QA',      'quality',       'high',  12, 'Mobile store QA',                    'Most customers will buy on a phone.'),
  (21, 'Review',  'website',       'high',  13, 'Client review',                      null),
  (22, 'Review',  'website',       'medium',14, 'Revision rounds',                    null),
  (23, 'Review',  'website',       'high',  16, 'Final approval',                     null),
  (24, 'Launch',  'domain',        'high',  17, 'Connect domain',                     null),
  (25, 'Launch',  'launch',        'high',  17, 'Production launch',                  null),
  (26, 'Launch',  'quality',       'high',  17, 'Verify SSL, payments and tax',       null),
  (27, 'Handoff', 'support',       'medium',18, 'Launch support through first orders', null)
) as v(sort_order, phase, type, priority, offset_days, title, description)
where t.key = 'ecommerce_999'
  and not exists (select 1 from public.task_template_items i where i.template_id = t.id);
