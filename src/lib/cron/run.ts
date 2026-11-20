import "server-only";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { cronAuthorized } from "./guard";
import type { CronName } from "./names";

/**
 * Wraps a cron route: checks the bearer token, runs the job, and writes one
 * row to cron_runs saying when it ran, how long it took and whether it worked
 * (migration 20261119090000_cron_runs.sql).
 *
 * The log is an observer and is built so it cannot become a failure mode:
 *
 *   · Nothing is written before the job runs, so the job starts exactly as
 *     early as it did without the wrapper.
 *   · The handler's Response is returned untouched (same body, same status).
 *     If the handler throws, the same error is thrown again after the row is
 *     written, so the route fails exactly as it did before.
 *   · The write happens once, after the job, and is given LOG_BUDGET_MS at
 *     most. A missing table (migration not applied yet), an unconfigured
 *     database or any other failure is logged to the console once per
 *     instance and otherwise ignored.
 *
 * A run counts as ok when the handler answered below 400. One consequence of
 * writing only at the end: a run killed by the platform at maxDuration leaves
 * no row at all. It shows up as a gap in the log, not as a failed row.
 */

const LOG_BUDGET_MS = 3_000;
const RETENTION_DAYS = 30;
const PRUNE_CHANCE = 0.02;
const SUMMARY_MAX_CHARS = 2_000;
const TEXT_MAX_CHARS = 500;

export type CronRunOptions = {
  /** What to answer when the token is wrong. Defaults to 401 { error: "Unauthorized" }. */
  unauthorized?: () => Response;
};

let logFailureReported = false;

function reportLogFailure(reason: string) {
  if (logFailureReported) return;
  logFailureReported = true;
  console.warn(`[cron] run log unavailable, crons carry on without it: ${reason}`);
}

const clip = (text: string, max = TEXT_MAX_CHARS) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * A short version of the handler's JSON for the summary column. Small results
 * are kept whole. Large ones keep their top-level shape: numbers, booleans
 * and short strings stay, arrays become a count, big objects become a marker.
 */
export function summarize(body: unknown): unknown {
  if (body === null || body === undefined) return null;
  let whole: string;
  try {
    whole = JSON.stringify(body);
  } catch {
    return null;
  }
  if (whole === undefined) return null;
  if (whole.length <= SUMMARY_MAX_CHARS) return body;

  if (Array.isArray(body)) return { count: body.length };
  if (typeof body === "string") return clip(body);
  if (typeof body !== "object") return body;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>).slice(0, 20)) {
    if (typeof value === "string") out[key] = clip(value, 200);
    else if (Array.isArray(value)) out[key] = { count: value.length };
    else if (value !== null && typeof value === "object") {
      const text = JSON.stringify(value);
      out[key] = text.length <= 300 ? value : "[truncated]";
    } else out[key] = value;
  }
  return out;
}

/** The handler's body as JSON, read from a copy so the real one is untouched. */
async function readJson(response: Response): Promise<unknown> {
  try {
    if (!(response.headers.get("content-type") ?? "").includes("json")) return null;
    return await response.clone().json();
  } catch {
    return null;
  }
}

type RunRow = {
  name: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  ok: boolean;
  summary: unknown;
  error: string | null;
};

async function writeRun(row: RunRow): Promise<void> {
  if (!supabaseConfigured()) {
    reportLogFailure("Supabase is not configured.");
    return;
  }
  const db = supabaseAdmin();
  const { error } = await db.from("cron_runs").insert(row);
  if (error) {
    reportLogFailure(error.message);
    return;
  }

  // Retention: about 1 run in 50 clears rows older than 30 days, so the table
  // stays small without a cron of its own.
  if (Math.random() < PRUNE_CHANCE) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const pruned = await db.from("cron_runs").delete().lt("started_at", cutoff);
    if (pruned.error) reportLogFailure(`prune: ${pruned.error.message}`);
  }
}

/** Never throws and never takes longer than LOG_BUDGET_MS. */
async function record(row: RunRow): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      writeRun(row),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          reportLogFailure(`write took longer than ${LOG_BUDGET_MS}ms.`);
          resolve();
        }, LOG_BUDGET_MS);
      }),
    ]);
  } catch (cause) {
    reportLogFailure(cause instanceof Error ? cause.message : String(cause));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withCronRun(
  name: CronName | (string & {}),
  req: Request,
  handler: () => Promise<Response> | Response,
  options: CronRunOptions = {}
): Promise<Response> {
  if (!cronAuthorized(req)) {
    return options.unauthorized
      ? options.unauthorized()
      : Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const finish = (ok: boolean, summary: unknown, error: string | null) => {
    const finished = Date.now();
    return record({
      name,
      started_at: new Date(started).toISOString(),
      finished_at: new Date(finished).toISOString(),
      duration_ms: Math.max(0, finished - started),
      ok,
      summary,
      error,
    });
  };

  let response: Response;
  try {
    response = await handler();
  } catch (cause) {
    await finish(false, null, clip(cause instanceof Error ? cause.message : String(cause)));
    throw cause;
  }

  // Everything from here is about the log, so none of it may reach the caller.
  try {
    const body = await readJson(response);
    const ok = response.status < 400;
    const said =
      body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : null;
    await finish(ok, summarize(body), ok ? null : clip(said ?? `HTTP ${response.status}`));
  } catch (cause) {
    reportLogFailure(cause instanceof Error ? cause.message : String(cause));
  }

  return response;
}
