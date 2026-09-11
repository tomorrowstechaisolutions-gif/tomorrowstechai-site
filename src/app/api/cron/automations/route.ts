import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executeAutomation, nextSchedule } from "@/lib/automations/engine";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET; const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret) return false; const expected = Buffer.from(secret); const received = Buffer.from(supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * The shared clock for user-configured scheduled automations. It does not
 * replace specialized schedulers such as followups or email-send. Each due
 * definition gets a stable time-bucket event id, so overlapping cron calls
 * cannot execute the same rule twice.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const db = supabaseAdmin(); const now = new Date();
  const { data, error } = await db.from("automations").select("id,name,trigger_config,next_run_at,automation_trigger_definitions!inner(key)").eq("status", "active").eq("automation_trigger_definitions.key", "scheduled_time").lte("next_run_at", now.toISOString()).order("next_run_at").limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results: Array<{ id: string; status: string }> = [];
  for (const automation of data ?? []) {
    const dueAt = automation.next_run_at ?? now.toISOString(); const next = nextSchedule(automation.trigger_config ?? {}, new Date(dueAt));
    await db.from("automations").update({ next_run_at: next.toISOString() }).eq("id", automation.id).eq("next_run_at", dueAt);
    try {
      const result = await executeAutomation(db, { automationId: automation.id, mode: "live", triggerEventId: `schedule:${new Date(dueAt).toISOString()}`, triggerSummary: `Scheduled time reached: ${dueAt}`, context: { event: { id: dueAt }, schedule: { due_at: dueAt } }, actor: "vercel-cron" });
      results.push({ id: automation.id, status: result.status });
    } catch (runError) {
      console.error(`[automation:${automation.id}]`, runError instanceof Error ? runError.message : runError); results.push({ id: automation.id, status: "failed_to_start" });
    }
  }
  return NextResponse.json({ ok: true, considered: data?.length ?? 0, results });
}

