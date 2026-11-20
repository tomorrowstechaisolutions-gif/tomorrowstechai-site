-- The AI crew: Tess and the bots that work under her.
--
-- A "bot" is a row in ai_agents: a role, a model, a schedule. One engine
-- (src/lib/crew) runs all of them. What a bot does is recorded step by step:
--
--   ai_businesses  one row per business. `mode` says whether the crew may
--                  act for it: 'setup' (nothing is sent until John confirms
--                  its playbook), 'launch' (the full crew works it) or
--                  'maintenance' (watch only). Holds the playbook and caps.
--   ai_goals       the targets a business is working toward this period.
--                  Every action the crew takes must name one.
--   ai_agents      the crew. Tess has no schedule; she runs when John talks
--                  to her. The others run a shift every schedule_minutes.
--   ai_runs        one piece of work by one bot: a shift, or a chat. The
--                  transcript is the conversation with the model, kept
--                  append-only so a run cut off by the request time limit
--                  can resume exactly where it stopped.
--   ai_steps       one row per thing a bot did, read or was refused. This is
--                  the only thing the floor and Tess's brief read. The unique
--                  key on (run_id, tool_use_id) is what makes a resumed run
--                  unable to carry out the same action twice.
--   ai_rules       standing corrections from John that every bot reads
--                  before it acts.
--   ai_crew_state  one row: the pause for the whole crew.
--
-- Same posture as cron_runs: RLS on, admins may read. Every write comes from
-- the server with the service role, so there are no insert, update or delete
-- policies.

create table if not exists public.ai_businesses (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  mode                  text not null default 'setup' check (mode in ('setup', 'launch', 'maintenance')),
  playbook              jsonb,
  playbook_confirmed_at timestamptz,
  caps                  jsonb not null default '{"spendCentsPerDay":500,"firstEmailsPerDay":5,"postsPerDayPerChannel":2}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.ai_goals (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.ai_businesses(id) on delete cascade,
  metric       text not null check (metric in ('qualified_leads', 'booked_calls', 'sales', 'site_visitors', 'unpaid_days')),
  target       integer not null check (target >= 0),
  period_start date not null,
  period_end   date not null,
  created_at   timestamptz not null default now(),
  unique (business_id, metric, period_start)
);

create table if not exists public.ai_agents (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  rank             text not null check (rank in ('lead', 'desk', 'function', 'business')),
  desk             text check (desk in ('sales', 'social', 'finance')),
  business_id      uuid references public.ai_businesses(id) on delete set null,
  model            text not null,
  schedule_minutes integer check (schedule_minutes is null or schedule_minutes >= 10),
  paused           boolean not null default false,
  last_shift_at    timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.ai_runs (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.ai_agents(id) on delete cascade,
  business_id  uuid references public.ai_businesses(id) on delete set null,
  trigger      text not null check (trigger in ('shift', 'chat')),
  status       text not null default 'running' check (status in ('running', 'waiting', 'done', 'failed', 'paused_budget', 'stopped')),
  transcript   jsonb not null default '[]'::jsonb,
  steps_taken  integer not null default 0,
  cost_micro_usd bigint not null default 0,
  started_by   uuid references auth.users(id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text
);
create index if not exists ai_runs_status_agent_idx on public.ai_runs (status, agent_id);

create table if not exists public.ai_steps (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.ai_runs(id) on delete cascade,
  agent_id    uuid not null references public.ai_agents(id) on delete cascade,
  business_id uuid references public.ai_businesses(id) on delete set null,
  seq         integer not null,
  kind        text not null check (kind in ('read', 'act', 'refused', 'needs_john', 'report')),
  tool        text not null,
  station     text check (station in ('inbox', 'crm', 'social', 'bank', 'stripe', 'analytics', 'library')),
  summary     text not null,
  goal_id     uuid references public.ai_goals(id) on delete set null,
  expectation text,
  tool_use_id text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create unique index if not exists ai_steps_run_tool_use_key
  on public.ai_steps (run_id, tool_use_id) where tool_use_id is not null;
create index if not exists ai_steps_created_idx on public.ai_steps (created_at desc);
create index if not exists ai_steps_run_idx on public.ai_steps (run_id, seq);

create table if not exists public.ai_rules (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  scope      text not null default 'all',
  active     boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_crew_state (
  id         boolean primary key default true check (id),
  paused     boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.ai_crew_state (id, paused) values (true, false) on conflict (id) do nothing;

-- When each admin last opened Tess, so "while you were out" has a start.
create table if not exists public.ai_visits (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ai_businesses', 'ai_goals', 'ai_agents', 'ai_runs', 'ai_steps', 'ai_rules', 'ai_crew_state', 'ai_visits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_select', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── Seed: the first business and the first four of the crew ─────────────
insert into public.ai_businesses (slug, name, mode)
values ('tomorrows-tech-ai', 'Tomorrow''s Tech AI', 'setup')
on conflict (slug) do nothing;

insert into public.ai_agents (slug, name, rank, desk, business_id, model, schedule_minutes)
select v.slug, v.name, v.rank, v.desk, b.id, v.model, v.schedule_minutes
from (values
  ('tess',           'Tess',           'lead',     null,      'claude-opus-5-5',   null),
  ('follow-through', 'Follow-through', 'desk',     'sales',   'claude-sonnet-5-5', 120),
  ('content',        'Content',        'desk',     'social',  'claude-sonnet-5-5', 240),
  ('finance',        'Finance',        'function', 'finance', 'claude-sonnet-5-5', 360)
) as v(slug, name, rank, desk, model, schedule_minutes)
cross join (select id from public.ai_businesses where slug = 'tomorrows-tech-ai') b
on conflict (slug) do nothing;

-- Registered in AI Solutions so usage and cost show up beside every other
-- AI system. The slug is what src/lib/ai/record.ts records usage under.
insert into public.ai_solutions (
  name, internal_name, slug, description, purpose, solution_type, status,
  provider_key, model, deployment_target, deployment_url, source_path,
  prompt_editable, prompt_locked_reason, owner, tags, created_by
) values
  ('Tess', 'crew-tess', 'crew-tess',
   'The lead AI. Talks with John, gives the morning brief and directs the crew.',
   'Tell John where the business stands and what to do first.',
   'internal_assistant', 'active', 'anthropic', 'claude-opus-5-5',
   'internal_admin', null, 'src/lib/crew/run.ts', false,
   'The role prompt lives in src/lib/crew/roles.ts.', 'John', array['internal','crew'], 'system'),
  ('Crew: Follow-through', 'crew-follow-through', 'crew-follow-through',
   'Sales desk. Makes sure no lead goes quiet.',
   'Get replies and booked calls from existing leads.',
   'workflow_agent', 'active', 'anthropic', 'claude-sonnet-5-5',
   'internal_admin', null, 'src/lib/crew/run.ts', false,
   'The role prompt lives in src/lib/crew/roles.ts.', 'John', array['internal','crew','sales'], 'system'),
  ('Crew: Content', 'crew-content', 'crew-content',
   'Social desk. Publishes posts from Field Notes articles.',
   'Keep the social channels fed from published articles.',
   'workflow_agent', 'active', 'anthropic', 'claude-sonnet-5-5',
   'internal_admin', null, 'src/lib/crew/run.ts', false,
   'The role prompt lives in src/lib/crew/roles.ts.', 'John', array['internal','crew','marketing'], 'system'),
  ('Crew: Finance', 'crew-finance', 'crew-finance',
   'Watches the bank and invoices and sends payment reminders.',
   'Keep invoices from going unpaid.',
   'workflow_agent', 'active', 'anthropic', 'claude-sonnet-5-5',
   'internal_admin', null, 'src/lib/crew/run.ts', false,
   'The role prompt lives in src/lib/crew/roles.ts.', 'John', array['internal','crew','finance'], 'system')
on conflict do nothing;
