-- Rate limits: one shared counter per key, so a limit holds across every
-- serverless instance instead of resetting per instance.
--
-- A key is whatever the caller wants to count: 'contact:<ip>' for a per-
-- visitor limit, 'budget:sticker-ai:2026-11-19' for a site-wide daily cap.
-- Each row is one window: how many hits so far and when the window ends.
-- The app calls rate_limit_hit() through src/lib/rate-limit.ts and falls
-- back to its in-memory limiter when this migration is not applied.
--
-- Server-only, same as business_settings: RLS on with no policy, so only
-- the server's service role can read or write it. The function is
-- security definer and can be executed by the service role alone.

create table if not exists public.rate_limit_buckets (
  key text primary key,
  count int not null,
  reset_at timestamptz not null
);

create index if not exists rate_limit_buckets_reset_at_idx
  on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;

revoke all on public.rate_limit_buckets from anon, authenticated;

-- Count one hit against p_key and say whether it is within p_max for the
-- current window. The upsert is a single statement, so two requests landing
-- together cannot both read the same count: the second waits on the row and
-- sees the first one's increment. An expired window restarts at 1.
create or replace function public.rate_limit_hit(
  p_key text,
  p_max int,
  p_window_seconds int
)
returns table (allowed boolean, remaining int, retry_after_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count int;
  v_reset timestamptz;
begin
  if p_key is null or p_key = '' or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'rate_limit_hit: key, max and window are required';
  end if;

  insert into public.rate_limit_buckets as b (key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case
          when b.reset_at <= v_now then 1
          -- Stop counting well short of int overflow on a hammered key.
          else least(b.count, 1000000000) + 1
        end,
        reset_at = case
          when b.reset_at <= v_now then excluded.reset_at
          else b.reset_at
        end
  returning b.count, b.reset_at into v_count, v_reset;

  -- Opportunistic cleanup on roughly 1 call in 50, so expired rows do not
  -- pile up and no cron is needed.
  if random() < 0.02 then
    delete from public.rate_limit_buckets d
    where d.reset_at < v_now and d.key <> p_key;
  end if;

  return query select
    v_count <= p_max,
    greatest(p_max - v_count, 0),
    case
      when v_count <= p_max then 0
      else greatest(1, ceil(extract(epoch from (v_reset - v_now)))::int)
    end;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
