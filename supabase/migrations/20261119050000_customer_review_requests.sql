-- Google review requests, per client.
--
-- Remembers when a client was last asked for a Google review, how many times,
-- and when John marked them as having left one. The admin uses this to stop
-- the same client being asked twice in a row and to stop asking once they
-- have reviewed. Three nullable columns; no existing data changes.

alter table public.customers
  add column if not exists review_requested_at  timestamptz,
  add column if not exists review_request_count integer not null default 0,
  add column if not exists review_received_at   timestamptz;
