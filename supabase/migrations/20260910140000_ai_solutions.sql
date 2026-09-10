-- ---------------------------------------------------------------------
-- AI Solutions — the AI operations platform.
--
-- Read the headers of 0010_websites.sql and 20260910120000_apps.sql first.
-- The same discipline applies: reuse what exists, refuse the tables that
-- would become a second copy of the business, and never let a missing
-- measurement render as a good one.
--
-- WHAT THIS IS FOR, precisely: this company already runs SIX Claude-powered
-- systems in production — the public website chat assistant, the admin
-- business advisor, the content generator, the ad-copy writer, the task
-- prioritiser and the week planner. Today they are six hard-coded API calls
-- with no record of what they cost, how often they run, or whether they are
-- failing. This migration is the ledger for them, and the seed at the bottom
-- registers all six as the real systems they already are.
--
-- WHAT ALREADY EXISTED, and is NOT duplicated:
--   customers        — the CLIENT.
--   catalog_items /
--   client_services  — the SERVICE it is sold as, and the per-client
--                      assignment with its agreed price. §27's distinction
--                      lives here: a Service is what we sell, an AI Solution
--                      is the system running behind it.
--   invoices /
--   invoice_payments — the MONEY. ai_solutions carries agreed terms only.
--   apps / websites  — WHERE IT RUNS. ai_deployments points at them.
--   tasks            — the WORK. tasks.ai_solution_id, not a task system.
--   ai_insights /
--   ai_actions       — the advisor's insight feed and its propose/approve
--                      queue from 0007. Untouched. `ai_alerts` below is a
--                      different thing: an operational threshold breach on
--                      one solution, not a business insight.
--   admin_users      — the PEOPLE, and RBAC through public.is_admin().
--   integration_credentials — the OAuth vault. AI PROVIDER KEYS DO NOT GO
--                      THERE AND DO NOT GO HERE: they are environment
--                      variables on the server (ANTHROPIC_API_KEY today).
--                      ai_providers records WHICH env var holds a key and
--                      whether it answered, never the key itself.
--
-- NOT created, on purpose:
--   ai_solution_logs — ai_usage_events IS the log. Every call already
--                      records status, error, latency, tokens and cost; a
--                      second table would be the same rows with a different
--                      name, and the two would disagree the first time one
--                      was written and the other was not.
--   ai_solution_costs — cost is tokens × the rate on ai_models, frozen onto
--                      the usage row at write time. A stored monthly total
--                      is a number that was true once.
--   ai_solution_health — derived on every read from the events, the
--                      integrations and the provider states. Never stored.
--   ai_messages       — the BODIES of end-user conversations. For a client's
--                      website bot those are the client's customers talking,
--                      often with names, phone numbers and problems in them.
--                      ai_conversations records the metadata needed to
--                      operate the thing — count, status, escalation, lead —
--                      and the bodies stay out of this database. Adding them
--                      is a retention and consent decision, not a schema one.
--   ai_solution_prompts (separate from versions) — a prompt IS its version
--                      history. One table, and the active row is a flag.
-- ---------------------------------------------------------------------

begin;

-- ══════════════════════════════════════════════════════════════════════
-- Providers and models
-- ══════════════════════════════════════════════════════════════════════

-- ── ai_providers ─────────────────────────────────────────────────────
-- One row per AI vendor we can call. NO KEYS. `credential_env` names the
-- environment variable the server reads; whether that variable is set, and
-- whether a real call to the provider succeeded, is what decides status.
--
-- `status` defaults to 'unknown' and STAYS unknown until something checks.
-- A provider nobody has called is not operational; it is unobserved, and
-- §35 is explicit that the screen must say so.
create table if not exists public.ai_providers (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique check (key ~ '^[a-z0-9_]+$'),
  name            text not null,
  description     text,

  -- Which env var holds the secret. The NAME, never the value.
  credential_env  text,

  -- Set false to hide a provider we are not pursuing.
  enabled         boolean not null default true,

  status          text not null default 'unknown' check (status in (
                    'operational', 'warning', 'disconnected', 'not_configured', 'unknown')),
  status_detail   text,
  last_checked_at timestamptz,

  -- Optional, and only when the provider actually tells us.
  quota_limit_micro_usd  bigint check (quota_limit_micro_usd is null or quota_limit_micro_usd >= 0),
  quota_used_micro_usd   bigint check (quota_used_micro_usd  is null or quota_used_micro_usd  >= 0),

  docs_url        text,
  sort_order      integer not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── ai_models ────────────────────────────────────────────────────────
-- The rate card, and the only place a cost estimate can come from.
--
-- Prices are seeded NULL ON PURPOSE. Publishing a guess at what a vendor
-- charges, and then multiplying it by a million tokens, produces a
-- confident wrong number on a finance screen. Until somebody enters the
-- rate they are actually billed, cost reads "Rate not set" and the margin
-- reads Unknown. That is the honest state and it is a one-field fix.
create table if not exists public.ai_models (
  id                uuid primary key default gen_random_uuid(),
  provider_key      text not null references public.ai_providers(key) on delete cascade,
  model             text not null,
  display_name      text,

  -- US dollars per MILLION tokens, in micro-dollars, so a rate of
  -- $1.00/MTok is 1_000_000. Null means "not set", which is not zero.
  input_micro_usd_per_mtok  bigint check (input_micro_usd_per_mtok  is null or input_micro_usd_per_mtok  >= 0),
  output_micro_usd_per_mtok bigint check (output_micro_usd_per_mtok is null or output_micro_usd_per_mtok >= 0),

  context_window    integer check (context_window is null or context_window > 0),
  is_default        boolean not null default false,
  active            boolean not null default true,
  -- Set when the vendor announces an end date. Drives the "model
  -- deprecated" warning rather than a hard-coded list of old names.
  deprecated_on     date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists ai_models_unique_idx
  on public.ai_models (provider_key, model);
create unique index if not exists ai_models_one_default_idx
  on public.ai_models (provider_key) where is_default;

-- ══════════════════════════════════════════════════════════════════════
-- The solutions themselves
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.ai_solutions (
  id                uuid primary key default gen_random_uuid(),

  name              text not null,
  internal_name     text,
  slug              text not null,
  description       text,
  -- One sentence on what it actually does, in the operator's words.
  purpose           text,
  tags              text[] not null default '{}',

  solution_type     text not null default 'chatbot' check (solution_type in (
                      'chatbot', 'agent', 'automation', 'internal_assistant',
                      'content_ai', 'sales_ai', 'support_ai', 'workflow_agent', 'custom')),

  status            text not null default 'draft' check (status in (
                      'draft', 'testing', 'active', 'paused', 'error', 'archived')),

  -- Relationships. Every one of them optional and every one of them a
  -- pointer at a table that already existed.
  customer_id       uuid references public.customers(id)        on delete set null,
  service_id        uuid references public.catalog_items(id)    on delete set null,
  client_service_id uuid references public.client_services(id)  on delete set null,
  app_id            uuid references public.apps(id)             on delete set null,
  website_id        uuid references public.websites(id)         on delete set null,
  job_id            uuid references public.jobs(id)             on delete set null,

  owner             text,

  -- ── Model routing ───────────────────────────────────────────────
  provider_key      text references public.ai_providers(key) on delete set null,
  model             text,
  fallback_provider_key text references public.ai_providers(key) on delete set null,
  fallback_model    text,
  temperature       numeric(3,2) check (temperature is null or (temperature >= 0 and temperature <= 2)),
  max_output_tokens integer check (max_output_tokens is null or max_output_tokens > 0),

  -- ── Where it runs ───────────────────────────────────────────────
  deployment_target text not null default 'internal_admin' check (deployment_target in (
                      'website', 'app', 'client_portal', 'internal_admin',
                      'api', 'widget', 'other')),
  deployment_url    text,
  -- The code path that calls it, so an operator can find the thing.
  source_path       text,

  -- ── Whether the admin is allowed to change its instructions ─────
  -- False for solutions whose output is PARSED as structured data: the
  -- advisor and the planners hand back JSON that other code depends on, and
  -- a well-meaning prompt edit would break them silently. The screen shows
  -- the reason rather than a disabled field with no explanation.
  prompt_editable   boolean not null default true,
  prompt_locked_reason text,

  -- ── Billing terms. Agreed terms, not measurements. ──────────────
  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents >= 0),
  setup_fee_cents     integer check (setup_fee_cents     is null or setup_fee_cents     >= 0),
  usage_markup_pct    numeric(6,2) check (usage_markup_pct is null or usage_markup_pct >= 0),
  billing_type        text not null default 'none' check (billing_type in (
                        'none', 'one_time', 'recurring', 'usage_based', 'included')),

  -- ── Thresholds (§31). Null means no threshold, not zero. ────────
  monthly_cost_warning_micro_usd bigint check (monthly_cost_warning_micro_usd is null or monthly_cost_warning_micro_usd >= 0),
  daily_spend_limit_micro_usd    bigint check (daily_spend_limit_micro_usd    is null or daily_spend_limit_micro_usd    >= 0),
  monthly_token_warning          bigint check (monthly_token_warning          is null or monthly_token_warning          >= 0),
  error_rate_warning_pct         numeric(5,2) check (error_rate_warning_pct   is null or (error_rate_warning_pct >= 0 and error_rate_warning_pct <= 100)),

  notes             text,
  created_by        text,
  is_archived       boolean not null default false,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists ai_solutions_slug_idx on public.ai_solutions (lower(slug));
create index if not exists ai_solutions_customer_idx on public.ai_solutions (customer_id) where customer_id is not null;
create index if not exists ai_solutions_status_idx on public.ai_solutions (status) where is_archived = false;
create index if not exists ai_solutions_type_idx on public.ai_solutions (solution_type) where is_archived = false;

-- ── ai_solution_versions ─────────────────────────────────────────────
-- The prompt, and everything about how the thing behaves, kept as an
-- append-only history.
--
-- §12 is emphatic: a prompt update must never overwrite history silently.
-- So a version is INSERTED, never edited in place, and exactly one row per
-- solution may be active — enforced by an index, not by hope.
create table if not exists public.ai_solution_versions (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid not null references public.ai_solutions(id) on delete cascade,
  version           integer not null check (version > 0),

  system_prompt     text not null,
  persona           text,
  tone              text,
  purpose           text,
  response_rules    text,
  escalation_rules  text,
  fallback_behavior text,
  safety_rules      text,

  temperature       numeric(3,2) check (temperature is null or (temperature >= 0 and temperature <= 2)),
  max_output_tokens integer check (max_output_tokens is null or max_output_tokens > 0),

  status            text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  change_notes      text,
  created_by        text,
  created_at        timestamptz not null default now(),
  activated_at      timestamptz,
  retired_at        timestamptz
);

create unique index if not exists ai_versions_number_idx
  on public.ai_solution_versions (solution_id, version);
-- One live prompt per solution. Two would make "which instructions is it
-- running?" unanswerable, which is the question this tab exists for.
create unique index if not exists ai_versions_one_active_idx
  on public.ai_solution_versions (solution_id) where status = 'active';

-- ── ai_deployments ───────────────────────────────────────────────────
-- §22: an AI Solution is the master system; a deployment is that system
-- configured for one client. The prompt override is a DELTA, not a copy —
-- duplicating the whole prompt per client is how twelve deployments drift
-- into twelve different products.
create table if not exists public.ai_deployments (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid not null references public.ai_solutions(id) on delete cascade,
  customer_id       uuid references public.customers(id) on delete set null,
  name              text not null,

  app_id            uuid references public.apps(id)      on delete set null,
  website_id        uuid references public.websites(id)  on delete set null,
  client_service_id uuid references public.client_services(id) on delete set null,

  environment       text not null default 'production' check (environment in (
                      'production', 'staging', 'development')),
  deployment_url    text,

  -- Appended to the master prompt for this client, not a replacement.
  prompt_override   text,
  brand_voice       text,

  status            text not null default 'active' check (status in (
                      'active', 'paused', 'error', 'draft', 'ended')),
  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents >= 0),

  last_active_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ai_deployments_solution_idx on public.ai_deployments (solution_id);
create index if not exists ai_deployments_customer_idx on public.ai_deployments (customer_id) where customer_id is not null;

-- ── ai_knowledge_sources ─────────────────────────────────────────────
-- What the solution is allowed to know, and when it last actually learned
-- it. `status` starts 'not_synced' — a source that has never been indexed
-- is not current, and the screen says which.
--
-- NO CREDENTIALS. `location` is a URL, a bucket path or a table name.
-- Anything that needs a secret to read reaches it through the server's own
-- configured credentials, never a string stored on this row.
create table if not exists public.ai_knowledge_sources (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid not null references public.ai_solutions(id) on delete cascade,
  deployment_id     uuid references public.ai_deployments(id) on delete cascade,

  name              text not null,
  source_type       text not null check (source_type in (
                      'document', 'website', 'faq', 'database', 'catalog',
                      'policy', 'manual_text', 'vector_store', 'api', 'other')),
  location          text,
  -- Manual FAQ and pasted text live here; everything else points outward.
  content           text,

  status            text not null default 'not_synced' check (status in (
                      'current', 'needs_sync', 'syncing', 'error', 'disabled', 'not_synced')),

  document_count    integer check (document_count is null or document_count >= 0),
  chunk_count       integer check (chunk_count    is null or chunk_count    >= 0),
  size_bytes        bigint  check (size_bytes     is null or size_bytes     >= 0),
  embedding_provider text,
  embedding_model   text,

  -- How long before a synced source is considered stale. Null = never.
  refresh_days      integer check (refresh_days is null or refresh_days > 0),
  last_synced_at    timestamptz,
  last_error        text,
  owner             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ai_knowledge_solution_idx on public.ai_knowledge_sources (solution_id);

-- ── ai_integrations ──────────────────────────────────────────────────
-- Same posture as app_integrations: no row means NOT CONNECTED, and no
-- screen may imply a connection that has no row here. account_ref is a
-- display identifier. Never a key.
create table if not exists public.ai_integrations (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid not null references public.ai_solutions(id) on delete cascade,
  provider          text not null check (provider in (
                      'openai', 'anthropic', 'google', 'perplexity', 'supabase',
                      'gmail', 'google_calendar', 'crm', 'stripe', 'twilio',
                      'resend', 'website_forms', 'meta', 'slack', 'vector_store', 'other')),
  label             text,
  status            text not null default 'not_configured' check (status in (
                      'connected', 'warning', 'disconnected', 'not_configured')),
  environment       text not null default 'all' check (environment in (
                      'all', 'production', 'staging', 'development')),
  account_ref       text,
  -- True when the solution cannot work without it, which is what turns a
  -- disconnection into a Critical rather than a note.
  is_required       boolean not null default false,
  last_checked_at   timestamptz,
  error             text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists ai_integrations_unique_idx
  on public.ai_integrations (solution_id, provider, environment);

-- ── ai_solution_tools ────────────────────────────────────────────────
-- §24: what this AI is allowed to DO, one row per grant, with who granted
-- it and when.
--
-- Least privilege is the default because there is no row until somebody
-- adds one. Nothing in this schema gives a solution blanket access to the
-- admin, and a write-capable tool is marked as such so the screen can show
-- it differently from a read.
create table if not exists public.ai_solution_tools (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid not null references public.ai_solutions(id) on delete cascade,
  tool              text not null check (tool in (
                      'crm_read', 'crm_write', 'client_data_read', 'search_knowledge',
                      'send_email', 'send_sms', 'create_meeting', 'create_task',
                      'generate_proposal', 'generate_invoice', 'create_content',
                      'publish_social', 'billing_read', 'billing_write',
                      'notify_admin', 'route_ticket', 'web_search', 'other')),
  allowed           boolean not null default false,
  -- Ask a human before acting. The house rule is "AI proposes, you decide".
  requires_approval boolean not null default true,
  notes             text,
  granted_by        text,
  granted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists ai_tools_unique_idx
  on public.ai_solution_tools (solution_id, tool);

-- ── ai_conversations ─────────────────────────────────────────────────
-- METADATA ONLY. See the header: message bodies are the client's
-- customers' words and they are not copied into this database.
create table if not exists public.ai_conversations (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid not null references public.ai_solutions(id) on delete cascade,
  deployment_id     uuid references public.ai_deployments(id) on delete set null,
  customer_id       uuid references public.customers(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,

  -- Opaque client-side id, so turns of one chat group together without
  -- anything identifying being stored.
  external_ref      text,

  status            text not null default 'open' check (status in (
                      'open', 'completed', 'abandoned', 'escalated', 'failed')),
  message_count     integer not null default 0 check (message_count >= 0),
  lead_generated    boolean not null default false,
  escalated         boolean not null default false,
  started_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now()
);

create index if not exists ai_conversations_solution_idx
  on public.ai_conversations (solution_id, started_at desc);
create unique index if not exists ai_conversations_ref_idx
  on public.ai_conversations (solution_id, external_ref) where external_ref is not null;

-- ── ai_usage_events ──────────────────────────────────────────────────
-- Every call, with what it cost. THIS IS ALSO THE LOG (§25) — status,
-- error, latency, tokens and cost are all on the row, so the Logs tab and
-- the Usage tab read the same truth and cannot disagree.
--
-- cost_micro_usd is FROZEN AT WRITE TIME from the rate on ai_models, the
-- same way an invoice freezes its amounts. Re-deriving it later from
-- today's rate card would silently rewrite last month's costs. It is null
-- when no rate was set, and null is rendered as "Rate not set", never zero.
create table if not exists public.ai_usage_events (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid not null references public.ai_solutions(id) on delete cascade,
  deployment_id     uuid references public.ai_deployments(id) on delete set null,
  conversation_id   uuid references public.ai_conversations(id) on delete set null,
  customer_id       uuid references public.customers(id) on delete set null,

  event_type        text not null default 'message' check (event_type in (
                      'message', 'run', 'tool_call', 'embedding', 'test', 'error')),
  provider_key      text,
  model             text,

  input_tokens      integer check (input_tokens  is null or input_tokens  >= 0),
  output_tokens     integer check (output_tokens is null or output_tokens >= 0),
  total_tokens      integer generated always as (
                      coalesce(input_tokens, 0) + coalesce(output_tokens, 0)
                    ) stored,

  cost_micro_usd    bigint check (cost_micro_usd is null or cost_micro_usd >= 0),
  latency_ms        integer check (latency_ms is null or latency_ms >= 0),

  status            text not null default 'success' check (status in (
                      'success', 'error', 'rate_limited', 'timeout', 'refused')),
  error             text,
  -- Provider request id, for support tickets. Not a secret.
  request_ref       text,
  -- Non-secret descriptive facts about the call. The recorder writes a
  -- fixed set of keys; nothing puts a prompt body or a token in here.
  metadata          jsonb not null default '{}'::jsonb,

  -- 'internal' when we ran it ourselves, 'client' when an end user did.
  source            text not null default 'internal' check (source in ('internal', 'client', 'test')),
  occurred_at       timestamptz not null default now()
);

create index if not exists ai_usage_solution_idx  on public.ai_usage_events (solution_id, occurred_at desc);
create index if not exists ai_usage_occurred_idx  on public.ai_usage_events (occurred_at desc);
create index if not exists ai_usage_errors_idx    on public.ai_usage_events (solution_id, occurred_at desc) where status <> 'success';
create index if not exists ai_usage_customer_idx  on public.ai_usage_events (customer_id, occurred_at desc) where customer_id is not null;

-- ── ai_alerts ────────────────────────────────────────────────────────
-- A threshold was crossed, or something broke. Distinct from ai_insights
-- (a business observation for the dashboard) and from derived health (a
-- verdict recomputed on every read): an alert is a POINT IN TIME that has
-- to survive the condition clearing, so the history is auditable.
create table if not exists public.ai_alerts (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid references public.ai_solutions(id) on delete cascade,
  provider_key      text references public.ai_providers(key) on delete cascade,

  kind              text not null check (kind in (
                      'error_rate', 'provider_quota', 'provider_disconnected',
                      'knowledge_stale', 'model_deprecated', 'cost_spike',
                      'cost_threshold', 'latency_spike', 'automation_failure',
                      'usage_threshold', 'deployment_offline', 'other')),
  severity          text not null default 'warning' check (severity in ('critical', 'warning', 'info')),
  title             text not null,
  detail            text,
  -- What the number was when it fired, so a stale alert is obvious.
  metric            jsonb not null default '{}'::jsonb,

  status            text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by   text,
  acknowledged_at   timestamptz,
  resolved_at       timestamptz,
  resolved_by       text,
  created_at        timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null))
);

create index if not exists ai_alerts_open_idx
  on public.ai_alerts (created_at desc) where status <> 'resolved';
create index if not exists ai_alerts_solution_idx on public.ai_alerts (solution_id, created_at desc);

-- ── ai_templates ─────────────────────────────────────────────────────
-- §32: the starting points. A template is a shape, not a running system —
-- it has no client, no usage and no cost, which is why it is its own table
-- and not an ai_solutions row with a flag.
create table if not exists public.ai_templates (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  name              text not null,
  description       text,
  solution_type     text not null default 'chatbot',
  provider_key      text references public.ai_providers(key) on delete set null,
  model             text,
  system_prompt     text,
  -- The tools a solution built from this template starts with, and the
  -- knowledge it needs before it is worth turning on.
  default_tools     text[] not null default '{}',
  knowledge_requirements text[] not null default '{}',
  suggested_service_id uuid references public.catalog_items(id) on delete set null,
  active            boolean not null default true,
  sort_order        integer not null default 100,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── ai_events ────────────────────────────────────────────────────────
-- The audit trail, in the same shape as job_events, service_events and
-- app_events so the dashboard's activity union reads it without a new
-- abstraction.
create table if not exists public.ai_events (
  id                uuid primary key default gen_random_uuid(),
  solution_id       uuid references public.ai_solutions(id) on delete cascade,
  deployment_id     uuid references public.ai_deployments(id) on delete set null,
  kind              text not null default 'note' check (kind in (
                      'created', 'updated', 'status_change', 'prompt_changed',
                      'model_changed', 'provider_changed', 'knowledge_synced',
                      'knowledge_added', 'deployment_created', 'integration',
                      'tool_changed', 'automation', 'alert', 'threshold',
                      'archived', 'note')),
  body              text not null,
  actor             text,
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists ai_events_recent_idx on public.ai_events (created_at desc);
create index if not exists ai_events_solution_idx on public.ai_events (solution_id, created_at desc);

-- ── The link onto tables that already exist ──────────────────────────
alter table public.tasks
  add column if not exists ai_solution_id uuid references public.ai_solutions(id) on delete set null;
create index if not exists tasks_ai_solution_idx
  on public.tasks (ai_solution_id) where ai_solution_id is not null;

-- ══════════════════════════════════════════════════════════════════════
-- Triggers
-- ══════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'ai_providers', 'ai_models', 'ai_solutions', 'ai_deployments',
    'ai_knowledge_sources', 'ai_integrations', 'ai_solution_tools', 'ai_templates'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- Archiving is a status, and the two ways of saying it must not disagree.
-- Same shape as apps_sync_archive, and for the same reason: getting it
-- backwards makes un-archiving impossible.
create or replace function public.ai_solutions_sync_archive()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'archived' or new.is_archived then
      new.status := 'archived';
      new.is_archived := true;
      new.archived_at := coalesce(new.archived_at, now());
    else
      new.is_archived := false;
      new.archived_at := null;
    end if;
    return new;
  end if;

  if new.is_archived is distinct from old.is_archived then
    if new.is_archived then
      new.status := 'archived';
    elsif new.status = 'archived' then
      new.status := 'paused';
    end if;
  else
    new.is_archived := (new.status = 'archived');
  end if;

  if new.is_archived then
    new.archived_at := coalesce(old.archived_at, new.archived_at, now());
  else
    new.archived_at := null;
  end if;

  return new;
end $$;

drop trigger if exists ai_solutions_archive_sync on public.ai_solutions;
create trigger ai_solutions_archive_sync
  before insert or update on public.ai_solutions
  for each row execute function public.ai_solutions_sync_archive();

-- Activating a prompt version retires the one it replaced, in the same
-- statement. Doing this in application code would leave a window where a
-- solution has two active prompts or none.
create or replace function public.ai_versions_single_active()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.status = 'active' then
    update public.ai_solution_versions
       set status = 'retired', retired_at = now()
     where solution_id = new.solution_id
       and id <> new.id
       and status = 'active';
    new.activated_at := coalesce(new.activated_at, now());
  end if;
  return new;
end $$;

drop trigger if exists ai_versions_activate on public.ai_solution_versions;
create trigger ai_versions_activate
  before insert or update of status on public.ai_solution_versions
  for each row execute function public.ai_versions_single_active();

-- A conversation's counters follow its events, so nothing has to remember
-- to keep them in step.
create or replace function public.ai_conversation_touch()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.conversation_id is not null then
    update public.ai_conversations
       set message_count = message_count + 1,
           last_activity_at = greatest(last_activity_at, new.occurred_at),
           status = case
                      when new.status <> 'success' then 'failed'
                      when status = 'open' then 'open'
                      else status
                    end
     where id = new.conversation_id;
  end if;
  return null;
end $$;

drop trigger if exists ai_usage_conversation_touch on public.ai_usage_events;
create trigger ai_usage_conversation_touch
  after insert on public.ai_usage_events
  for each row execute function public.ai_conversation_touch();

-- ══════════════════════════════════════════════════════════════════════
-- RLS — same deny-by-default posture as every other table here
-- ══════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'ai_providers', 'ai_models', 'ai_solutions', 'ai_solution_versions',
    'ai_deployments', 'ai_knowledge_sources', 'ai_integrations',
    'ai_solution_tools', 'ai_conversations', 'ai_usage_events',
    'ai_alerts', 'ai_templates', 'ai_events'
  ] loop
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

-- ══════════════════════════════════════════════════════════════════════
-- Seed — the providers, and the six systems that are already running
-- ══════════════════════════════════════════════════════════════════════

-- Providers. Anthropic is the only one this codebase actually calls today;
-- the rest are listed so they can be configured, and they start
-- 'not_configured' rather than pretending to be operational.
insert into public.ai_providers (key, name, description, credential_env, status, docs_url, sort_order)
values
  ('anthropic', 'Claude', 'Anthropic Claude. Every AI feature in this admin runs on it today.',
   'ANTHROPIC_API_KEY', 'unknown', 'https://docs.anthropic.com', 10),
  ('openai', 'OpenAI', 'GPT models and embeddings.',
   'OPENAI_API_KEY', 'not_configured', 'https://platform.openai.com/docs', 20),
  ('google', 'Google Gemini', 'Gemini models.',
   'GEMINI_API_KEY', 'not_configured', 'https://ai.google.dev/docs', 30),
  ('perplexity', 'Perplexity', 'Web-grounded search and answers.',
   'PERPLEXITY_API_KEY', 'not_configured', 'https://docs.perplexity.ai', 40)
on conflict (key) do nothing;

-- The models actually referenced in this codebase.
--
-- PRICES ARE DELIBERATELY NULL. See the ai_models comment: a guessed rate
-- multiplied by a million tokens is a confident wrong number on a finance
-- screen. Enter the rate you are billed and every cost and margin on these
-- screens starts working; until then they read "Rate not set".
insert into public.ai_models (provider_key, model, display_name, is_default, active, notes)
values
  ('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', true, true,
   'Used by the website chat assistant, ad copy, task prioritiser and week planner.'),
  ('anthropic', 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', false, true,
   'Used by the business advisor and the content generator.')
on conflict (provider_key, model) do nothing;

-- ── The six live systems ─────────────────────────────────────────────
-- These are not examples. Each one is a Claude call that exists in this
-- repository today, and the source_path is where to find it. Registering
-- them is what makes this screen a record of the business rather than an
-- empty shell waiting for someone to type into it.
insert into public.ai_solutions (
  name, internal_name, slug, description, purpose, solution_type, status,
  provider_key, model, deployment_target, deployment_url, source_path,
  prompt_editable, prompt_locked_reason, owner, tags, created_by
) values
  (
    'Website Chat Assistant', 'website-chat', 'website-chat',
    'The Claude-powered assistant embedded on tomorrowstechai.com. Answers questions about services, pricing and packages, and points visitors at the discovery call and the lead magnets.',
    'Convert website visitors into booked discovery calls.',
    'sales_ai', 'active', 'anthropic', 'claude-haiku-4-5-20251001',
    'website', 'https://tomorrowstechai.com', 'src/app/api/chat/route.ts',
    true, null, 'John', array['public','sales','website'], 'system'
  ),
  (
    'Business Advisor', 'admin-advisor', 'business-advisor',
    'The advisor on the admin dashboard. Answers questions about the business from live figures and proposes actions into the ai_actions queue for approval.',
    'Answer questions about the business from real numbers, and propose — never execute.',
    'internal_assistant', 'active', 'anthropic', 'claude-sonnet-4-5-20250929',
    'internal_admin', '/admin', 'src/app/api/admin/advisor/route.ts',
    false, 'Its replies are parsed as structured actions by the approval queue. Editing the instructions here would break that contract silently, so changes go through the code.',
    'John', array['internal','advisor'], 'system'
  ),
  (
    'Content Generator', 'content-studio', 'content-generator',
    'Generates social and blog drafts in Content Studio, using the stored brand profile so each brand keeps its own voice.',
    'Draft on-brand content that a human edits and publishes.',
    'content_ai', 'active', 'anthropic', 'claude-sonnet-4-5-20250929',
    'internal_admin', '/admin/marketing/content', 'src/app/api/admin/content-generate/route.ts',
    false, 'Its instructions are composed at request time from the selected brand profile, so there is no single stored prompt to edit here.',
    'John', array['internal','content','marketing'], 'system'
  ),
  (
    'Ad Copy Writer', 'ad-studio', 'ad-copy-writer',
    'Writes Facebook and Instagram ad variants in Ad Studio for the trade-business campaigns.',
    'Produce ad variants worth testing, fast.',
    'content_ai', 'active', 'anthropic', 'claude-haiku-4-5-20251001',
    'internal_admin', '/admin/marketing/ads', 'src/app/api/admin/ad-copy/route.ts',
    false, 'Its instructions are composed at request time from the live offer registry — the package prices and what each one includes — so there is no single stored prompt to edit here. Change the offers and the instructions follow.',
    'John', array['internal','marketing','ads'], 'system'
  ),
  (
    'Task Prioritiser', 'task-prioritise', 'task-prioritiser',
    'Ranks the open task list against dates, clients and value, and explains each ranking.',
    'Answer "what should I do next" with a reason attached.',
    'workflow_agent', 'active', 'anthropic', 'claude-haiku-4-5-20251001',
    'internal_admin', '/admin/tasks', 'src/app/api/admin/tasks/prioritize/route.ts',
    false, 'Its reply is parsed as a ranked list that the Tasks board consumes. Changes go through the code.',
    'John', array['internal','tasks'], 'system'
  ),
  (
    'Week Planner', 'calendar-plan', 'week-planner',
    'Drafts a plan for the week from the calendar, the open tasks and what is due, for a human to accept or ignore.',
    'Turn a full calendar and an open task list into a proposed week.',
    'workflow_agent', 'active', 'anthropic', 'claude-haiku-4-5-20251001',
    'internal_admin', '/admin/calendar', 'src/app/api/admin/calendar/plan-week/route.ts',
    false, 'Its reply is parsed into calendar blocks. Changes go through the code.',
    'John', array['internal','calendar'], 'system'
  )
on conflict do nothing;

-- Least-privilege tool grants for the six. Note what is NOT here: none of
-- them may write to the CRM, send an email, send an SMS or touch billing.
-- The advisor proposes actions into ai_actions and a human approves them,
-- which is the whole "AI proposes, you decide" rule expressed as rows.
insert into public.ai_solution_tools (solution_id, tool, allowed, requires_approval, granted_by, granted_at, notes)
select s.id, t.tool, t.allowed, t.requires_approval, 'system', now(), t.notes
from public.ai_solutions s
join (values
  ('website-chat',    'search_knowledge', true,  false, 'Reads the site content baked into its instructions.'),
  ('business-advisor','crm_read',         true,  false, 'Reads live figures to answer questions.'),
  ('business-advisor','billing_read',     true,  false, 'Reads revenue and invoice totals.'),
  ('business-advisor','create_task',      true,  true,  'Proposes into ai_actions. A human approves before anything is written.'),
  ('content-generator','create_content',  true,  true,  'Drafts only. Publishing is a separate human step.'),
  ('ad-copy-writer',  'create_content',   true,  true,  'Drafts only.'),
  ('task-prioritiser','crm_read',         true,  false, 'Reads tasks, clients and dates to rank them.'),
  ('week-planner',    'crm_read',         true,  false, 'Reads the calendar and the task list.')
) as t(slug, tool, allowed, requires_approval, notes) on t.slug = s.slug
on conflict (solution_id, tool) do nothing;

-- The integration each one actually depends on: Anthropic, and it is
-- required — without it the feature does not work at all.
insert into public.ai_integrations (solution_id, provider, label, status, is_required)
select id, 'anthropic', 'Anthropic API', 'not_configured', true
from public.ai_solutions
where slug in ('website-chat','business-advisor','content-generator','ad-copy-writer','task-prioritiser','week-planner')
on conflict (solution_id, provider, environment) do nothing;

-- ── Templates ────────────────────────────────────────────────────────
insert into public.ai_templates (key, name, description, solution_type, provider_key, default_tools, knowledge_requirements, sort_order)
values
  ('website-sales-assistant', 'Website Sales Assistant',
   'Answers visitor questions about services and pricing and pushes toward a booked call.',
   'sales_ai', 'anthropic', array['search_knowledge'], array['Services and pricing','Booking link','Company background'], 10),
  ('customer-support-bot', 'Customer Support Bot',
   'Handles common support questions and escalates anything it cannot answer.',
   'support_ai', 'anthropic', array['search_knowledge','notify_admin','route_ticket'], array['FAQs','Policies','Product documentation'], 20),
  ('lead-qualification-agent', 'Lead Qualification Agent',
   'Asks qualifying questions and writes a scored summary for a human to action.',
   'agent', 'anthropic', array['search_knowledge','crm_read','create_task'], array['Qualifying criteria','Service fit rules'], 30),
  ('appointment-scheduler', 'Appointment Scheduler',
   'Offers real availability and proposes a booking for confirmation.',
   'agent', 'anthropic', array['create_meeting','search_knowledge'], array['Availability rules','Meeting types'], 40),
  ('content-creation-agent', 'Content Creation Agent',
   'Drafts posts and articles in a stored brand voice.',
   'content_ai', 'anthropic', array['create_content'], array['Brand profile','Tone guide','Past posts'], 50),
  ('proposal-generator', 'Proposal Generator',
   'Drafts a proposal from the catalog and the client record for a human to price and send.',
   'agent', 'anthropic', array['crm_read','generate_proposal'], array['Service catalog','Proposal template'], 60),
  ('internal-knowledge-assistant', 'Internal Knowledge Assistant',
   'Answers staff questions from internal documentation.',
   'internal_assistant', 'anthropic', array['search_knowledge'], array['Internal documentation','Process notes'], 70),
  ('social-content-agent', 'Social Content Agent',
   'Plans and drafts a social calendar for approval.',
   'content_ai', 'anthropic', array['create_content','publish_social'], array['Brand profile','Channel rules'], 80)
on conflict (key) do nothing;

commit;
