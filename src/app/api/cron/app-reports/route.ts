import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { pruneReports, pullAllAppReports } from "@/lib/apps/report";

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
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = Buffer.from(secret);
  const given = Buffer.from(supplied);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
