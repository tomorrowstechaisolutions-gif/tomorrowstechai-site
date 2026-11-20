-- The instructions and tool definitions a run started with, replayed on
-- every call so the model never sees them change mid-conversation (which
-- makes it refuse its own earlier reasoning). Written by the engine at a
-- run's first model call.
--
-- Safe to run more than once.

alter table public.ai_runs add column if not exists frame jsonb;
