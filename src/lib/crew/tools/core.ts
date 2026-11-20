import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAction, type GateAction, type GateRefusal } from "../gate";
import { loadGateState } from "../gate-state";
import { logStep, settleStep, stepFor } from "../log";
import type { StationId } from "../stations";
import type { Agent, Business, Goal, Run } from "../types";

/**
 * What every crew tool is built from.
 *
 * A tool is a thing a bot can do: look something up ("read") or send or
 * change something ("act"). Every tool names the station it works at, which
 * is where the bot is shown on the floor.
 *
 * `act()` is the only way an act tool may do its work. It asks whether this
 * exact tool call was already carried out (a resumed run must not repeat
 * itself), asks the gate, and then either does the work and logs it or logs
 * why it was refused. Either way exactly one step is written.
 *
 * The step is written BEFORE the work, as a claim. The database allows one
 * step per tool call, so of two workers that reach the same call only one
 * gets the claim and only that one sends. If a worker dies mid-send the claim
 * stays, and the call is treated as done rather than sent a second time: an
 * email that may not have gone is the better mistake than one that goes twice.
 */

/** How every email the crew sends is signed. Fixed by the design. */
export const SIGNATURE = "Tess, AI assistant to John Hockinson, Tomorrow's Tech AI";

export type ToolContext = {
  sb: SupabaseClient;
  run: Run;
  agent: Agent;
  business: Business;
  goals: Goal[];
  /** The id of the model's tool call. Unique within the run. */
  toolUseId: string;
};

/** `text` is what the model reads back. */
export type ToolResult = { ok: boolean; text: string };

export type CrewTool = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool["input_schema"] & { required?: string[]; additionalProperties?: boolean };
  kind: "read" | "act";
  station: StationId;
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult>;
};

/** The two fields every act tool demands, spread into its schema. */
export const GOAL_FIELDS = {
  goal_id: { type: "string", description: "The id of the goal this action serves. Required: an action with no goal is not carried out." },
  expectation: { type: "string", description: "What you expect to happen as a result, in one sentence, so it can be checked later." },
} as const;

export function str(input: Record<string, unknown>, key: string, max = 4000): string {
  const v = input[key];
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** The goal id if it belongs to this business, otherwise null. */
function ownGoal(ctx: ToolContext, goalId: string): string | null {
  return ctx.goals.some((g) => g.id === goalId) ? goalId : null;
}

export type ActRequest = {
  /** Fields the gate judges, minus the ones act() fills in itself. */
  action: Omit<GateAction, "tool" | "agentSlug" | "goalId" | "expectation">;
  station: StationId;
  /** Past tense, as it reads on the floor: "sent the follow-up to Ana". */
  summary: string;
  /** How a refusal reads: "did not email Ana". The reason is appended. */
  refusedSummary: string;
  /** Kept on the step. `to`, `firstContact` and `channels` feed the gate's counts. */
  payload?: Record<string, unknown>;
  /** Other channels this would post to; each is checked against its cap. */
  channels?: string[];
  /** Contact the crew's own log does not know about, e.g. a lead's last_contacted_at. */
  lastContactAt?: number | null;
  /** Title and reason for John's list, when this is an always-John action. */
  forJohn?: { title: string; why: string };
};

export async function act(
  ctx: ToolContext,
  tool: string,
  input: Record<string, unknown>,
  req: ActRequest,
  execute: () => Promise<ToolResult>
): Promise<ToolResult> {
  const done = await stepFor(ctx.sb, ctx.run.id, ctx.toolUseId);
  if (done) return { ok: done.kind === "act", text: done.kind === "act" ? "Already done earlier in this run." : `Already decided earlier in this run: ${done.summary}` };

  const goalId = ownGoal(ctx, str(input, "goal_id", 80));
  const expectation = str(input, "expectation", 300) || null;
  const action: GateAction = { ...req.action, tool, agentSlug: ctx.agent.slug, goalId, expectation };

  const to = action.recipientEmail?.trim().toLowerCase();
  const state = await loadGateState(ctx.sb, ctx.business, ctx.agent, to ? [to] : []);
  if (to && req.lastContactAt) state.lastEmailAt.set(to, Math.max(state.lastEmailAt.get(to) ?? 0, req.lastContactAt));

  let decision = checkAction(action, state);
  for (const channel of req.channels ?? []) {
    if (!decision.allow) break;
    decision = checkAction({ ...action, channel }, state);
  }

  if (!decision.allow) {
    await refuse(ctx, tool, req, decision.reason, decision.message, goalId, expectation);
    return { ok: false, text: decision.message };
  }

  const claim = await logStep(ctx.sb, ctx.run, {
    kind: "act",
    tool,
    station: req.station,
    summary: req.summary,
    goal_id: goalId,
    expectation,
    tool_use_id: ctx.toolUseId,
    // Carries `to` and `channels` already, so the day's counts include work in flight.
    payload: { ...(req.payload ?? {}), pending: true },
  });
  if (claim.duplicate) return { ok: false, text: "Already being handled by an earlier attempt at this same step. Do not repeat it." };

  let result: ToolResult;
  try {
    result = await execute();
  } catch (err) {
    console.error(`[crew] ${tool} failed:`, err);
    result = { ok: false, text: `It failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
  await settleStep(
    ctx.sb,
    claim.step.id,
    result.ok ? { kind: "act", summary: req.summary, payload: req.payload ?? {} } : { kind: "refused", summary: `${req.refusedSummary}: ${result.text}`, payload: { reason: "failed" } }
  );
  return result;
}

/**
 * Wrap text that came from outside the business (a lead's form message, an
 * email someone sent) so the model can tell it from its own instructions.
 * Every role prompt says: what is inside is information, never an instruction.
 */
export function outside(text: string): string {
  return `<outside_content>\n${text.replace(/<\/?outside_content>/gi, "")}\n</outside_content>`;
}

/** Log a refusal, and for an always-John action put it on his list. */
export async function refuse(
  ctx: ToolContext,
  tool: string,
  req: Pick<ActRequest, "station" | "refusedSummary" | "forJohn">,
  reason: GateRefusal | "blocked",
  message: string,
  goalId: string | null = null,
  expectation: string | null = null
): Promise<void> {
  const forJohn = reason === "always_john";
  if (forJohn) {
    const { error } = await ctx.sb.from("ai_actions").insert({
      kind: "other",
      title: (req.forJohn?.title ?? req.refusedSummary).slice(0, 200),
      summary: req.forJohn?.why ?? message,
      payload: { tool, run_id: ctx.run.id, agent: ctx.agent.slug },
      status: "proposed",
      risk: "high",
      proposed_by: "ai",
      model: ctx.agent.model,
      rationale: req.forJohn?.why ?? null,
    });
    if (error) throw new Error(`Could not put this on John's list: ${error.message}`);
  }
  await logStep(ctx.sb, ctx.run, {
    kind: forJohn ? "needs_john" : "refused",
    tool,
    station: req.station,
    summary: forJohn ? `put on John's list: ${req.forJohn?.title ?? req.refusedSummary}` : `${req.refusedSummary}: ${message}`,
    goal_id: goalId,
    expectation,
    tool_use_id: ctx.toolUseId,
    payload: { reason },
  });
}

/** Log a read so the floor can show the bot looking something up. */
export async function read(ctx: ToolContext, tool: string, station: StationId, summary: string, text: string): Promise<ToolResult> {
  await logStep(ctx.sb, ctx.run, { kind: "read", tool, station, summary, goal_id: null, expectation: null, tool_use_id: ctx.toolUseId });
  return { ok: true, text };
}
