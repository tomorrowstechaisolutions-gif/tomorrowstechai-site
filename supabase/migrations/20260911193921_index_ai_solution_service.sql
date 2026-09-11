create index if not exists ai_solutions_service_idx
  on public.ai_solutions (service_id)
  where service_id is not null;
