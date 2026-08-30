-- ---------------------------------------------------------------------
-- 0009 — the SEO Command Center.
--
-- Two halves, and it matters which is which.
--
-- The AUDIT half is real from the day this ships. It fetches every URL in
-- the sitemap and reads what Google actually receives — title, description,
-- canonical, OG image, headings, JSON-LD, robots — and records what is wrong.
-- No third party involved.
--
-- The SEARCH half (`seo_queries`) is a cache for Google Search Console. It
-- stays empty until GSC is connected, and the UI says so rather than
-- inventing an impression count. Everything about the shape of this table is
-- decided by GSC's own Search Analytics response, so connecting it later is
-- a fetch loop and nothing more.
--
-- NOT created, on purpose:
--   seo_rankings — a daily rank-per-keyword table would be a second copy of
--                  what seo_queries already holds; GSC reports position as a
--                  metric on the query, not as a separate fact.
--   seo_scores   — the health score is derived from the open issues on the
--                  latest run, the same way client health is derived. A
--                  stored score is a number that was true once.
-- ---------------------------------------------------------------------

-- ── seo_audit_runs ───────────────────────────────────────────────────
-- One row per crawl. Keeping the history is what lets the screen say "3
-- issues fixed since Tuesday" instead of only ever showing a snapshot.
create table if not exists public.seo_audit_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running'
                  check (status in ('running', 'complete', 'failed')),
  pages_checked integer not null default 0,
  issues_found  integer not null default 0,
  base_url      text,
  error         text,
  actor         text
);

create index if not exists seo_audit_runs_recent_idx
  on public.seo_audit_runs (started_at desc);

-- ── seo_pages ────────────────────────────────────────────────────────
-- What each page actually served on the last crawl. Stored rather than
-- re-fetched per request: seventeen HTTP round trips is not something to do
-- while somebody waits for a dashboard to paint.
create table if not exists public.seo_pages (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.seo_audit_runs(id) on delete cascade,
  path            text not null,
  url             text not null,
  status_code     integer,
  response_ms     integer,
  title           text,
  title_length    integer,
  description     text,
  description_length integer,
  canonical       text,
  og_image        text,
  h1              text,
  h1_count        integer not null default 0,
  word_count      integer not null default 0,
  -- schema.org types found in JSON-LD, e.g. {Organization,FAQPage}
  jsonld_types    text[] not null default '{}',
  noindex         boolean not null default false,
  internal_links  integer not null default 0,
  checked_at      timestamptz not null default now()
);

create unique index if not exists seo_pages_run_path_key on public.seo_pages (run_id, path);
create index if not exists seo_pages_path_idx on public.seo_pages (path);

-- ── seo_issues ───────────────────────────────────────────────────────
-- `code` is the machine name of a rule in src/lib/seo/rules.ts. The prose
-- lives in the rule, not in the row, so re-wording an issue does not mean
-- rewriting history.
create table if not exists public.seo_issues (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.seo_audit_runs(id) on delete cascade,
  path       text not null,
  code       text not null,
  severity   text not null default 'medium'
               check (severity in ('critical', 'high', 'medium', 'low')),
  detail     text,
  created_at timestamptz not null default now()
);

create index if not exists seo_issues_run_idx on public.seo_issues (run_id, severity);

-- ── seo_queries ──────────────────────────────────────────────────────
-- The Search Console cache. Empty is the honest state until connected.
create table if not exists public.seo_queries (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  query       text not null,
  page        text not null default '',
  clicks      integer not null default 0,
  impressions integer not null default 0,
  -- GSC's own averages for the row. Stored rather than recomputed, because
  -- position is an average over impressions and cannot be re-derived from
  -- clicks and impressions alone.
  ctr         numeric(6, 4) not null default 0,
  position    numeric(6, 2),
  source      text not null default 'search_console'
                check (source in ('search_console', 'manual')),
  synced_at   timestamptz not null default now()
);

create unique index if not exists seo_queries_key
  on public.seo_queries (date, query, page);
create index if not exists seo_queries_recent_idx
  on public.seo_queries (date desc, impressions desc);

-- ── seo_competitors ──────────────────────────────────────────────────
-- Who to watch. The keyword-overlap columns stay null until an SEO data
-- provider is connected — nothing free reports another domain's keywords.
create table if not exists public.seo_competitors (
  id             uuid primary key default gen_random_uuid(),
  domain         text not null,
  label          text,
  notes          text,
  visibility_pct numeric(5, 2),
  keyword_count  integer,
  traffic_est    integer,
  stats_source   text,
  stats_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists seo_competitors_domain_key
  on public.seo_competitors (lower(domain));

drop trigger if exists seo_competitors_touch on public.seo_competitors;
create trigger seo_competitors_touch before update on public.seo_competitors
  for each row execute function public.touch_updated_at();

-- ── RLS — same deny-by-default posture as every other table here ─────
do $$
declare t text;
begin
  foreach t in array array[
    'seo_audit_runs', 'seo_pages', 'seo_issues', 'seo_queries', 'seo_competitors'
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
