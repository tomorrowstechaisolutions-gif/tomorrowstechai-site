import { NextResponse } from "next/server";
import { pruneReports, pullAllAppReports } from "@/lib/apps/report";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly: ask each of our own products how it is doing.
 *
 * Every product with a `report` connection is pulled in parallel, and one
 * product being down never stops another. A failed pull stores nothing, so
 * if this job stops firing the screens degrade to "stale, last pulled 5h
 * ago" rather than to numbers that quietly stopped being true.
 *
 * The response lists what happened per product. It always answers 200 once
 * authorised: a product being unreachable is a fact to report, not a failure
 * of this job, and a 500 here would only make Vercel's cron log lie about
 * which side broke.
 */
export function GET(request: Request) {
  return withCronRun("app-reports", request, run);
}

async function run(): Promise<Response> {
  const results = await pullAllAppReports();

  // Housekeeping rides along. Failing to prune is worth a log line, not a
  // failed run: the pulls above already happened.
  await pruneReports().catch((error: unknown) => {
    console.error("[cron:app-reports] prune failed:", error instanceof Error ? error.message : error);
  });

  for (const result of results) {
    if (!result.ok) console.warn(`[cron:app-reports] ${result.slug || "unknown"}: ${result.error}`);
  }

  return NextResponse.json({
    pulled: results.map((r) =>
      r.ok ? { app: r.slug, ok: true, events: r.events } : { app: r.slug, ok: false, error: r.error }
    ),
  });
}
