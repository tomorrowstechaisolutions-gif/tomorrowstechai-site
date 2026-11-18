import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateInsights } from "@/lib/insights/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Weekly AI insights (Monday morning). Writes recommendations only; changes nothing else. */
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
    return NextResponse.json(await generateInsights(supabaseAdmin()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI insights failed.";
    console.error("[cron:ai-insights]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
