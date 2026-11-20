import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agent, Run, RunStatus, Step } from "./types";

/**
 * The record of what the crew does.
 *
 * A run is one piece of work by one bot. A step is one thing it did, read or
 * was refused. Tess's brief and the floor read nothing else, which is what
 * keeps them honest: if it is not a row here, it did not happen.
 *
 * A step carries the id of the tool call that produced it. That id is unique
 * within a run, so a run that is cut off and resumed can ask "did I already
 * do this?" (`stepFor`) and never carry the same action out twice.
 */

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

export async function startRun(
  sb: SupabaseClient,
  input: { agent: Agent; businessId: string | null; trigger: "shift" | "chat"; startedBy?: string | null }
): Promise<Run> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("ai_runs")
    .insert({
      agent_id: input.agent.id,
      business_id: input.businessId,
      trigger: input.trigger,
      status: "running",
      transcript: [],
      steps_taken: 0,
      cost_micro_usd: 0,
      started_by: input.startedBy ?? null,
      started_at: now,
      finished_at: null,
      error: null,
    })
    .select("*")
    .single();
  if (error || !data) fail("Could not start the run", error);

  // A shift counts from when it starts, so a bot is not started twice while
  // its first run is still going. A chat is not a shift.
  if (input.trigger === "shift") {
    const { error: stampError } = await sb.from("ai_agents").update({ last_shift_at: now }).eq("id", input.agent.id);
    if (stampError) fail("Could not stamp the shift start", stampError);
  }
  return data as Run;
}

export type NewStep = Pick<Step, "kind" | "tool" | "station" | "summary" | "goal_id" | "expectation" | "tool_use_id"> & {
  payload?: Record<string, unknown>;
};

/** The step a tool call already produced in this run, if any. */
export async function stepFor(sb: SupabaseClient, runId: string, toolUseId: string): Promise<Step | null> {
  const { data, error } = await sb.from("ai_steps").select("*").eq("run_id", runId).eq("tool_use_id", toolUseId).limit(1).maybeSingle();
  if (error) fail("Could not look up the step", error);
  return (data as Step | null) ?? null;
}

/**
 * Write one step. If this tool call already has a step in this run, nothing
 * is written and `duplicate` is true.
 */
export async function logStep(sb: SupabaseClient, run: Run, step: NewStep): Promise<{ step: Step; duplicate: boolean }> {
  if (step.tool_use_id) {
    const existing = await stepFor(sb, run.id, step.tool_use_id);
    if (existing) return { step: existing, duplicate: true };
  }

  const { data: fresh, error: runError } = await sb.from("ai_runs").select("steps_taken").eq("id", run.id).maybeSingle();
  if (runError) fail("Could not read the run", runError);
  const seq = Number(fresh?.steps_taken ?? run.steps_taken ?? 0) + 1;

  const { data, error } = await sb
    .from("ai_steps")
    .insert({
      run_id: run.id,
      agent_id: run.agent_id,
      business_id: run.business_id,
      seq,
      kind: step.kind,
      tool: step.tool,
      station: step.station,
      summary: step.summary.slice(0, 300),
      goal_id: step.goal_id,
      expectation: step.expectation,
      tool_use_id: step.tool_use_id,
      payload: step.payload ?? {},
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    // 23505: another request wrote the step for this tool call a moment ago.
    if ((error as { code?: string } | null)?.code === "23505" && step.tool_use_id) {
      const raced = await stepFor(sb, run.id, step.tool_use_id);
      if (raced) return { step: raced, duplicate: true };
    }
    fail("Could not log the step", error);
  }

  const { error: countError } = await sb.from("ai_runs").update({ steps_taken: seq }).eq("id", run.id);
  if (countError) fail("Could not count the step", countError);
  return { step: data as Step, duplicate: false };
}

export async function finishRun(sb: SupabaseClient, runId: string, status: RunStatus, error?: string): Promise<void> {
  const { error: dbError } = await sb
    .from("ai_runs")
    .update({ status, finished_at: new Date().toISOString(), error: error ? error.slice(0, 500) : null })
    .eq("id", runId);
  if (dbError) fail("Could not finish the run", dbError);
}

/** Steps written after `sinceIso`, oldest first. */
export async function loadStepsSince(sb: SupabaseClient, sinceIso: string, limit = 200): Promise<Step[]> {
  const { data, error } = await sb.from("ai_steps").select("*").gt("created_at", sinceIso).order("created_at", { ascending: true }).limit(limit);
  if (error) fail("Could not load steps", error);
  return (data ?? []) as Step[];
}
