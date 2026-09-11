create index if not exists automation_runs_retried_from_idx
  on public.automation_runs (retried_from_run_id)
  where retried_from_run_id is not null;

create index if not exists automation_steps_parent_idx
  on public.automation_steps (parent_step_id)
  where parent_step_id is not null;
