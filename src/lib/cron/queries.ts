import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CRON_NAMES, type CronName } from "./names";

export type CronLastRun = {
  name: CronName;
  /** Null when this cron has no row yet (never ran since the log existed, or pruned). */
  lastRun: {
    startedAt: string;
    ok: boolean;
    durationMs: number | null;
    error: string | null;
  } | null;
};

export type CronHealth = {
  /** False when cron_runs could not be read at all, e.g. the migration is not applied. */
  available: boolean;
  crons: CronLastRun[];
};

type Row = { started_at: string; ok: boolean; duration_ms: number | null; error: string | null };

/**
 * The latest logged run of every cron in vercel.json. One small indexed query
 * per cron (name, started_at desc, limit 1) rather than one big scan, because
 * a five-minute cron would otherwise push a weekly one out of any row limit.
 * Never throws: an unreadable table reports available: false.
 */
export async function loadCronHealth(sb: SupabaseClient): Promise<CronHealth> {
  try {
    const results = await Promise.all(
      CRON_NAMES.map((name) =>
        sb
          .from("cron_runs")
          .select("started_at, ok, duration_ms, error")
          .eq("name", name)
          .order("started_at", { ascending: false })
          .limit(1)
          .then((r) => ({ name, row: ((r.data ?? [])[0] as Row | undefined) ?? null, failed: Boolean(r.error) }))
      )
    );

    if (results.some((r) => r.failed)) {
      return { available: false, crons: CRON_NAMES.map((name) => ({ name, lastRun: null })) };
    }

    return {
      available: true,
      crons: results.map(({ name, row }) => ({
        name,
        lastRun: row
          ? { startedAt: row.started_at, ok: row.ok, durationMs: row.duration_ms, error: row.error }
          : null,
      })),
    };
  } catch {
    return { available: false, crons: CRON_NAMES.map((name) => ({ name, lastRun: null })) };
  }
}
