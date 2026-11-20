import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dueAgents } from "./due";
import { startRun } from "./log";
import { advanceRun, type ModelCall } from "./run";
import type { Agent, Run } from "./types";

/**
 * Starts and carries forward the crew's shifts. Called by the crew cron every
 * ten minutes. Work already in progress comes first, so a shift that was cut
 * off finishes before a new one begins.
 */

export async function crewPaused(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.from("ai_crew_state").select("paused").limit(1).maybeSingle();
  if (error) throw new Error(`Could not read the crew pause: ${error.message}`);
  return Boolean(data?.paused);
}

/**
 * True when the crew's Follow-through bot is working this business's leads,
 * so the older automatic 24-hour and 72-hour follow-up emails must stand
 * down and a lead never gets both.
 */
export async function crewOwnsLeadFollowups(sb: SupabaseClient): Promise<boolean> {
  try {
    const [{ data: business }, { data: bot }, paused] = await Promise.all([
      sb.from("ai_businesses").select("mode").eq("slug", "tomorrows-tech-ai").maybeSingle(),
      sb.from("ai_agents").select("paused").eq("slug", "follow-through").maybeSingle(),
      crewPaused(sb),
    ]);
    return business?.mode === "launch" && bot !== null && !bot.paused && !paused;
  } catch {
    // The crew tables may not exist yet. The old follow-ups keep running.
    return false;
  }
}

/**
 * `call` replaces the model, for tests.
 *
 * A new shift starts only for a bot whose business is in launch mode. The
 * gate would refuse everything such a shift tried anyway; not starting it
 * means no AI spend and no noise in the log before John confirms a playbook.
 */
export async function runShifts(sb: SupabaseClient, opts: { deadlineAt: number; call?: ModelCall }): Promise<{ advanced: number; started: number }> {
  if (await crewPaused(sb)) return { advanced: 0, started: 0 };

  const [{ data: agentRows, error: agentError }, { data: runRows, error: runError }] = await Promise.all([
    sb.from("ai_agents").select("*"),
    sb.from("ai_runs").select("id, agent_id, status, trigger").in("status", ["running", "waiting", "paused_budget"]),
  ]);
  if (agentError) throw new Error(`Could not load the crew: ${agentError.message}`);
  if (runError) throw new Error(`Could not load runs: ${runError.message}`);
  const { data: bizRows, error: bizError } = await sb.from("ai_businesses").select("id, mode");
  if (bizError) throw new Error(`Could not load the businesses: ${bizError.message}`);
  const launched = new Set(((bizRows ?? []) as { id: string; mode: string }[]).filter((b) => b.mode === "launch").map((b) => b.id));
  const agents = (agentRows ?? []) as Agent[];
  const open = (runRows ?? []) as Pick<Run, "id" | "agent_id" | "status" | "trigger">[];

  let advanced = 0;
  let started = 0;

  for (const run of open.filter((r) => r.trigger === "shift")) {
    if (Date.now() >= opts.deadlineAt) return { advanced, started };
    await advanceRun(sb, run.id, { deadlineAt: opts.deadlineAt, call: opts.call });
    advanced += 1;
  }

  for (const agent of dueAgents(agents, open, Date.now())) {
    if (Date.now() >= opts.deadlineAt) break;
    if (!agent.business_id || !launched.has(agent.business_id)) continue;
    const run = await startRun(sb, { agent, businessId: agent.business_id, trigger: "shift" });
    await advanceRun(sb, run.id, { deadlineAt: opts.deadlineAt, call: opts.call });
    started += 1;
  }
  return { advanced, started };
}
