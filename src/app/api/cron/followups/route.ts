import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { sendFollowupEmail } from "@/lib/campaign/emails";
import { offerByName } from "@/lib/campaign/offers";
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

  // The operations registry controls pause/resume after its migration lands.
  // If it is not present during a rolling deploy, the proven queue continues
  // to run; a new observability layer must never become a new failure mode.
  const registry = await db
    .from("automations")
    .select("id,key,status")
    .in("key", ["legacy_lead_followup_24h", "legacy_lead_followup_72h"]);
  const definitions = new Map((registry.data ?? []).map((row) => [row.key, row]));

  const { data: due, error } = await db
    .from("lead_followups")
    .select("id, lead_id, step, due_at")
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
    const automationKey = row.step === "followup_24h" ? "legacy_lead_followup_24h" : "legacy_lead_followup_72h";
    const definition = definitions.get(automationKey);
    if (definition && definition.status !== "active") continue;
    const runStarted = Date.now();
    const { data: lead } = await db
      .from("leads")
      .select(
        "id, first_name, email, business_name, campaign, lead_status, do_not_contact, unsubscribed_at, email_consent"
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
      await logFollowupRun(db, definition?.id, row, "skipped", stopReason, runStarted);
      skipped++;
      continue;
    }

    const ok = await sendFollowupEmail(row.step as "followup_24h" | "followup_72h", {
      id: lead!.id,
      firstName: lead!.first_name,
      email: lead!.email,
      businessName: lead!.business_name,
    }, offerByName(lead!.campaign));

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

    await logFollowupRun(db, definition?.id, row, ok ? "success" : "failed", ok ? null : "send_failed", runStarted);

    if (ok) sent++;
  }

  return NextResponse.json({ ok: true, considered: due?.length ?? 0, sent, skipped });
}

async function logFollowupRun(
  db: ReturnType<typeof supabaseAdmin>,
  automationId: string | undefined,
  row: { id: string; lead_id: string; step: string; due_at: string },
  status: "success" | "failed" | "skipped",
  error: string | null,
  started: number,
) {
  if (!automationId) return;
  try {
    const eventId = `lead_followup:${row.id}`;
    let run = await db.from("automation_runs").select("id").eq("automation_id", automationId).eq("trigger_event_id", eventId).maybeSingle();
    if (!run.data) {
      run = await db.from("automation_runs").insert({ automation_id: automationId, trigger_event_id: eventId, trigger_key: "lead_no_response", trigger_summary: `${row.step === "followup_24h" ? "24-hour" : "72-hour"} lead follow-up due`, status: "running", mode: "live", started_at: new Date(started).toISOString(), related_record_type: "lead", related_record_id: row.lead_id }).select("id").single();
    }
    if (!run.data?.id) return;
    const completed = new Date(); const duration = Math.max(0, completed.getTime() - started);
    await db.from("automation_runs").update({ status, completed_at: completed.toISOString(), duration_ms: duration, error_summary: error }).eq("id", run.data.id);
    const action = await db.from("automation_steps").select("id,name,step_order").eq("automation_id", automationId).eq("step_type", "action").order("step_order").limit(1).maybeSingle();
    if (action.data) await db.from("automation_run_steps").upsert({ run_id: run.data.id, automation_step_id: action.data.id, step_order: action.data.step_order, step_type: "action", name: action.data.name, status: status === "success" ? "success" : status === "failed" ? "failed" : "skipped", input_summary: { lead_id: row.lead_id, due_at: row.due_at }, output_summary: status === "success" ? { sent: true } : {}, error_message: error, idempotency_key: `${run.data.id}:${action.data.id}`, started_at: new Date(started).toISOString(), completed_at: completed.toISOString(), duration_ms: duration }, { onConflict: "idempotency_key" });
    await db.from("automations").update({ last_run_at: completed.toISOString(), status: status === "failed" ? "warning" : "active" }).eq("id", automationId);
    if (status === "failed") await db.from("automation_errors").insert({ automation_id: automationId, run_id: run.data.id, message: error ?? "Follow-up email failed.", error_code: "send_failed", retry_status: "not_requested", diagnostic: { lead_id: row.lead_id, followup_id: row.id } });
  } catch (logError) {
    console.error("Automation run logging failed:", logError instanceof Error ? logError.message : logError);
  }
}
