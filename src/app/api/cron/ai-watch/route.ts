import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runAiWatch } from "@/lib/ai/watch";

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

  try {
    const result = await runAiWatch();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI watch failed.";
    console.error("[cron:ai-watch]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
