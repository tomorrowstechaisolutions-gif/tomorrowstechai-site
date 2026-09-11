create index if not exists workflow_templates_source_task_idx on public.workflow_templates(source_task_template_id);
create index if not exists workflows_service_idx on public.workflows(service_id);
create index if not exists workflows_project_template_idx on public.workflows(project_template_id);
create index if not exists workflow_stages_owner_idx on public.workflow_stages(owner_id);
create index if not exists workflow_run_stages_owner_idx on public.workflow_run_stages(owner_id);
create index if not exists workflow_run_approvals_approved_by_idx on public.workflow_run_approvals(approved_by);
