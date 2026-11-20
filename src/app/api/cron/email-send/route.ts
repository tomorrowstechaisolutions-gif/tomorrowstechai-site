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
 * claimed. A function timeout mid-campaign therefore costs a delay, never a
 * duplicate send.
 *
 * THE BOUND IS A CLOCK, NOT A COUNT. Sends are sequential and each one is a
 * provider call plus three database writes, so "400 recipients" was never
 * going to fit in maxDuration — the function was killed mid-row instead of
 * stopping between rows. Each job now gets a wall-clock deadline and stops
 * cleanly before it; a campaign that is not finished stays 'sending' and the
 * next run resumes it. The counts below are only a ceiling.
 *
 * The two deadlines are separate on purpose: campaigns stop at 35s so that a
 * large campaign cannot spend the whole invocation and starve the sequences,
 * which then run until 50s. The last 10s is headroom for the send that is in
 * flight when the clock runs out and for the closing queries.
 */
const CAMPAIGN_WINDOW_MS = 35_000;
const SEQUENCE_WINDOW_MS = 50_000;
const CAMPAIGN_CEILING = 200;
const SEQUENCE_CEILING = 100;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  const started = Date.now();
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
    const campaigns = await runDueCampaigns(db, CAMPAIGN_CEILING, {
      deadline: started + CAMPAIGN_WINDOW_MS,
    });
    const sequences = await runDueSequenceSteps(db, SEQUENCE_CEILING, {
      deadline: started + SEQUENCE_WINDOW_MS,
    });

    return NextResponse.json({ ok: true, campaigns, sequences });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The email job failed.";
    console.error("[cron:email-send]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
