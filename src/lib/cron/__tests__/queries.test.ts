import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { loadCronHealth } from "../queries";
import { CRON_NAMES } from "../names";

type Result = { data: unknown[] | null; error: { message: string } | null };

/** A stand-in client: answers each cron's "latest run" query from a lookup. */
function client(answer: (name: string) => Result): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, name: string) => ({
          order: () => ({ limit: () => Promise.resolve(answer(name)) }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("CRON_NAMES", () => {
  it("matches the crons in vercel.json", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
    const fromConfig = config.crons.map((c) => c.path.replace("/api/cron/", ""));
    expect([...CRON_NAMES].sort()).toEqual(fromConfig.sort());
  });
});

describe("loadCronHealth", () => {
  it("returns the last run per cron, and null where there is none", async () => {
    const health = await loadCronHealth(
      client((name) =>
        name === "email-send"
          ? { data: [{ started_at: "2026-11-19T12:00:00Z", ok: false, duration_ms: 812, error: "boom" }], error: null }
          : name === "followups"
            ? { data: [{ started_at: "2026-11-19T11:00:00Z", ok: true, duration_ms: 40, error: null }], error: null }
            : { data: [], error: null }
      )
    );

    expect(health.available).toBe(true);
    expect(health.crons.map((c) => c.name)).toEqual([...CRON_NAMES]);
    expect(health.crons.find((c) => c.name === "email-send")?.lastRun).toEqual({
      startedAt: "2026-11-19T12:00:00Z",
      ok: false,
      durationMs: 812,
      error: "boom",
    });
    expect(health.crons.find((c) => c.name === "followups")?.lastRun?.ok).toBe(true);
    expect(health.crons.find((c) => c.name === "bank-sync")?.lastRun).toBeNull();
  });

  it("reports unavailable when the table is absent", async () => {
    const health = await loadCronHealth(
      client(() => ({ data: null, error: { message: 'relation "public.cron_runs" does not exist' } }))
    );
    expect(health.available).toBe(false);
    expect(health.crons.every((c) => c.lastRun === null)).toBe(true);
  });

  it("reports unavailable instead of throwing when the client throws", async () => {
    const broken = {
      from: () => {
        throw new Error("no client");
      },
    } as unknown as SupabaseClient;
    await expect(loadCronHealth(broken)).resolves.toMatchObject({ available: false });
  });
});
