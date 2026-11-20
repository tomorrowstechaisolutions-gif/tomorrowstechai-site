import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentSlug, Business } from "./types";

/**
 * The switches only John holds: confirming a playbook (which is the one way a
 * business enters launch mode), and pausing the crew or a single bot.
 */

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

/** Put a business into launch mode. Needs a saved playbook and a target. */
export async function confirmPlaybook(sb: SupabaseClient, businessId: string): Promise<void> {
  const { data, error } = await sb.from("ai_businesses").select("*").eq("id", businessId).maybeSingle();
  if (error) fail("Could not load the business", error);
  const business = data as Business | null;
  if (!business) throw new Error("No such business.");
  if (!business.playbook?.sellsTo) throw new Error("There is no playbook to confirm yet. Ask Tess to set one up first.");

  const today = new Date().toISOString().slice(0, 10);
  const { data: goals, error: goalError } = await sb.from("ai_goals").select("id").eq("business_id", businessId).gte("period_end", today).limit(1);
  if (goalError) fail("Could not load the targets", goalError);
  if (!goals?.length) throw new Error("There is no target for this period yet. Ask Tess to set one first.");

  const { error: saveError } = await sb.from("ai_businesses").update({ mode: "launch", playbook_confirmed_at: new Date().toISOString() }).eq("id", businessId);
  if (saveError) fail("Could not confirm the playbook", saveError);
}

/** Stop or restart every bot at once. */
export async function setCrewPaused(sb: SupabaseClient, paused: boolean): Promise<void> {
  const { error } = await sb.from("ai_crew_state").update({ paused, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) fail("Could not change the crew pause", error);
}

/** Stop or restart one bot. */
export async function setAgentPaused(sb: SupabaseClient, slug: AgentSlug, paused: boolean): Promise<void> {
  const { error } = await sb.from("ai_agents").update({ paused }).eq("slug", slug);
  if (error) fail("Could not change the bot's pause", error);
}
