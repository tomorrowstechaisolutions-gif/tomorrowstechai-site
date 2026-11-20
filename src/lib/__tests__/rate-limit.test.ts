import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real admin module imports "server-only" and builds a Supabase client.
// Neither belongs in a unit test, so the whole module is replaced.
const rpc = vi.fn();
const configured = vi.fn(() => true);

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ rpc }),
  supabaseConfigured: () => configured(),
}));

const HOUR = 60 * 60 * 1000;

/** A fresh copy of the module, so the "log once" flag and the buckets reset. */
async function load() {
  vi.resetModules();
  return import("../rate-limit");
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rpc.mockReset();
  configured.mockReset();
  configured.mockReturnValue(true);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("rateLimit (in-memory)", () => {
  it("allows up to max, then blocks with a retry time", async () => {
    const { rateLimit } = await load();
    expect(rateLimit("k", { max: 2, windowMs: HOUR })).toEqual({ ok: true, remaining: 1, retryAfterSeconds: 0 });
    expect(rateLimit("k", { max: 2, windowMs: HOUR })).toEqual({ ok: true, remaining: 0, retryAfterSeconds: 0 });
    const blocked = rateLimit("k", { max: 2, windowMs: HOUR });
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it("counts each key on its own", async () => {
    const { rateLimit } = await load();
    expect(rateLimit("a", { max: 1, windowMs: HOUR }).ok).toBe(true);
    expect(rateLimit("a", { max: 1, windowMs: HOUR }).ok).toBe(false);
    expect(rateLimit("b", { max: 1, windowMs: HOUR }).ok).toBe(true);
  });

  it("starts a new window once the old one expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
    const { rateLimit } = await load();
    expect(rateLimit("k", { max: 1, windowMs: 1000 }).ok).toBe(true);
    expect(rateLimit("k", { max: 1, windowMs: 1000 }).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit("k", { max: 1, windowMs: 1000 })).toEqual({ ok: true, remaining: 0, retryAfterSeconds: 0 });
  });
});

describe("clientIp", () => {
  it("takes the first forwarded address, then x-real-ip, then 'unknown'", async () => {
    const { clientIp } = await load();
    const req = (headers: Record<string, string>) => new Request("https://example.test", { headers });
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("rateLimitDurable", () => {
  it("uses the database answer when the function is there", async () => {
    const { rateLimitDurable } = await load();
    rpc.mockResolvedValueOnce({ data: [{ allowed: true, remaining: 3, retry_after_seconds: 0 }], error: null });
    expect(await rateLimitDurable("contact:1.2.3.4", { max: 5, windowMs: HOUR })).toEqual({
      ok: true, remaining: 3, retryAfterSeconds: 0,
    });
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "contact:1.2.3.4", p_max: 5, p_window_seconds: 3600,
    });

    rpc.mockResolvedValueOnce({ data: [{ allowed: false, remaining: 0, retry_after_seconds: 120 }], error: null });
    expect(await rateLimitDurable("contact:1.2.3.4", { max: 5, windowMs: HOUR })).toEqual({
      ok: false, remaining: 0, retryAfterSeconds: 120,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to the in-memory limiter when the function is missing, and logs once", async () => {
    const { rateLimitDurable } = await load();
    // What PostgREST returns before the migration is applied.
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.rate_limit_hit" } });

    expect((await rateLimitDurable("k", { max: 2, windowMs: HOUR })).ok).toBe(true);
    expect((await rateLimitDurable("k", { max: 2, windowMs: HOUR })).ok).toBe(true);
    const blocked = await rateLimitDurable("k", { max: 2, windowMs: HOUR });
    // Still limited: the fallback really counts, it does not wave everything through.
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("falls back when the call throws", async () => {
    const { rateLimitDurable } = await load();
    rpc.mockRejectedValue(new Error("fetch failed"));
    expect((await rateLimitDurable("k", { max: 1, windowMs: HOUR })).ok).toBe(true);
    expect((await rateLimitDurable("k", { max: 1, windowMs: HOUR })).ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("falls back on a reply it does not recognise", async () => {
    const { rateLimitDurable } = await load();
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await rateLimitDurable("k", { max: 1, windowMs: HOUR })).ok).toBe(true);
    expect((await rateLimitDurable("k", { max: 1, windowMs: HOUR })).ok).toBe(false);
  });

  it("never touches the database when Supabase is not configured", async () => {
    const { rateLimitDurable } = await load();
    configured.mockReturnValue(false);
    expect((await rateLimitDurable("k", { max: 1, windowMs: HOUR })).ok).toBe(true);
    expect((await rateLimitDurable("k", { max: 1, windowMs: HOUR })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("dailyBudget", () => {
  it("keys one shared bucket per UTC day with a 24 hour window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T23:30:00Z"));
    const { dailyBudget } = await load();
    rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 39, retry_after_seconds: 0 }], error: null });
    expect((await dailyBudget("sticker-ai", 40)).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "budget:sticker-ai:2026-11-19", p_max: 40, p_window_seconds: 86400,
    });
  });
});

describe("envCap", () => {
  it("reads a positive whole number, otherwise keeps the default", async () => {
    const { envCap } = await load();
    vi.stubEnv("TEST_CAP", "12");
    expect(envCap("TEST_CAP", 40)).toBe(12);
    for (const bad of ["", "0", "-3", "1.5", "lots"]) {
      vi.stubEnv("TEST_CAP", bad);
      expect(envCap("TEST_CAP", 40)).toBe(40);
    }
  });
});
