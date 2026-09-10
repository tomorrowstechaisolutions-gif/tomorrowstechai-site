import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { runDueCampaigns, runDueSequenceSteps } from "@/lib/email-marketing/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The clock behind scheduled campaigns and sequences.
 *
 * Same shape and same auth as the existing crons (followups, social-publish,
 * app-health): a CRON_SECRET bearer token, compared in constant time. Without
 * the secret set, nothing runs — which is the safe direction to fail in for a
 * job whose whole purpose is sending mail to other people.
 *
 * Both jobs are bounded per invocation and resume exactly where they stopped,
 * because the recipient list is frozen and each row leaves 'pending' as it is
 * sent. A function timeout mid-campaign therefore costs a delay, never a
 * duplicate send.
 */

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }
  if (!process.env.RESEND_API_KEY) {
    // Not an error: nothing is broken, the provider simply is not connected.
    // Returning 200 keeps the cron from alerting every hour about a
    // deliberate configuration state.
    return NextResponse.json({ ok: true, skipped: "No email provider is configured." });
  }

  const db = supabaseAdmin();

  try {
    // Campaigns first. A scheduled campaign has a time somebody chose and a
    // person waiting on it; a sequence step is relative and tolerates a lag.
    const campaigns = await runDueCampaigns(db, 400);
    const sequences = await runDueSequenceSteps(db, 100);

    return NextResponse.json({ ok: true, campaigns, sequences });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The email job failed.";
    console.error("[cron:email-send]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
