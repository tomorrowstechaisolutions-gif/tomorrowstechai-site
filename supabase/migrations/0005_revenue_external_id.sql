-- ---------------------------------------------------------------------
-- 0005 — make revenue idempotent against webhook replays.
--
-- Stripe retries a webhook until it gets a 2xx, and will happily deliver the
-- same invoice.paid twice. Without a unique external reference a retry books
-- the same $29 again and quietly inflates LTV against ad spend, which is the
-- one number this whole system exists to get right.
-- ---------------------------------------------------------------------
alter table public.revenue_events
  add column if not exists external_id text;

-- Deliberately NOT a partial index. PostgREST's on_conflict cannot infer a
-- partial index's predicate, so `upsert(..., { onConflict: "external_id" })`
-- would fail with "no unique or exclusion constraint matching". Postgres
-- already allows unlimited NULLs in a plain unique index, so rows written by
-- hand in the admin (no external_id) are unaffected. Same trap as 0002.
create unique index if not exists revenue_events_external_key
  on public.revenue_events (external_id);
