/**
 * Rate limiting, two layers.
 *
 * rateLimit() is an in-memory fixed-window counter. It lives per serverless
 * instance, so on Vercel it is a speed bump, not a wall: every warm instance
 * keeps its own count and a cold start forgets it.
 *
 * rateLimitDurable() is the wall. It counts in Postgres through the
 * rate_limit_hit() function (migration 20261119070000_rate_limits.sql), so
 * every instance shares one count. If Supabase is not configured, the
 * migration has not been applied yet, or the call fails for any reason, it
 * logs once and falls back to the in-memory limiter. A limiter outage must
 * never take a public form down with it.
 *
 * dailyBudget() is a site-wide cap (not per visitor) on something that costs
 * money per call, such as image generation or chat.
 */
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now > existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.max - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  // Opportunistic cleanup so the map can't grow unbounded on a warm instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now > v.resetAt) buckets.delete(k);
    }
  }

  if (existing.count > opts.max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  return { ok: true, remaining: opts.max - existing.count, retryAfterSeconds: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

let fallbackLogged = false;

function fallback(key: string, opts: { max: number; windowMs: number }, reason: string): RateLimitResult {
  if (!fallbackLogged) {
    fallbackLogged = true;
    console.warn(`[rate-limit] durable limiter unavailable, using the in-memory one: ${reason}`);
  }
  return rateLimit(key, opts);
}

/**
 * Same contract as rateLimit(), counted in the database so it holds across
 * serverless instances. Never throws.
 */
export async function rateLimitDurable(
  key: string,
  opts: { max: number; windowMs: number }
): Promise<RateLimitResult> {
  if (!supabaseConfigured()) return fallback(key, opts, "Supabase is not configured");
  try {
    const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", {
      p_key: key.slice(0, 300),
      p_max: opts.max,
      p_window_seconds: Math.max(1, Math.ceil(opts.windowMs / 1000)),
    });
    if (error) return fallback(key, opts, error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: unknown; remaining?: unknown; retry_after_seconds?: unknown }
      | null
      | undefined;
    if (!row || typeof row.allowed !== "boolean") {
      return fallback(key, opts, "rate_limit_hit returned an unexpected shape");
    }
    const ok = row.allowed;
    return {
      ok,
      remaining: Math.max(0, Number(row.remaining) || 0),
      retryAfterSeconds: ok ? 0 : Math.max(1, Number(row.retry_after_seconds) || 1),
    };
  } catch (err) {
    return fallback(key, opts, err instanceof Error ? err.message : "unknown error");
  }
}

/**
 * Site-wide daily cap on a paid call. One shared bucket per UTC day, so the
 * worst a flood can cost is `max` calls no matter how many addresses it
 * comes from. Each call counts one against the budget.
 */
export function dailyBudget(name: string, max: number): Promise<RateLimitResult> {
  const day = new Date().toISOString().slice(0, 10);
  return rateLimitDurable(`budget:${name}:${day}`, { max, windowMs: 24 * 60 * 60 * 1000 });
}

/** A positive whole number from an env var, or the fallback. */
export function envCap(name: string, fallbackValue: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallbackValue;
}
