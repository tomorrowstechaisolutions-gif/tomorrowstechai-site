import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runHealthChecks } from "@/lib/apps/checks";
import { syncApps } from "@/lib/apps/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The standing job behind the Apps module.
 *
 * It refreshes what the providers know (deployments, domains, framework)
 * and then runs the health checks, which is the only thing in the system
 * allowed to write a "healthy". Between runs, a check older than a day
 * stops counting as evidence and the category reads Unknown again — so a
 * cron that stops firing degrades to "we don't know" rather than to a stale
 * green tick.
 *
 * The sync is allowed to fail without taking the checks with it: a Vercel
 * outage should not also stop the TLS and HTTP probes, which do not need it.
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

  const sync = await syncApps().catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "App sync failed.",
  }));

  try {
    const checks = await runHealthChecks();
    return NextResponse.json({
      sync: sync.ok
        ? { linked: sync.linked, refreshed: sync.refreshed, unlinked: sync.unlinked.length }
        : { error: sync.error },
      checks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "App health checks failed.";
    console.error("[cron:app-health]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
