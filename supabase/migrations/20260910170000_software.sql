begin;

-- ---------------------------------------------------------------------
-- Software — the commercial software product portfolio.
--
-- Read the header of 20260910120000_apps.sql before this one. The same
-- discipline applies, and the distinction it draws is the whole reason this
-- module exists separately.
--
-- WHAT A "SOFTWARE PRODUCT" IS, AND WHY IT IS NOT AN APP
--   `apps` is a DEPLOYABLE THING: one codebase, one repository, one set of
--   environments, its own deployments and health. PoolBusinessAI is not one
--   of those. It is five of them — a web platform, an admin center, a
--   technician app, a customer portal and a store — sold as one product,
--   under one price list, to one set of clients, on one version number.
--
--   That product is what gets sold, versioned, priced in plans, put on a
--   roadmap and renewed. Modelling it as an app would mean either five rows
--   that each carry a copy of the price list and the client list, or one row
--   whose repository, deployments and health are the union of five different
--   things. So: a product table, and `apps` gains a nullable software_id
--   pointing up at it. An app that belongs to no product is still just an
--   app, which is the common case and stays untouched.
--
-- WHAT ALREADY EXISTED, and is NOT duplicated:
--   customers        — the CLIENT. Nothing here copies a client record.
--   catalog_items    — the SERVICE: what is actually sold. A software plan is
--                      the PRODUCT SIDE of an offer; the catalog item is the
--                      sellable side. catalog_items gains software_id and
--                      software_plan_id so the two can be tied together, and
--                      the Services workflow keeps owning the sale.
--   client_services  — the SUBSCRIPTION, with its agreed price snapshot,
--                      billing type, interval, Stripe reference and dates.
--                      software_clients references it rather than restating
--                      it. There is no second billing engine here.
--   invoices / invoice_items / invoice_payments — the MONEY. One nullable
--                      software_id is added to invoices for attribution.
--   jobs             — the IMPLEMENTATION PROJECT (the admin calls these
--                      Projects). software_clients.job_id points at one.
--   tasks            — the WORK, and therefore the ISSUES and the RELEASE
--                      CHECKLISTS. tasks gains software_id,
--                      software_release_id and software_roadmap_item_id. A
--                      bug is a task with type = 'development'; a checklist
--                      item is a task on a release. A second task engine
--                      would drift from the first one inside a week.
--   apps + app_environments + app_deployments + app_health_checks +
--   app_incidents    — the RUNNING SOFTWARE and everything known about
--                      whether it is up. Product health is COMPUTED from
--                      these on every read; see below.
--   task_templates   — the ONBOARDING / RELEASE CHECKLIST definitions.
--
-- NOT created, on purpose:
--   software_health / software_alerts — health is derived on read from the
--                      product's apps, incidents, releases, billing and
--                      onboarding, exactly as app health is derived from its
--                      checks. A stored health column is a verdict that was
--                      true once, and it is the single easiest way to end up
--                      showing a green dot for a product that is down.
--   software_subscriptions / software_invoices / software_revenue — those
--                      are client_services, invoices.software_id and a sum
--                      computed at read time.
--   software_issues / software_release_tasks — tasks, per above.
--   software_infrastructure / software_domains / software_secrets — an
--                      environment, a domain and an SSL state belong to the
--                      app that answers on them. The Infrastructure tab reads
--                      across the product's apps. NO TOKEN, KEY OR PASSWORD
--                      IS STORED IN THIS MODULE AT ALL; credentials stay in
--                      integration_credentials, which has RLS on and
--                      deliberately no policy.
--   software_clients_users — a product's END USERS live in that product's own
--                      database. Same rule as apps.
-- ---------------------------------------------------------------------


-- ── software_products ────────────────────────────────────────────────
create table if not exists public.software_products (
  id              uuid primary key default gen_random_uuid(),

  name            text not null,
  -- What we call it internally when that differs from the market name.
  internal_name   text,
  slug            text not null,
  description     text,
  logo_url        text,

  product_type    text not null default 'saas_platform' check (product_type in (
                    'saas_platform', 'industry_saas', 'custom_software',
                    'internal_tool', 'white_label', 'client_portal',
                    'fleet_saas', 'ai_saas', 'crm_platform',
                    'operations_platform', 'other')),
  industry        text,

  -- LIFECYCLE, which is a decision somebody made. Health is a measurement
  -- and is deliberately not a column here — see the header.
  status          text not null default 'planning' check (status in (
                    'planning', 'development', 'testing', 'beta', 'live',
                    'maintenance', 'paused', 'deprecated', 'archived')),

  -- Emails, not FKs to admin_users: the technical owner of a white-label
  -- product is sometimes a contractor with no admin account, and a null FK
  -- cannot say that.
  owner           text,
  technical_owner text,
  sales_owner     text,

  -- ── What it is sold as ──────────────────────────────────────────
  -- The catalog item is the sellable offer; this is the default one to
  -- reach for. The Services workflow still owns the sale itself.
  default_service_id       uuid references public.catalog_items(id) on delete set null,
  -- The checklist an implementation starts from.
  default_task_template_id uuid references public.task_templates(id) on delete set null,
  -- Which intake form a new client of this product is sent. A key, because
  -- intakes are configured in code (lib/intake/config.ts), not in a table.
  default_intake_key       text,
  -- The marketing site for the product, when it has one.
  website_id               uuid references public.websites(id) on delete set null,

  -- ── Commercial defaults ─────────────────────────────────────────
  -- These are the LIST TERMS. What a given client actually pays is
  -- snapshotted on software_clients, and what was collected is derived
  -- from invoices. The screens label the three differently on purpose.
  billing_model     text not null default 'subscription' check (billing_model in (
                      'subscription', 'one_time', 'subscription_setup',
                      'usage_based', 'custom')),
  default_monthly_price_cents integer check (default_monthly_price_cents is null
                      or default_monthly_price_cents >= 0),
  setup_fee_cents   integer check (setup_fee_cents is null or setup_fee_cents >= 0),
  trial_available   boolean not null default false,
  trial_days        integer check (trial_days is null or trial_days >= 0),
  currency          text not null default 'usd',

  -- ── Release posture ─────────────────────────────────────────────
  release_channel   text not null default 'stable' check (release_channel in (
                      'stable', 'beta', 'alpha', 'canary', 'internal')),
  launch_date       date,

  notes           text,

  is_archived     boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per real product. Case-insensitive so the same product cannot
-- arrive twice as "poolbusinessai" and "PoolBusinessAI".
create unique index if not exists software_products_slug_idx
  on public.software_products (lower(slug));
create index if not exists software_products_status_idx
  on public.software_products (status) where is_archived = false;
create index if not exists software_products_service_idx
  on public.software_products (default_service_id) where default_service_id is not null;

-- ── software_versions ────────────────────────────────────────────────
-- What is built, in order. A version is a fact about the code; a release
-- (below) is the plan and the process that shipped it. They are separate
-- because a release can slip, be blocked, or be cancelled without the
-- version ever existing, and because one version is sometimes shipped by
-- two releases (a hotfix re-cut).
--
-- Which version is live is a FLAG HERE, not a pointer on the product. Two
-- places holding the same fact is how "current version" ends up disagreeing
-- with itself; the partial unique indexes below make the flag single-valued.
create table if not exists public.software_versions (
  id              uuid primary key default gen_random_uuid(),
  software_id     uuid not null references public.software_products(id) on delete cascade,

  -- Free text, not a triple of integers: real products ship "2.4.1",
  -- "2024.09" and "v3-rc2" and this table should not have an opinion.
  version         text not null,
  channel         text not null default 'stable' check (channel in (
                    'stable', 'beta', 'alpha', 'canary', 'internal')),
  status          text not null default 'draft' check (status in (
                    'draft', 'development', 'testing', 'staging',
                    'release_candidate', 'production', 'deprecated')),
  environment     text check (environment in (
                    'production', 'staging', 'development', 'preview')),

  release_notes   text,
  is_breaking     boolean not null default false,

  is_current_production boolean not null default false,
  is_current_staging    boolean not null default false,

  released_at     timestamptz,
  deprecated_at   timestamptz,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A version that claims to be in production has to say when it shipped.
  check (not is_current_production or released_at is not null)
);

create unique index if not exists software_versions_unique_idx
  on public.software_versions (software_id, lower(version));
create index if not exists software_versions_recent_idx
  on public.software_versions (software_id, created_at desc);
-- At most one current production / staging version per product. Two would
-- make "what is live?" an ambiguous question.
create unique index if not exists software_versions_one_production_idx
  on public.software_versions (software_id) where is_current_production;
create unique index if not exists software_versions_one_staging_idx
  on public.software_versions (software_id) where is_current_staging;

-- ── software_plans ───────────────────────────────────────────────────
-- The price list. A plan is never edited in place in a way that rewrites
-- history: software_plan_price_history records every change, and what a
-- client actually pays is snapshotted on software_clients at the moment of
-- sale. Raising the Pro price must not silently reprice last month's
-- invoice, and cannot, because no invoice reads this table.
create table if not exists public.software_plans (
  id              uuid primary key default gen_random_uuid(),
  software_id     uuid not null references public.software_products(id) on delete cascade,

  name            text not null,
  description     text,

  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents >= 0),
  annual_price_cents  integer check (annual_price_cents  is null or annual_price_cents  >= 0),
  setup_fee_cents     integer check (setup_fee_cents     is null or setup_fee_cents     >= 0),
  trial_days          integer check (trial_days is null or trial_days >= 0),

  -- 'grandfathered' is the honest state for a plan nobody may buy any more
  -- but existing clients are still on. Deleting it would orphan them.
  status          text not null default 'draft' check (status in (
                    'draft', 'active', 'grandfathered', 'retired')),
  is_default      boolean not null default false,
  display_order   integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists software_plans_name_idx
  on public.software_plans (software_id, lower(name));
create index if not exists software_plans_order_idx
  on public.software_plans (software_id, display_order);
create unique index if not exists software_plans_one_default_idx
  on public.software_plans (software_id) where is_default;

-- ── software_plan_price_history ──────────────────────────────────────
-- Same shape and same purpose as service_price_history: what the list price
-- was, and when it changed. Written by a trigger so it cannot be forgotten.
create table if not exists public.software_plan_price_history (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.software_plans(id) on delete cascade,
  monthly_price_cents integer,
  annual_price_cents  integer,
  setup_fee_cents     integer,
  actor           text,
  created_at      timestamptz not null default now()
);

create index if not exists software_plan_price_history_idx
  on public.software_plan_price_history (plan_id, created_at desc);

-- ── software_plan_limits ─────────────────────────────────────────────
-- Usage limits, as ROWS rather than columns.
--
-- The brief lists users, technicians, locations, clients, projects,
-- storage, AI usage, messages, API calls and products — and then "other
-- configurable limits", which is the tell. A pool product limits
-- technicians; a fleet product limits vehicles; a CRM limits seats. As
-- columns that is a table where every product leaves most of it null and
-- adding a limit is a migration. As rows it is a form.
--
-- limit_type carries the three states the UI needs: an explicit number,
-- unlimited, or not included at all. `limit_value` is meaningful only for
-- 'numeric', and the check enforces that.
create table if not exists public.software_plan_limits (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.software_plans(id) on delete cascade,
  limit_key       text not null,
  label           text not null,
  limit_type      text not null default 'numeric' check (limit_type in (
                    'numeric', 'unlimited', 'not_included')),
  limit_value     numeric check (limit_value is null or limit_value >= 0),
  unit            text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check ((limit_type = 'numeric') = (limit_value is not null))
);

create unique index if not exists software_plan_limits_unique_idx
  on public.software_plan_limits (plan_id, lower(limit_key));

-- ── software_features ────────────────────────────────────────────────
-- The product's own feature register. Product-scoped on purpose: "Fleet"
-- means something different in PoolBusinessAI and in AEGIS, and a global
-- feature list would force one product's vocabulary onto another.
create table if not exists public.software_features (
  id              uuid primary key default gen_random_uuid(),
  software_id     uuid not null references public.software_products(id) on delete cascade,

  name            text not null,
  category        text not null default 'other' check (category in (
                    'crm', 'scheduling', 'billing', 'ai', 'mobile',
                    'inventory', 'fleet', 'marketing', 'reporting',
                    'automation', 'admin', 'security', 'integrations',
                    'support', 'other')),
  description     text,
  status          text not null default 'planned' check (status in (
                    'planned', 'in_development', 'testing', 'live', 'deprecated')),

  -- Which version first shipped it, and which version the current
  -- behaviour belongs to. Both nullable: a planned feature has neither.
  introduced_version_id uuid references public.software_versions(id) on delete set null,
  current_version_id    uuid references public.software_versions(id) on delete set null,

  owner           text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists software_features_name_idx
  on public.software_features (software_id, lower(name));
create index if not exists software_features_category_idx
  on public.software_features (software_id, category, sort_order);

-- ── software_plan_features ───────────────────────────────────────────
-- The comparison matrix, as a relationship rather than a hard-coded grid.
--
-- Three states, because the real matrix has three: included, included but
-- limited (the "AI Assistant: Limited" cell), and not in this plan. A
-- missing row means NOT INCLUDED and every screen must read it that way,
-- so adding a feature never silently grants it to every plan.
create table if not exists public.software_plan_features (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.software_plans(id) on delete cascade,
  feature_id      uuid not null references public.software_features(id) on delete cascade,
  inclusion       text not null default 'included' check (inclusion in (
                    'included', 'limited', 'not_included')),
  -- What "limited" means here, in the words that go in the cell tooltip.
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists software_plan_features_unique_idx
  on public.software_plan_features (plan_id, feature_id);
create index if not exists software_plan_features_feature_idx
  on public.software_plan_features (feature_id);

-- ── software_releases ────────────────────────────────────────────────
-- The PLAN to ship, kept separate from the version it ships.
--
-- A release can be planned, slip, be blocked and be cancelled without any
-- version ever existing; and a version can be cut twice (a hotfix re-cut)
-- by two releases. Collapsing the two would mean either inventing version
-- rows for releases that never happened or losing the fact that a release
-- was blocked. version_id is therefore nullable and is filled in when the
-- release actually produces something.
create table if not exists public.software_releases (
  id              uuid primary key default gen_random_uuid(),
  software_id     uuid not null references public.software_products(id) on delete cascade,

  name            text not null,
  version_id      uuid references public.software_versions(id) on delete set null,

  status          text not null default 'planned' check (status in (
                    'planned', 'in_development', 'code_complete', 'testing',
                    'ready', 'released', 'blocked', 'canceled')),

  target_date     date,
  released_at     timestamptz,
  owner           text,
  release_notes   text,
  -- A blocked release must say what is blocking it. "Blocked" with no
  -- reason is a status nobody can act on.
  blocked_reason  text,

  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check ((status = 'released') = (released_at is not null)),
  check (status <> 'blocked' or blocked_reason is not null)
);

create unique index if not exists software_releases_name_idx
  on public.software_releases (software_id, lower(name));
create index if not exists software_releases_upcoming_idx
  on public.software_releases (software_id, target_date)
  where status not in ('released', 'canceled');
create index if not exists software_releases_version_idx
  on public.software_releases (version_id) where version_id is not null;

-- ── software_roadmap_items ───────────────────────────────────────────
-- What is being considered, decided and built, in one lane per state.
--
-- A roadmap item is not a task and not a feature. A feature is something
-- the product HAS; a roadmap item is the ARGUMENT for building it —
-- priority, business value, effort, who asked for it and which release it
-- is aimed at. When it ships it points at the feature it produced.
create table if not exists public.software_roadmap_items (
  id              uuid primary key default gen_random_uuid(),
  software_id     uuid not null references public.software_products(id) on delete cascade,

  title           text not null,
  description     text,
  feature_id      uuid references public.software_features(id) on delete set null,

  status          text not null default 'idea' check (status in (
                    'idea', 'planned', 'approved', 'in_development',
                    'testing', 'ready', 'released', 'deferred')),
  priority        text not null default 'medium' check (priority in (
                    'critical', 'high', 'medium', 'low')),

  owner           text,
  target_release_id uuid references public.software_releases(id) on delete set null,
  -- Free text ("2026-Q4"), because a quarter is a label people type and a
  -- date range would imply a precision the roadmap does not have.
  target_quarter  text,

  business_value  text check (business_value is null or business_value in ('high', 'medium', 'low')),
  effort          text check (effort is null or effort in ('xs', 's', 'm', 'l', 'xl')),

  -- Position inside its board column. Drag-and-drop writes this.
  sort_order      integer not null default 0,
  released_at     timestamptz,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check ((status = 'released') = (released_at is not null))
);

create index if not exists software_roadmap_status_idx
  on public.software_roadmap_items (software_id, status, sort_order);
create index if not exists software_roadmap_release_idx
  on public.software_roadmap_items (target_release_id) where target_release_id is not null;
create index if not exists software_roadmap_feature_idx
  on public.software_roadmap_items (feature_id) where feature_id is not null;

-- ── software_release_items ───────────────────────────────────────────
-- What is IN a release: features, roadmap items and issues, in the order
-- they appear on the release note.
--
-- The issue side points at `tasks` rather than at an issues table, because
-- tasks already is the issue tracker (see the header). Every FK is nullable
-- and `title` carries the free-text case — "Upgrade Node to 22" is a real
-- release line item that is not any of the three.
create table if not exists public.software_release_items (
  id              uuid primary key default gen_random_uuid(),
  release_id      uuid not null references public.software_releases(id) on delete cascade,
  item_type       text not null default 'note' check (item_type in (
                    'feature', 'roadmap', 'issue', 'note')),
  feature_id      uuid references public.software_features(id) on delete cascade,
  roadmap_item_id uuid references public.software_roadmap_items(id) on delete cascade,
  task_id         uuid references public.tasks(id) on delete cascade,
  title           text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),

  -- A row has to actually point at the thing its type claims.
  check (
    (item_type = 'feature' and feature_id      is not null) or
    (item_type = 'roadmap' and roadmap_item_id is not null) or
    (item_type = 'issue'   and task_id         is not null) or
    (item_type = 'note'    and title           is not null)
  )
);

create index if not exists software_release_items_idx
  on public.software_release_items (release_id, sort_order);
create unique index if not exists software_release_items_feature_idx
  on public.software_release_items (release_id, feature_id) where feature_id is not null;
create unique index if not exists software_release_items_roadmap_idx
  on public.software_release_items (release_id, roadmap_item_id) where roadmap_item_id is not null;
create unique index if not exists software_release_items_task_idx
  on public.software_release_items (release_id, task_id) where task_id is not null;

-- ── software_feature_requests ────────────────────────────────────────
-- "Six clients have asked for this" is the single most useful input a
-- roadmap has, and nothing in this database could express it before.
--
-- Deliberately NOT the existing `client_requests` table: that one is the
-- outbound "we need your Stripe key / your logo / your domain" flow with a
-- token, an email and an expiry. This is inbound product demand. Same two
-- words, opposite direction.
create table if not exists public.software_feature_requests (
  id              uuid primary key default gen_random_uuid(),
  software_id     uuid not null references public.software_products(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,

  title           text not null,
  detail          text,
  -- Where it landed, once somebody triaged it.
  feature_id      uuid references public.software_features(id) on delete set null,
  roadmap_item_id uuid references public.software_roadmap_items(id) on delete set null,

  priority        text not null default 'medium' check (priority in (
                    'critical', 'high', 'medium', 'low')),
  status          text not null default 'new' check (status in (
                    'new', 'reviewing', 'accepted', 'planned', 'shipped', 'declined')),
  requested_by    text,
  requested_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists software_feature_requests_idx
  on public.software_feature_requests (software_id, status, requested_at desc);
create index if not exists software_feature_requests_roadmap_idx
  on public.software_feature_requests (roadmap_item_id) where roadmap_item_id is not null;
create index if not exists software_feature_requests_customer_idx
  on public.software_feature_requests (customer_id) where customer_id is not null;

-- ── software_clients ─────────────────────────────────────────────────
-- Which client is on which product, on which plan, at which price.
--
-- This is the join the brief asks for, and the four columns that matter are
-- the ones pointing OUT of it: client_service_id is the existing
-- subscription with its billing type, interval, Stripe reference and dates;
-- job_id is the implementation project; plan_id is the price list entry;
-- current_version_id is what this client is actually running, which for
-- self-hosted or staged rollouts is not the product's production version.
--
-- THE SNAPSHOTS ARE THE POINT. monthly_price_snapshot_cents and
-- setup_fee_snapshot_cents record what was agreed AT THE TIME. Editing the
-- Pro plan tomorrow must not retroactively change what this client pays,
-- and because every screen reads the snapshot and never the plan, it
-- cannot. Moving a client to new pricing is a deliberate act that rewrites
-- the snapshot and logs an event.
create table if not exists public.software_clients (
  id              uuid primary key default gen_random_uuid(),
  software_id     uuid not null references public.software_products(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  plan_id         uuid references public.software_plans(id) on delete set null,

  -- The billing record. Null is legitimate: an internal deployment or a
  -- pilot that nobody is invoicing yet.
  client_service_id uuid references public.client_services(id) on delete set null,
  -- The implementation project.
  job_id            uuid references public.jobs(id) on delete set null,

  status          text not null default 'onboarding' check (status in (
                    'active', 'trial', 'onboarding', 'paused', 'past_due', 'canceled')),

  monthly_price_snapshot_cents integer check (monthly_price_snapshot_cents is null
                    or monthly_price_snapshot_cents >= 0),
  setup_fee_snapshot_cents     integer check (setup_fee_snapshot_cents is null
                    or setup_fee_snapshot_cents >= 0),
  currency        text not null default 'usd',

  onboarding_status text not null default 'not_started' check (onboarding_status in (
                    'not_started', 'in_progress', 'blocked', 'complete')),
  onboarding_due_at timestamptz,

  current_version_id uuid references public.software_versions(id) on delete set null,

  start_date      date not null default current_date,
  end_date        date,
  trial_ends_on   date,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (end_date is null or end_date >= start_date)
);

-- One assignment per client per product. A client who buys the product
-- twice is changing plan, not acquiring a second copy.
create unique index if not exists software_clients_unique_idx
  on public.software_clients (software_id, customer_id);
create index if not exists software_clients_status_idx
  on public.software_clients (software_id, status);
create index if not exists software_clients_customer_idx
  on public.software_clients (customer_id);
create index if not exists software_clients_service_idx
  on public.software_clients (client_service_id) where client_service_id is not null;
-- Onboarding that is overdue is one of the Needs Attention rules, so it
-- gets an index rather than a scan.
create index if not exists software_clients_onboarding_idx
  on public.software_clients (onboarding_due_at)
  where onboarding_status not in ('complete') and onboarding_due_at is not null;

-- ── software_costs ───────────────────────────────────────────────────
-- What the product costs us to run, so the Revenue tab can show a margin.
--
-- Same shape and same caveat as service_costs: these are ESTIMATES a human
-- typed, not measured spend, and every screen that shows them is required
-- to label them as estimates. Actual infrastructure spend, when it is ever
-- measured, belongs in `expenses` where the rest of the real money is.
create table if not exists public.software_costs (
  software_id            uuid primary key references public.software_products(id) on delete cascade,
  infrastructure_cost_cents integer check (infrastructure_cost_cents is null or infrastructure_cost_cents >= 0),
  support_cost_cents        integer check (support_cost_cents        is null or support_cost_cents        >= 0),
  ai_api_cost_cents         integer check (ai_api_cost_cents         is null or ai_api_cost_cents         >= 0),
  third_party_cost_cents    integer check (third_party_cost_cents    is null or third_party_cost_cents    >= 0),
  other_cost_cents          integer check (other_cost_cents          is null or other_cost_cents          >= 0),
  notes                  text,
  updated_at             timestamptz not null default now()
);

-- ── software_events ──────────────────────────────────────────────────
-- The product's audit trail, in the same shape as app_events, job_events
-- and service_events so the dashboard's existing activity union can read it
-- without a new abstraction.
create table if not exists public.software_events (
  id          uuid primary key default gen_random_uuid(),
  software_id uuid not null references public.software_products(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  kind        text not null default 'note' check (kind in (
                'created', 'updated', 'status_change', 'plan_created',
                'plan_updated', 'price_change', 'client_added',
                'client_changed', 'client_canceled', 'version_created',
                'version_promoted', 'release_created', 'release_blocked',
                'release_published', 'feature_added', 'feature_updated',
                'roadmap_moved', 'request_received', 'app_linked',
                'archived', 'note')),
  body        text not null,
  actor       text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists software_events_recent_idx
  on public.software_events (software_id, created_at desc);

-- ── The links onto tables that already exist ─────────────────────────
-- Columns, not parallel systems. Every one of these is nullable, so
-- nothing that exists today changes behaviour.

-- An app can be a component of a product. Most apps are not.
alter table public.apps
  add column if not exists software_id uuid references public.software_products(id) on delete set null;
create index if not exists apps_software_idx on public.apps (software_id) where software_id is not null;

-- Work on a product is a task, with everything the Tasks board already
-- gives it. Three columns rather than one, because a release checklist item
-- and a roadmap sub-task are both tasks and the screens need to find them
-- by the thing they hang off.
alter table public.tasks
  add column if not exists software_id uuid references public.software_products(id) on delete set null;
alter table public.tasks
  add column if not exists software_release_id uuid references public.software_releases(id) on delete set null;
alter table public.tasks
  add column if not exists software_roadmap_item_id uuid references public.software_roadmap_items(id) on delete set null;
create index if not exists tasks_software_idx on public.tasks (software_id) where software_id is not null;
create index if not exists tasks_software_release_idx on public.tasks (software_release_id) where software_release_id is not null;
create index if not exists tasks_software_roadmap_idx on public.tasks (software_roadmap_item_id) where software_roadmap_item_id is not null;

-- An invoice can be attributed to a product. Nullable, because most are
-- not: the Revenue tab falls back to the product's clients and their
-- services when nothing is explicitly linked, and says which basis it used.
alter table public.invoices
  add column if not exists software_id uuid references public.software_products(id) on delete set null;
create index if not exists invoices_software_idx on public.invoices (software_id) where software_id is not null;

-- The sellable offer points at the product and the plan it represents.
-- This is the §33 connection: Services controls what is sold, Software
-- controls the product, and these two columns are the seam between them.
alter table public.catalog_items
  add column if not exists software_id uuid references public.software_products(id) on delete set null;
alter table public.catalog_items
  add column if not exists software_plan_id uuid references public.software_plans(id) on delete set null;
create index if not exists catalog_items_software_idx on public.catalog_items (software_id) where software_id is not null;

-- ── updated_at ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'software_products', 'software_versions', 'software_plans',
    'software_plan_limits', 'software_features', 'software_plan_features',
    'software_releases', 'software_roadmap_items',
    'software_feature_requests', 'software_clients'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- ── Archiving ────────────────────────────────────────────────────────
-- Identical posture to apps_sync_archive, and identical reasoning: status
-- is the source of truth and is_archived is derived from it, EXCEPT when a
-- caller moves the flag on its own, in which case the flag is clearly what
-- they meant. Getting this backwards makes un-archiving impossible.
create or replace function public.software_products_sync_archive()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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
      -- Un-archived without being told what it became. Paused is the
      -- honest resting state: it is back, and nobody is working on it.
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

drop trigger if exists software_products_archive_sync on public.software_products;
create trigger software_products_archive_sync
  before insert or update on public.software_products
  for each row execute function public.software_products_sync_archive();

-- ── Current version is single-valued ─────────────────────────────────
-- The partial unique indexes make two current-production versions
-- impossible, which without this trigger would mean promotion fails with a
-- constraint violation and every caller has to remember to demote the old
-- one first inside a transaction. Instead: setting the flag demotes the
-- previous holder, so "promote to production" is one UPDATE and cannot
-- leave the product with two live versions or none.
--
-- The recursive update is safe: the sibling rows are set to false, which
-- does not re-enter either branch.
create or replace function public.software_versions_sync_current()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.is_current_production and (tg_op = 'INSERT' or not old.is_current_production) then
    update public.software_versions
       set is_current_production = false
     where software_id = new.software_id
       and id <> new.id
       and is_current_production;
  end if;

  if new.is_current_staging and (tg_op = 'INSERT' or not old.is_current_staging) then
    update public.software_versions
       set is_current_staging = false
     where software_id = new.software_id
       and id <> new.id
       and is_current_staging;
  end if;

  -- A version cannot be both the live one and the one being staged for
  -- release. Production wins, because it is the one users are on.
  if new.is_current_production and new.is_current_staging then
    new.is_current_staging := false;
  end if;

  -- Promotion to production implies it shipped; the check constraint
  -- requires a date and this is where it comes from.
  if new.is_current_production and new.released_at is null then
    new.released_at := now();
  end if;

  if new.status = 'deprecated' and new.deprecated_at is null then
    new.deprecated_at := now();
  elsif new.status <> 'deprecated' then
    new.deprecated_at := null;
  end if;

  return new;
end $$;

drop trigger if exists software_versions_current_sync on public.software_versions;
create trigger software_versions_current_sync
  before insert or update on public.software_versions
  for each row execute function public.software_versions_sync_current();

-- ── Plan price history ───────────────────────────────────────────────
-- Written by the database so it cannot be forgotten by a caller. The first
-- row is the plan's opening price; every later row is a change. Nothing
-- ever updates or deletes these.
create or replace function public.software_plans_log_price()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.software_plan_price_history
      (plan_id, monthly_price_cents, annual_price_cents, setup_fee_cents)
    values (new.id, new.monthly_price_cents, new.annual_price_cents, new.setup_fee_cents);
    return new;
  end if;

  if new.monthly_price_cents is distinct from old.monthly_price_cents
     or new.annual_price_cents is distinct from old.annual_price_cents
     or new.setup_fee_cents    is distinct from old.setup_fee_cents then
    insert into public.software_plan_price_history
      (plan_id, monthly_price_cents, annual_price_cents, setup_fee_cents)
    values (new.id, new.monthly_price_cents, new.annual_price_cents, new.setup_fee_cents);
  end if;

  return new;
end $$;

drop trigger if exists software_plans_price_log on public.software_plans;
create trigger software_plans_price_log
  after insert or update on public.software_plans
  for each row execute function public.software_plans_log_price();

-- ── Release dates stay consistent with status ────────────────────────
-- The check constraint says released ⇔ released_at is not null. This
-- fills the date in rather than making every caller do it, and clears it
-- when a release is moved back out of Released — which is rare, and
-- deliberate, and should not leave a ship date behind.
create or replace function public.software_releases_sync_dates()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'released' and new.released_at is null then
    new.released_at := now();
  elsif new.status <> 'released' then
    new.released_at := null;
  end if;

  if new.status <> 'blocked' then
    new.blocked_reason := null;
  end if;

  return new;
end $$;

drop trigger if exists software_releases_date_sync on public.software_releases;
create trigger software_releases_date_sync
  before insert or update on public.software_releases
  for each row execute function public.software_releases_sync_dates();

create or replace function public.software_roadmap_sync_dates()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'released' and new.released_at is null then
    new.released_at := now();
  elsif new.status <> 'released' then
    new.released_at := null;
  end if;
  return new;
end $$;

drop trigger if exists software_roadmap_date_sync on public.software_roadmap_items;
create trigger software_roadmap_date_sync
  before insert or update on public.software_roadmap_items
  for each row execute function public.software_roadmap_sync_dates();

-- ── RLS — same deny-by-default posture as every other table here ─────
do $$
declare t text;
begin
  foreach t in array array[
    'software_products', 'software_versions', 'software_plans',
    'software_plan_price_history', 'software_plan_limits',
    'software_features', 'software_plan_features', 'software_releases',
    'software_release_items', 'software_roadmap_items',
    'software_feature_requests', 'software_clients', 'software_costs',
    'software_events'
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

commit;
