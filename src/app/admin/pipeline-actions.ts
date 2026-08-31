"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { STAGE_PROBABILITY } from "@/lib/pipeline/forecast";

/**
 * Writes for the Pipeline.
 *
 * Stage history is NOT written here. A database trigger records every stage
 * change, which means a move made from a form, a script, the SQL editor or a
 * future automation all leave the same trail. History that depends on every
 * caller remembering to write it is history with holes in it.
 *
 * What this file does own: refusing to close a deal as Lost without a
 * reason, because that field is the only evidence the business will ever
 * have about why it loses.
 */
async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email };
}

function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function toCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

const PIPELINE = "/admin/pipeline";

const STAGES = ["new", "qualified", "discovery", "proposal", "negotiation", "won", "lost", "on_hold"];

/**
 * Move a deal.
 *
 * Lost requires a reason. The screen asks for one, and so does this — a
 * client dialog can be skipped, a server action cannot. Without it the
 * "what are we losing deals over" question has no answer, which is the one
 * report this data exists to produce.
 */
export async function moveDealAction(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = str(formData, "deal_id", 40);
  const stage = str(formData, "stage", 30);
  if (!id || !STAGES.includes(stage)) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { stage, last_activity_at: now };

  if (stage === "won") {
    patch.won_at = now;
    patch.lost_at = null;
    patch.lost_reason = null;
    patch.probability = 100;
  } else if (stage === "lost") {
    const reason = str(formData, "lost_reason", 200);
    if (!reason) {
      console.warn("[pipeline] lost without a reason — refused");
      return;
    }
    patch.lost_at = now;
    patch.won_at = null;
    patch.lost_reason = reason;
    patch.notes = str(formData, "lost_notes", 2000) || null;
    patch.probability = 0;
  } else {
    patch.won_at = null;
    patch.lost_at = null;
    patch.lost_reason = null;
    // Three cases, and only one of them writes a number.
    //
    //   probability is null   → nobody has judged this deal, so it follows the
    //                           stage on its own. LEAVE IT NULL. Writing the
    //                           new stage default here would pin it forever
    //                           and make every later move wrong.
    //   equals the old default → the owner never overrode it, so carry it to
    //                           the new stage's default.
    //   anything else          → a judgement. It survives the move untouched.
    const { data: current } = await supabase
      .from("deals")
      .select("probability, stage")
      .eq("id", id)
      .maybeSingle();
    const wasDefault =
      current?.probability != null &&
      current.probability === (STAGE_PROBABILITY[current.stage] ?? 20);
    if (wasDefault) patch.probability = STAGE_PROBABILITY[stage] ?? 20;
  }

  await supabase.from("deals").update(patch).eq("id", id);

  revalidatePath(PIPELINE);
  revalidatePath("/admin/crm");
  revalidatePath("/admin");
}

/** The owner's promise, not a formula. */
export async function toggleCommitAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "deal_id", 40);
  if (!id) return;

  const { data } = await supabase.from("deals").select("committed").eq("id", id).maybeSingle();
  if (!data) return;

  await supabase.from("deals").update({ committed: !data.committed }).eq("id", id);
  revalidatePath(PIPELINE);
}

export async function updateDealAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "deal_id", 40);
  if (!id) return;

  const probRaw = str(formData, "probability", 5);
  const prob = probRaw ? Math.max(0, Math.min(100, Number.parseInt(probRaw, 10) || 0)) : null;

  await supabase
    .from("deals")
    .update({
      value_cents: toCents(str(formData, "value", 20)),
      probability: prob,
      expected_close: str(formData, "expected_close", 20) || null,
      next_action: str(formData, "next_action", 300) || null,
      next_action_at: str(formData, "next_action_at", 40) || null,
      owner: str(formData, "owner", 120) || null,
    })
    .eq("id", id);

  revalidatePath(PIPELINE);
}

/** A logged touch. Keeps the "no activity in N days" rule honest. */
export async function logDealActivityAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "deal_id", 40);
  if (!id) return;

  await supabase
    .from("deals")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(PIPELINE);
}

export async function setTargetAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const amount = toCents(str(formData, "target", 20));
  if (amount === null) return;

  // Always the first of the current month, so the unique index does its job.
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  await supabase
    .from("sales_targets")
    .upsert({ period_start: periodStart, period: "month", target_cents: amount }, { onConflict: "period,period_start" });

  revalidatePath(PIPELINE);
}
