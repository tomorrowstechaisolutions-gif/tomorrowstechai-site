import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateInsights } from "@/lib/insights/generate";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Weekly AI insights (Monday morning). Writes recommendations only; changes nothing else. */
export function GET(request: Request) {
  return withCronRun("ai-insights", request, run);
}

async function run(): Promise<Response> {
  try {
    return NextResponse.json(await generateInsights(supabaseAdmin()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI insights failed.";
    console.error("[cron:ai-insights]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
