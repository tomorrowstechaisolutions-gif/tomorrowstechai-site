import { crewOwnsLeadFollowups } from "@/lib/crew/shifts";
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { sendFollowupEmail } from "@/lib/campaign/emails";
import { offerByName } from "@/lib/campaign/offers";
import { CLOSED_STATUSES } from "@/lib/supabase/types";
import { loadSuppression } from "@/lib/email-marketing/suppression";
import { normalizeEmail } from "@/lib/email-marketing/types";
import { withCronRun } from "@/lib/cron/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
 *   · the ADDRESS is on the global suppression list → skipped. The lead
 *     columns above only know about this lead row; the same person can have
 *     unsubscribed, bounced or complained as a customer or through a
 *     campaign, and email_suppressions is where that is recorded.
 * A skipped row is marked "skipped" with the reason, never silently dropped.
 *
 * EVERY ROW IS CLAIMED BEFORE IT IS SENT. Two invocations can overlap (a
 * retry, a manual hit, a run that went long) and both would read the same
 * pending rows, so reading 'pending' is not permission to send. The claim is
 * a compare-and-set that moves the row out of 'pending' and asks the
 * database to hand it back; no row back means another run owns it.
 *
 * lead_followups has no in-flight status, so the claim parks the row as
 * 'failed' with the error CLAIMED until the outcome overwrites it a moment
 * later. That is deliberate: if this function dies mid-row, what is left
 * behind is a follow-up that honestly says it did not complete — it shows in
 * the failed-follow-ups alert and is never sent a second time — rather than
 * a 'pending' row that would be mailed again without anyone knowing whether
 * the first one went out.
 */
const CLAIMED = "claimed_not_completed";

/** Stop starting new rows here; what is left stays 'pending' for the next run. */
const RUN_WINDOW_MS = 45_000;

/** Statuses that mean nobody has engaged yet, so a nudge is still welcome. */
const STILL_COLD = new Set(["New", "Contact Attempted"]);

export function GET(req: Request) {
  return withCronRun("followups", req, run);
}

async function run(): Promise<Response> {
  const deadline = Date.now() + RUN_WINDOW_MS;
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

  // The global suppression list, read once for every address in this batch
  // rather than once per row. It fails CLOSED: if the list cannot be read,
  // nothing is sent and every row stays 'pending' for the next run, because
  // mailing somebody who unsubscribed is the one mistake that cannot be
  // taken back.
  let blocked = new Map<string, string>();
  const leadIds = [...new Set((due ?? []).map((row) => row.lead_id as string))];
  if (leadIds.length > 0) {
    try {
      const { data: addresses, error: addressError } = await db
        .from("leads")
        .select("email")
        .in("id", leadIds);
      if (addressError) throw new Error(addressError.message);
      const emails = (addresses ?? []).map((l) => l.email as string | null).filter((e): e is string => Boolean(e));
      blocked = (await loadSuppression(db, emails)).blocked;
    } catch (cause) {
      console.error("Follow-up suppression check failed:", cause instanceof Error ? cause.message : cause);
      return NextResponse.json({ ok: false, error: "suppression_unavailable" }, { status: 500 });
    }
  }

  let sent = 0;
  let skipped = 0;

  // When the AI crew's Follow-through bot is working these leads, the
  // automatic follow-ups stand down so nobody gets both. The rows are
  // cancelled with the reason, not left pending to fire later.
  const crewOwns = await crewOwnsLeadFollowups(db);

  for (const row of due ?? []) {
    if (Date.now() >= deadline) break;
    if (crewOwns) {
      await db.from("lead_followups").update({ status: "cancelled", error: "crew:follow-through" }).eq("id", row.id).eq("status", "pending");
      skipped += 1;
      continue;
    }
    const automationKey = row.step === "followup_24h" ? "legacy_lead_followup_24h" : "legacy_lead_followup_72h";
    const definition = definitions.get(automationKey);
    // Before the claim: a paused automation leaves its rows exactly as they are.
    if (definition && definition.status !== "active") continue;

    const { data: claimed, error: claimError } = await db
      .from("lead_followups")
      .update({ status: "failed", error: CLAIMED })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (claimError || !claimed || claimed.length === 0) continue;

    const runStarted = Date.now();
    const { data: lead } = await db
      .from("leads")
      .select(
        "id, first_name, email, business_name, campaign, lead_status, do_not_contact, unsubscribed_at, email_consent"
      )
      .eq("id", row.lead_id)
      .maybeSingle();

    // Looked up by address, not by lead id — that is the whole point of the list.
    const suppressedAs = lead?.email ? blocked.get(normalizeEmail(lead.email)) : undefined;

    const stopReason = !lead
      ? "lead_missing"
      : lead.do_not_contact
        ? "do_not_contact"
        : lead.unsubscribed_at
          ? "unsubscribed"
          : !lead.email_consent
            ? "no_email_consent"
            : suppressedAs
              ? `suppressed:${suppressedAs}`
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
