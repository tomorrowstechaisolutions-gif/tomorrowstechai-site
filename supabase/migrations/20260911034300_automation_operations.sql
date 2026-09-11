-- =====================================================================
-- Automation Operations
--
-- A deterministic registry and execution ledger around the systems that
-- already perform work. The existing lead_followups queue remains the source
-- of truth for the proven 24h/72h sender; those jobs are registered here and
-- the cron records their executions in automation_runs.
-- =====================================================================

create table if not exists public.automation_trigger_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  area text not null check (area in ('sales','projects','marketing','clients','finance','ai','system')),
  source_table text,
  event_name text not null,
  description text,
  config_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name text not null,
  description text,
  category text not null default 'system' check (category in ('sales','projects','marketing','clients','finance','ai','system')),
  status text not null default 'draft' check (status in ('draft','active','paused','warning','error','archived')),
  owner_id uuid references public.admin_users(id) on delete set null,
  trigger_definition_id uuid references public.automation_trigger_definitions(id) on delete restrict,
  trigger_config jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  estimated_minutes_saved integer check (estimated_minutes_saved is null or estimated_minutes_saved >= 0),
  retry_policy jsonb not null default '{"max_attempts":0,"delay_seconds":0}'::jsonb,
  failure_threshold jsonb not null default '{"count":3,"rate_percent":10,"window_hours":24}'::jsonb,
  failure_notifications jsonb not null default '{"recipients":["owner"],"channels":["in_app"]}'::jsonb,
  source_system text not null default 'automation_engine' check (source_system in ('automation_engine','legacy_followups','social_center','service_operations')),
  locked_execution boolean not null default false,
  last_run_at timestamptz,
  next_run_at timestamptz,
  archived_at timestamptz,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  step_order integer not null check (step_order >= 0),
  step_type text not null check (step_type in ('trigger','condition','delay','action','branch')),
  name text not null,
  action_type text,
  config jsonb not null default '{}'::jsonb,
  branch_key text not null default 'main',
  parent_step_id uuid references public.automation_steps(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, branch_key, step_order)
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete restrict,
  trigger_event_id text,
  trigger_key text not null,
  trigger_summary text,
  trigger_payload jsonb not null default '{}'::jsonb,
  status text not null default 'running' check (status in ('running','success','partial','failed','canceled','skipped')),
  mode text not null default 'live' check (mode in ('live','test','dry_run')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  related_client_id uuid references public.customers(id) on delete set null,
  related_record_type text,
  related_record_id uuid,
  error_summary text,
  attempt integer not null default 1 check (attempt > 0),
  retried_from_run_id uuid references public.automation_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists automation_runs_event_key
  on public.automation_runs (automation_id, trigger_event_id)
  where trigger_event_id is not null and mode = 'live';

create table if not exists public.automation_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  automation_step_id uuid references public.automation_steps(id) on delete set null,
  step_order integer not null,
  step_type text not null check (step_type in ('trigger','condition','delay','action','branch')),
  name text not null,
  status text not null default 'running' check (status in ('pending','running','success','failed','skipped','preview')),
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_message text,
  idempotency_key text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0)
);

create unique index if not exists automation_run_steps_idempotency_key
  on public.automation_run_steps (idempotency_key)
  where idempotency_key is not null;

create table if not exists public.automation_errors (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete restrict,
  run_id uuid references public.automation_runs(id) on delete set null,
  run_step_id uuid references public.automation_run_steps(id) on delete set null,
  error_code text,
  message text not null,
  diagnostic jsonb not null default '{}'::jsonb,
  retry_status text not null default 'not_requested' check (retry_status in ('not_requested','queued','retried','not_safe','exhausted')),
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null check (category in ('sales','projects','marketing','clients','finance','ai','system')),
  trigger_definition_id uuid references public.automation_trigger_definitions(id) on delete restrict,
  definition jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_activity_events (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.automations(id) on delete set null,
  run_id uuid references public.automation_runs(id) on delete set null,
  event_type text not null,
  body text,
  actor text not null default 'system',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automations_status_category_idx on public.automations (status, category, updated_at desc);
create index if not exists automations_owner_idx on public.automations (owner_id);
create index if not exists automations_trigger_idx on public.automations (trigger_definition_id);
create index if not exists automation_steps_automation_idx on public.automation_steps (automation_id, branch_key, step_order);
create index if not exists automation_runs_automation_started_idx on public.automation_runs (automation_id, started_at desc);
create index if not exists automation_runs_status_started_idx on public.automation_runs (status, started_at desc);
create index if not exists automation_runs_client_idx on public.automation_runs (related_client_id);
create index if not exists automation_run_steps_run_idx on public.automation_run_steps (run_id, step_order);
create index if not exists automation_run_steps_step_idx on public.automation_run_steps (automation_step_id);
create index if not exists automation_errors_open_idx on public.automation_errors (automation_id, created_at desc) where resolved = false;
create index if not exists automation_errors_run_idx on public.automation_errors (run_id);
create index if not exists automation_errors_step_idx on public.automation_errors (run_step_id);
create index if not exists automation_templates_trigger_idx on public.automation_templates (trigger_definition_id);
create index if not exists automation_activity_automation_idx on public.automation_activity_events (automation_id, created_at desc);
create index if not exists automation_activity_run_idx on public.automation_activity_events (run_id);

do $$
declare t text;
begin
  foreach t in array array[
    'automation_trigger_definitions', 'automations', 'automation_steps',
    'automation_runs', 'automation_run_steps', 'automation_errors',
    'automation_templates', 'automation_activity_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.role in (''owner'',''admin'')))', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.role in (''owner'',''admin''))) with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.role in (''owner'',''admin'')))', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.role in (''owner'',''admin'')))', t || '_admin_delete', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['automation_trigger_definitions','automations','automation_steps','automation_templates'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end;
$$;

insert into public.automation_trigger_definitions (key, name, area, source_table, event_name, description, config_schema)
values
  ('lead_created', 'Lead Created', 'sales', 'leads', 'insert', 'A validated lead enters the CRM.', '{"scope":["all","source"]}'),
  ('lead_no_response', 'No Response', 'sales', 'lead_followups', 'due', 'A queued lead follow-up reaches its due time.', '{"delay_hours":"number"}'),
  ('proposal_accepted', 'Proposal Accepted', 'sales', 'proposals', 'accepted', 'Both parties have accepted a proposal.', '{}'),
  ('client_created', 'Client Created', 'clients', 'customers', 'insert', 'A customer record is created.', '{}'),
  ('project_created', 'Project Created', 'projects', 'jobs', 'insert', 'A delivery project is opened.', '{}'),
  ('project_completed', 'Project Completed', 'projects', 'jobs', 'completed', 'A project reaches Complete.', '{}'),
  ('task_overdue', 'Task Overdue', 'projects', 'tasks', 'overdue', 'An unfinished task passes its due date.', '{}'),
  ('campaign_completed', 'Campaign Completed', 'marketing', 'email_campaigns', 'completed', 'An email campaign completes delivery.', '{}'),
  ('social_publish_failed', 'Social Post Failed', 'marketing', 'social_post_platforms', 'failed', 'A provider reports a social publishing failure.', '{}'),
  ('invoice_due', 'Invoice Due', 'finance', 'invoices', 'due', 'An unpaid invoice reaches its due date.', '{}'),
  ('invoice_paid', 'Invoice Paid', 'finance', 'invoices', 'paid', 'An invoice balance is settled.', '{}'),
  ('ai_solution_error', 'AI Solution Error', 'ai', 'ai_activity_logs', 'failed', 'An AI solution records a failed execution.', '{}'),
  ('app_health_warning', 'App Health Warning', 'system', 'app_health_checks', 'warning', 'An app health check crosses a warning threshold.', '{}'),
  ('deployment_failed', 'Deployment Failed', 'system', 'app_deployments', 'failed', 'A tracked deployment fails.', '{}'),
  ('scheduled_time', 'Scheduled Time', 'system', null, 'schedule', 'The shared Vercel scheduler reaches a configured time.', '{"schedule":"cron","timezone":"iana"}')
on conflict (key) do update set name = excluded.name, area = excluded.area,
  source_table = excluded.source_table, event_name = excluded.event_name,
  description = excluded.description, config_schema = excluded.config_schema, enabled = true;

insert into public.automations (
  key, name, description, category, status, trigger_definition_id,
  trigger_config, tags, source_system, locked_execution, created_by
)
select
  seed.key, seed.name, seed.description, 'sales', 'active', trigger.id,
  jsonb_build_object('delay_hours', seed.hours, 'queue_table', 'lead_followups'),
  array['lead-follow-up','email'], 'legacy_followups', true, 'system'
from (values
  ('legacy_lead_followup_24h', '24h Lead Follow-Up', 'Send the first follow-up when an eligible lead has not engaged after 24 hours.', 24),
  ('legacy_lead_followup_72h', '72h Lead Follow-Up', 'Send the final follow-up when an eligible lead has not engaged after 72 hours.', 72)
) as seed(key, name, description, hours)
join public.automation_trigger_definitions trigger on trigger.key = 'lead_no_response'
on conflict (key) do update set
  name = excluded.name, description = excluded.description,
  trigger_definition_id = excluded.trigger_definition_id,
  trigger_config = excluded.trigger_config, source_system = 'legacy_followups',
  locked_execution = true;

insert into public.automation_steps (automation_id, step_order, step_type, name, action_type, config)
select a.id, s.step_order, s.step_type, s.name, s.action_type,
  case s.step_type
    when 'trigger' then jsonb_build_object('event', 'lead_no_response', 'delay_hours', (a.trigger_config->>'delay_hours')::int)
    when 'condition' then '{"logic":"AND","rules":[{"field":"lead_status","operator":"in_list","value":["New","Contact Attempted"]},{"field":"email_consent","operator":"equals","value":true},{"field":"do_not_contact","operator":"equals","value":false}]}'::jsonb
    else jsonb_build_object('template', case when a.key = 'legacy_lead_followup_24h' then 'followup_24h' else 'followup_72h' end, 'recipient', '{{lead.email}}')
  end
from public.automations a
cross join (values
  (0, 'trigger', 'No response window reached', null),
  (1, 'condition', 'Lead is still eligible', null),
  (2, 'action', 'Send follow-up email', 'send_legacy_followup_email')
) as s(step_order, step_type, name, action_type)
where a.key in ('legacy_lead_followup_24h','legacy_lead_followup_72h')
on conflict (automation_id, branch_key, step_order) do update set
  step_type = excluded.step_type, name = excluded.name,
  action_type = excluded.action_type, config = excluded.config;

-- Bring the real historical queue outcomes into the operations ledger. Times
-- and outcomes come from lead_followups; duration stays NULL because the old
-- executor did not measure it. No metric is inferred.
insert into public.automation_runs (
  automation_id, trigger_event_id, trigger_key, trigger_summary, status, mode,
  started_at, completed_at, related_record_type, related_record_id, error_summary
)
select
  a.id,
  'lead_followup:' || f.id::text,
  'lead_no_response',
  case when f.step = 'followup_24h' then '24-hour lead follow-up due' else '72-hour lead follow-up due' end,
  case f.status when 'sent' then 'success' when 'failed' then 'failed' when 'skipped' then 'skipped' when 'cancelled' then 'canceled' else 'running' end,
  'live',
  f.created_at,
  coalesce(f.sent_at, case when f.status in ('failed','skipped','cancelled') then f.updated_at else null end),
  'lead', f.lead_id, f.error
from public.lead_followups f
join public.automations a on a.key = case f.step
  when 'followup_24h' then 'legacy_lead_followup_24h'
  when 'followup_72h' then 'legacy_lead_followup_72h'
end
where f.step in ('followup_24h','followup_72h')
on conflict (automation_id, trigger_event_id) where trigger_event_id is not null and mode = 'live' do nothing;

insert into public.automation_run_steps (
  run_id, automation_step_id, step_order, step_type, name, status,
  input_summary, output_summary, error_message, idempotency_key,
  started_at, completed_at
)
select
  r.id, s.id, 2, 'action', s.name,
  case r.status when 'success' then 'success' when 'failed' then 'failed' else 'skipped' end,
  jsonb_build_object('record_type', 'lead'),
  case when r.status = 'success' then '{"sent":true}'::jsonb else '{}'::jsonb end,
  r.error_summary,
  r.id::text || ':' || s.id::text,
  r.started_at, r.completed_at
from public.automation_runs r
join public.automations a on a.id = r.automation_id and a.source_system = 'legacy_followups'
join public.automation_steps s on s.automation_id = a.id and s.step_order = 2
where r.trigger_event_id like 'lead_followup:%'
on conflict (idempotency_key) where idempotency_key is not null do nothing;

update public.automations a set
  last_run_at = x.last_run_at
from (
  select automation_id, max(started_at) last_run_at
  from public.automation_runs group by automation_id
) x
where x.automation_id = a.id;

insert into public.automation_templates (key, name, description, category, trigger_definition_id, definition)
select seed.key, seed.name, seed.description, seed.category, trigger.id, seed.definition
from (values
  ('new_lead_task', 'New Lead Follow-Up Task', 'Open an owned sales task whenever a new lead arrives.', 'sales', 'lead_created', '{"steps":[{"type":"action","name":"Create sales task","action_type":"create_task","config":{"title":"Follow up with {{lead.name}}","priority":"high","due_in_days":1}}]}'::jsonb),
  ('social_failure_task', 'Social Publish Failure', 'Create a marketing task when a provider rejects a post.', 'marketing', 'social_publish_failed', '{"steps":[{"type":"action","name":"Create retry task","action_type":"create_task","config":{"title":"Investigate failed social post","priority":"high","due_in_days":1}}]}'::jsonb),
  ('invoice_reminder_task', 'Past-Due Invoice Task', 'Open a finance task when an invoice needs attention.', 'finance', 'invoice_due', '{"steps":[{"type":"delay","name":"Wait 3 days","config":{"amount":3,"unit":"days"}},{"type":"action","name":"Create finance task","action_type":"create_task","config":{"title":"Follow up on past-due invoice","priority":"high","due_in_days":1}}]}'::jsonb),
  ('project_completion_review', 'Project Completion Review', 'Open quality and review work after a project completes.', 'projects', 'project_completed', '{"steps":[{"type":"action","name":"Create review task","action_type":"create_task","config":{"title":"Request project review","priority":"medium","due_in_days":7}}]}'::jsonb)
) as seed(key, name, description, category, trigger_key, definition)
join public.automation_trigger_definitions trigger on trigger.key = seed.trigger_key
on conflict (key) do update set name = excluded.name, description = excluded.description,
  category = excluded.category, trigger_definition_id = excluded.trigger_definition_id,
  definition = excluded.definition, enabled = true;
