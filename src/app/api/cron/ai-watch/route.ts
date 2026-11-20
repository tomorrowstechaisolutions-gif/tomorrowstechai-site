import { NextResponse } from "next/server";
import { runAiWatch } from "@/lib/ai/watch";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The standing job behind AI Solutions.
 *
 * It checks each provider for real, compares recorded usage against the
 * thresholds the operator set, and opens or closes alerts accordingly.
 *
 * Between runs, a provider status older than a day stops counting as
 * evidence and the board reads Unknown again — so a cron that stops firing
 * degrades to "we don't know" rather than to a stale green tick. It never
 * pauses or shuts down a solution: that is a decision a person makes.
 */
export function GET(request: Request) {
  return withCronRun("ai-watch", request, run);
}

async function run(): Promise<Response> {
  try {
    const result = await runAiWatch();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI watch failed.";
    console.error("[cron:ai-watch]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
