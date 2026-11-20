import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The real admin module builds a Supabase client. Here it is a recorder.
const insert = vi.fn();
const lt = vi.fn();
const configured = vi.fn(() => true);

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => insert(table, row),
      delete: () => ({ lt: (column: string, value: string) => lt(table, column, value) }),
    }),
  }),
  supabaseConfigured: () => configured(),
}));

const SECRET = "s3cret-value-for-tests";

const req = (token: string | null = SECRET) =>
  new Request("https://example.test/api/cron/x", {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });

/** A fresh copy of the module, so the "log once" flag resets. */
async function load() {
  vi.resetModules();
  return import("../run");
}

type Row = {
  name: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  ok: boolean;
  summary: unknown;
  error: string | null;
};
const loggedRow = () => insert.mock.calls[0][1] as Row;

let warn: ReturnType<typeof vi.spyOn>;
let random: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  lt.mockReset();
  lt.mockResolvedValue({ error: null });
  configured.mockReset();
  configured.mockReturnValue(true);
  vi.stubEnv("CRON_SECRET", SECRET);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  // Above the prune chance unless a test says otherwise.
  random = vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  warn.mockRestore();
  random.mockRestore();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("withCronRun", () => {
  it("answers 401 without running the handler or logging when the token is wrong", async () => {
    const { withCronRun } = await load();
    const handler = vi.fn(async () => Response.json({ ok: true }));

    const res = await withCronRun("followups", req("wrong"), handler);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(handler).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers 401 when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { withCronRun } = await load();
    const handler = vi.fn(async () => Response.json({ ok: true }));

    const res = await withCronRun("followups", req(), handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses the route's own 401 when one is given", async () => {
    const { withCronRun } = await load();
    const res = await withCronRun("pipeline-snapshot", req(null), async () => Response.json({}), {
      unauthorized: () => Response.json({ error: "Not authorised." }, { status: 401 }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authorised." });
  });

  it("records an ok row and returns the handler's response unchanged", async () => {
    const { withCronRun } = await load();
    const original = Response.json({ ok: true, considered: 3, sent: 2, skipped: 1 });

    const res = await withCronRun("followups", req(), async () => original);

    expect(res).toBe(original);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, considered: 3, sent: 2, skipped: 1 });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toBe("cron_runs");
    const row = loggedRow();
    expect(row.name).toBe("followups");
    expect(row.ok).toBe(true);
    expect(row.error).toBeNull();
    expect(row.summary).toEqual({ ok: true, considered: 3, sent: 2, skipped: 1 });
    expect(row.duration_ms).toBeGreaterThanOrEqual(0);
    expect(Date.parse(row.finished_at)).toBeGreaterThanOrEqual(Date.parse(row.started_at));
  });

  it("records a failure row for an error response and still returns it unchanged", async () => {
    const { withCronRun } = await load();
    const original = Response.json({ error: "Bank sync failed." }, { status: 500 });

    const res = await withCronRun("bank-sync", req(), async () => original);

    expect(res).toBe(original);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Bank sync failed." });
    const row = loggedRow();
    expect(row.ok).toBe(false);
    expect(row.error).toBe("Bank sync failed.");
    expect(row.summary).toEqual({ error: "Bank sync failed." });
  });

  it("falls back to the status code when a failed response names no error", async () => {
    const { withCronRun } = await load();
    await withCronRun("followups", req(), async () => Response.json({ ok: false }, { status: 500 }));
    expect(loggedRow().ok).toBe(false);
    expect(loggedRow().error).toBe("HTTP 500");
  });

  it("records a failure row when the handler throws, then throws the same error", async () => {
    const { withCronRun } = await load();
    const boom = new Error("provider exploded");

    await expect(
      withCronRun("partner-sync", req(), async () => {
        throw boom;
      })
    ).rejects.toBe(boom);

    const row = loggedRow();
    expect(row.name).toBe("partner-sync");
    expect(row.ok).toBe(false);
    expect(row.error).toBe("provider exploded");
    expect(row.summary).toBeNull();
  });

  it("still returns the handler's response when the insert throws", async () => {
    insert.mockRejectedValue(new Error("network down"));
    const { withCronRun } = await load();
    const original = Response.json({ ok: true });

    const res = await withCronRun("email-send", req(), async () => original);

    expect(res).toBe(original);
    expect(await res.json()).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("still throws the handler's own error when the insert also throws", async () => {
    insert.mockRejectedValue(new Error("network down"));
    const { withCronRun } = await load();
    const boom = new Error("provider exploded");
    await expect(
      withCronRun("email-send", req(), async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
  });

  it("carries on when the table does not exist, and says so only once", async () => {
    insert.mockResolvedValue({ error: { message: 'relation "public.cron_runs" does not exist' } });
    const { withCronRun } = await load();

    const first = await withCronRun("email-send", req(), async () => Response.json({ n: 1 }));
    const second = await withCronRun("email-send", req(), async () => Response.json({ n: 2 }));

    expect(await first.json()).toEqual({ n: 1 });
    expect(await second.json()).toEqual({ n: 2 });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("skips the log when Supabase is not configured", async () => {
    configured.mockReturnValue(false);
    const { withCronRun } = await load();
    const res = await withCronRun("bank-sync", req(), async () => Response.json({ skipped: "x" }));
    expect(await res.json()).toEqual({ skipped: "x" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not wait on a log write that hangs", async () => {
    vi.useFakeTimers();
    insert.mockReturnValue(new Promise(() => {}));
    const { withCronRun } = await load();
    const original = Response.json({ ok: true });

    const pending = withCronRun("email-send", req(), async () => original);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(await pending).toBe(original);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not write anything before the handler runs", async () => {
    const { withCronRun } = await load();
    let insertsAtStart = -1;
    await withCronRun("followups", req(), async () => {
      insertsAtStart = insert.mock.calls.length;
      return Response.json({ ok: true });
    });
    expect(insertsAtStart).toBe(0);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("prunes rows older than 30 days on the occasional run only", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
    const { withCronRun } = await load();

    await withCronRun("followups", req(), async () => Response.json({ ok: true }));
    expect(lt).not.toHaveBeenCalled();

    random.mockReturnValue(0.001);
    await withCronRun("followups", req(), async () => Response.json({ ok: true }));
    expect(lt).toHaveBeenCalledTimes(1);
    expect(lt).toHaveBeenCalledWith("cron_runs", "started_at", "2026-10-20T12:00:00.000Z");
  });

  it("handles a response that is not JSON", async () => {
    const { withCronRun } = await load();
    const res = await withCronRun("followups", req(), async () => new Response("plain", { status: 200 }));
    expect(await res.text()).toBe("plain");
    expect(loggedRow().ok).toBe(true);
    expect(loggedRow().summary).toBeNull();
  });
});

describe("summarize", () => {
  it("keeps small results whole", async () => {
    const { summarize } = await load();
    expect(summarize({ ok: true, results: [{ id: "a", status: "success" }] })).toEqual({
      ok: true,
      results: [{ id: "a", status: "success" }],
    });
  });

  it("reduces large results to their top-level shape", async () => {
    const { summarize } = await load();
    const big = {
      ok: true,
      considered: 500,
      note: "n".repeat(900),
      results: Array.from({ length: 500 }, (_, i) => ({ id: `row-${i}`, status: "success" })),
      nested: { text: "t".repeat(900) },
    };
    expect(summarize(big)).toEqual({
      ok: true,
      considered: 500,
      note: `${"n".repeat(199)}…`,
      results: { count: 500 },
      nested: "[truncated]",
    });
  });
});
