import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron/run";
import { runShifts } from "@/lib/crew/shifts";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The crew's clock. Every ten minutes: carry forward any shift that was cut
 * off, then start a shift for each bot whose interval has passed. Stops at
 * fifty seconds so the request ends cleanly; whatever is unfinished waits for
 * the next tick and resumes exactly where it stopped.
 */
export function GET(request: Request) {
  return withCronRun("crew", request, run);
}

async function run(): Promise<Response> {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  try {
    const result = await runShifts(supabaseAdmin(), { deadlineAt: Date.now() + 50_000 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The crew cron failed.";
    console.error("[cron:crew]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
