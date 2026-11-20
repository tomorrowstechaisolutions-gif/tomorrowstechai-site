import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron/run";
import { runShifts } from "@/lib/crew/shifts";
import { summarizeDue } from "@/lib/crew/summaries";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The crew's clock. Every ten minutes: carry forward any shift that was cut
 * off, then start a shift for each bot whose interval has passed. Stops at
 * fifty seconds so the request ends cleanly; whatever is unfinished waits for
 * the next tick and resumes exactly where it stopped.
 *
 * With time left over, it also writes any chat summaries that are due (a
 * finished day, week or month). A summary that fails never fails the tick.
 */
export function GET(request: Request) {
  return withCronRun("crew", request, run);
}

async function run(): Promise<Response> {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  try {
    const started = Date.now();
    const sb = supabaseAdmin();
    const result = await runShifts(sb, { deadlineAt: started + 50_000 });
    let summaries: unknown = "skipped: no time left";
    if (Date.now() - started < 30_000) {
      try {
        summaries = await summarizeDue(sb, { max: 2 });
      } catch (error) {
        summaries = `failed: ${error instanceof Error ? error.message : "unknown error"}`;
        console.error("[cron:crew] summaries:", summaries);
      }
    }
    return NextResponse.json({ ok: true, ...result, summaries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The crew cron failed.";
    console.error("[cron:crew]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
