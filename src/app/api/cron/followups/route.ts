import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { sendFollowupEmail } from "@/lib/campaign/emails";
import { CLOSED_STATUSES } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Drains the follow-up queue. Point a Vercel Cron at it hourly.
 *
 * Nothing sends until CRON_SECRET is set, so deploying this doesn't start
 * emailing anyone by accident.
 *
 * The stop rules live here, checked again at send time rather than trusted
 * from when the row was queued:
 *   · lead replied, booked, bought, or was closed  → status moved off New /
 *     Contact Attempted, so the row is skipped
 *   · lead opted out or was marked do-not-contact  → skipped
 *   · lead unsubscribed                            → skipped
 * A skipped row is marked "skipped" with the reason, never silently dropped.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

/** Statuses that mean nobody has engaged yet, so a nudge is still welcome. */
const STILL_COLD = new Set(["New", "Contact Attempted"]);

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const db = supabaseAdmin();

  const { data: due, error } = await db
    .from("lead_followups")
    .select("id, lead_id, step")
    .eq("status", "pending")
    .neq("step", "confirmation")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Follow-up queue read failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const row of due ?? []) {
    const { data: lead } = await db
      .from("leads")
      .select(
        "id, first_name, email, business_name, lead_status, do_not_contact, unsubscribed_at, email_consent"
      )
      .eq("id", row.lead_id)
      .maybeSingle();

    const stopReason = !lead
      ? "lead_missing"
      : lead.do_not_contact
        ? "do_not_contact"
        : lead.unsubscribed_at
          ? "unsubscribed"
          : !lead.email_consent
            ? "no_email_consent"
            : CLOSED_STATUSES.includes(lead.lead_status)
              ? `closed:${lead.lead_status}`
              : !STILL_COLD.has(lead.lead_status)
                ? `engaged:${lead.lead_status}`
                : null;

    if (stopReason) {
      await db
        .from("lead_followups")
        .update({ status: "skipped", error: stopReason })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    const ok = await sendFollowupEmail(row.step as "followup_24h" | "followup_72h", {
      id: lead!.id,
      firstName: lead!.first_name,
      email: lead!.email,
      businessName: lead!.business_name,
    });

    await db
      .from("lead_followups")
      .update(
        ok
          ? { status: "sent", sent_at: new Date().toISOString(), error: null }
          : { status: "failed", error: "send_failed" }
      )
      .eq("id", row.id);

    await db.from("lead_events").insert({
      lead_id: row.lead_id,
      type: ok ? "followup_sent" : "email_failed",
      body: ok
        ? `Automated ${row.step.replace("_", " ")} email sent.`
        : `Automated ${row.step.replace("_", " ")} email failed to send.`,
      actor: "system",
    });

    if (ok) sent++;
  }

  return NextResponse.json({ ok: true, considered: due?.length ?? 0, sent, skipped });
}
