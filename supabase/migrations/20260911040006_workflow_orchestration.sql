-- =====================================================================
-- Workflow orchestration
--
-- Workflows coordinate the systems that already exist. Jobs remain Projects,
-- customers remain Clients, and executable work remains in public.tasks.
-- A run stores a definition snapshot so later template edits cannot mutate it.
-- =====================================================================

create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  area text not null check (area in ('sales','clients','projects','marketing','finance','software','system')),
  source_task_template_id uuid references public.task_templates(id) on delete set null,
  definition jsonb not null default '{"stages":[]}'::jsonb,
  status text not null default 'active' check (status in ('draft','active','paused','deprecated','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  purpose text,
  area text not null check (area in ('sales','clients','projects','marketing','finance','software','system')),
  status text not null default 'draft' check (status in ('draft','active','paused','deprecated','archived')),
  owner_id uuid references public.admin_users(id) on delete set null,
  default_priority text not null default 'medium' check (default_priority in ('low','medium','high','critical')),
  target_duration_hours integer check (target_duration_hours is null or target_duration_hours > 0),
  service_id uuid references public.catalog_items(id) on delete set null,
  project_template_id uuid references public.task_templates(id) on delete set null,
  version integer not null default 1 check (version > 0),
  tags text[] not null default '{}',
  archived_at timestamptz,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  stage_order integer not null check (stage_order >= 0),
  name text not null,
  description text,
  stage_type text not null default 'standard' check (stage_type in ('standard','approval','wait','decision','delivery','review','launch','completion','custom')),
  owner_id uuid references public.admin_users(id) on delete set null,
  owner_label text,
  team text,
  target_duration_hours integer check (target_duration_hours is null or target_duration_hours > 0),
  due_date_rule jsonb not null default '{}'::jsonb,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  required boolean not null default true,
  allow_skip boolean not null default false,
  completion_rule text not null default 'all_required_tasks' check (completion_rule in ('all_required_tasks','specific_task','approval_received','automation_success','field_condition','manual','all_conditions')),
  branch_rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_id, stage_order)
);

create table if not exists public.workflow_stage_tasks (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.workflow_stages(id) on delete cascade,
  task_order integer not null default 0 check (task_order >= 0),
  title text not null,
  description text,
  assignee text,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  task_type text not null default 'internal',
  due_offset_hours integer check (due_offset_hours is null or due_offset_hours >= 0),
  required boolean not null default true,
  dependency_task_id uuid references public.workflow_stage_tasks(id) on delete set null,
  checklist jsonb not null default '[]'::jsonb,
  status_mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(stage_id, task_order)
);

create table if not exists public.workflow_stage_approvals (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.workflow_stages(id) on delete cascade,
  name text not null,
  approval_type text not null default 'internal' check (approval_type in ('internal','client','manager','technical','finance','custom')),
  approver_id uuid references public.admin_users(id) on delete set null,
  approver_role text,
  due_offset_hours integer check (due_offset_hours is null or due_offset_hours >= 0),
  required boolean not null default true,
  escalation_rule jsonb not null default '{}'::jsonb,
  comments_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_stage_automations (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.workflow_stages(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete restrict,
  event_type text not null check (event_type in ('workflow_started','stage_entered','task_completed','approval_received','due_date_reached','stage_completed','workflow_completed')),
  created_at timestamptz not null default now(),
  unique(stage_id, automation_id, event_type)
);

create table if not exists public.workflow_stage_agents (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.workflow_stages(id) on delete cascade,
  ai_solution_id uuid not null references public.ai_solutions(id) on delete restrict,
  event_type text not null default 'stage_entered' check (event_type in ('workflow_started','stage_entered','stage_completed','workflow_completed')),
  instructions text,
  require_human_review boolean not null default true,
  created_at timestamptz not null default now(),
  unique(stage_id, ai_solution_id, event_type)
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete restrict,
  workflow_version integer not null,
  definition_snapshot jsonb not null,
  name text not null,
  client_id uuid references public.customers(id) on delete set null,
  project_id uuid references public.jobs(id) on delete set null,
  related_record_type text,
  related_record_id uuid,
  owner_id uuid references public.admin_users(id) on delete set null,
  status text not null default 'running' check (status in ('not_started','running','paused','blocked','completed','canceled')),
  current_stage_order integer not null default 0,
  started_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_run_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  source_stage_id uuid references public.workflow_stages(id) on delete set null,
  stage_order integer not null,
  name text not null,
  stage_type text not null,
  owner_id uuid references public.admin_users(id) on delete set null,
  target_duration_hours integer,
  completion_rule text not null,
  required boolean not null default true,
  allow_skip boolean not null default false,
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'upcoming' check (status in ('upcoming','current','blocked','completed','skipped','failed')),
  entered_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, stage_order)
);

create table if not exists public.workflow_run_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  run_stage_id uuid not null references public.workflow_run_stages(id) on delete cascade,
  source_approval_id uuid references public.workflow_stage_approvals(id) on delete set null,
  name text not null,
  approval_type text not null,
  approver_id uuid references public.admin_users(id) on delete set null,
  approver_role text,
  status text not null default 'waiting' check (status in ('waiting','approved','changes_requested','rejected','expired')),
  required boolean not null default true,
  comments_required boolean not null default false,
  requested_at timestamptz not null default now(),
  due_at timestamptz,
  approved_by uuid references public.admin_users(id) on delete set null,
  approved_at timestamptz,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_activity_events (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.workflows(id) on delete set null,
  run_id uuid references public.workflow_runs(id) on delete set null,
  run_stage_id uuid references public.workflow_run_stages(id) on delete set null,
  event_type text not null,
  body text,
  actor text not null default 'system',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists workflow_run_stage_id uuid references public.workflow_run_stages(id) on delete set null,
  add column if not exists workflow_stage_task_id uuid references public.workflow_stage_tasks(id) on delete set null;

create index if not exists workflows_status_area_idx on public.workflows(status, area, updated_at desc);
create index if not exists workflows_owner_idx on public.workflows(owner_id);
create index if not exists workflow_stages_workflow_idx on public.workflow_stages(workflow_id, stage_order);
create index if not exists workflow_stage_tasks_stage_idx on public.workflow_stage_tasks(stage_id, task_order);
create index if not exists workflow_stage_tasks_dependency_idx on public.workflow_stage_tasks(dependency_task_id);
create index if not exists workflow_stage_approvals_stage_idx on public.workflow_stage_approvals(stage_id);
create index if not exists workflow_stage_approvals_approver_idx on public.workflow_stage_approvals(approver_id);
create index if not exists workflow_stage_automations_stage_idx on public.workflow_stage_automations(stage_id);
create index if not exists workflow_stage_automations_automation_idx on public.workflow_stage_automations(automation_id);
create index if not exists workflow_stage_agents_stage_idx on public.workflow_stage_agents(stage_id);
create index if not exists workflow_stage_agents_solution_idx on public.workflow_stage_agents(ai_solution_id);
create index if not exists workflow_runs_workflow_status_idx on public.workflow_runs(workflow_id, status, started_at desc);
create index if not exists workflow_runs_client_idx on public.workflow_runs(client_id);
create index if not exists workflow_runs_project_idx on public.workflow_runs(project_id);
create index if not exists workflow_runs_owner_idx on public.workflow_runs(owner_id);
create index if not exists workflow_run_stages_run_idx on public.workflow_run_stages(run_id, stage_order);
create index if not exists workflow_run_stages_source_idx on public.workflow_run_stages(source_stage_id);
create index if not exists workflow_run_approvals_run_idx on public.workflow_run_approvals(run_id, status);
create index if not exists workflow_run_approvals_stage_idx on public.workflow_run_approvals(run_stage_id);
create index if not exists workflow_run_approvals_source_idx on public.workflow_run_approvals(source_approval_id);
create index if not exists workflow_run_approvals_approver_idx on public.workflow_run_approvals(approver_id);
create index if not exists workflow_activity_workflow_idx on public.workflow_activity_events(workflow_id, created_at desc);
create index if not exists workflow_activity_run_idx on public.workflow_activity_events(run_id, created_at desc);
create index if not exists workflow_activity_stage_idx on public.workflow_activity_events(run_stage_id);
create index if not exists tasks_workflow_run_idx on public.tasks(workflow_run_id) where workflow_run_id is not null;
create index if not exists tasks_workflow_stage_idx on public.tasks(workflow_run_stage_id) where workflow_run_stage_id is not null;
create index if not exists tasks_workflow_template_idx on public.tasks(workflow_stage_task_id) where workflow_stage_task_id is not null;

do $$
declare t text;
begin
  foreach t in array array[
    'workflow_templates','workflows','workflow_stages','workflow_stage_tasks',
    'workflow_stage_approvals','workflow_stage_automations','workflow_stage_agents',
    'workflow_runs','workflow_run_stages','workflow_run_approvals','workflow_activity_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.role in (''owner'',''admin'')))', t || '_manager_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.role in (''owner'',''admin''))) with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.role in (''owner'',''admin'')))', t || '_manager_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.role in (''owner'',''admin'')))', t || '_manager_delete', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'workflow_templates','workflows','workflow_stages','workflow_stage_tasks',
    'workflow_stage_approvals','workflow_runs','workflow_run_stages','workflow_run_approvals'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- Existing website task blueprints become honest workflow templates. No run,
-- usage, duration, or health data is seeded.
insert into public.workflow_templates(key, name, description, area, source_task_template_id, definition)
select
  'task_template_' || t.key,
  t.name,
  t.description,
  'projects',
  t.id,
  jsonb_build_object(
    'source', 'task_templates',
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object('name', phases.phase, 'order', phases.stage_order) order by phases.stage_order)
      from (
        select i.phase, min(i.sort_order) as stage_order
        from public.task_template_items i where i.template_id = t.id
        group by i.phase
      ) phases
    ), '[]'::jsonb)
  )
from public.task_templates t
where t.active = true
on conflict(key) do update set name=excluded.name, description=excluded.description,
  source_task_template_id=excluded.source_task_template_id, definition=excluded.definition, updated_at=now();
