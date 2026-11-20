import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, effort } from "@/lib/ai/claude";
import { recordAiUsageAsync } from "@/lib/ai/record";
import { chicagoDate } from "@/lib/time/chicago";
import { cacheMarked } from "./cache";
import { spendCentsToday } from "./gate-state";
import { finishRun } from "./log";
import { costMicroUsd, CREW_EFFORT, TESS_EFFORT } from "./models";
import { ROLE, systemFor } from "./roles";
import { toolsFor, type CrewTool, type ToolContext } from "./tools";
import type { Agent, Business, Goal, Rule, Run, RunStatus } from "./types";

/**
 * The engine: one bot's piece of work, as a conversation with the model.
 *
 * The model is given the bot's role and its tools. It asks for a tool, the
 * tool runs, the result goes back, and so on until the bot is done. That loop
 * can take minutes, and a server request here lasts about one. So the loop is
 * resumable: the whole conversation is saved after every turn, and each call
 * to `advanceRun` carries it forward until a deadline, then stops as
 * "waiting" for the next tick.
 *
 * Two rules make that safe:
 *   - the transcript is append-only. Earlier turns are never edited, and the
 *     model's replies go back exactly as they came, thinking blocks included;
 *   - an action is never repeated. If a tick dies after a tool ran but before
 *     its result was saved, the next tick runs the tool call again, and the
 *     tool sees from the step log that it already happened;
 *   - the instructions and the tool definitions are frozen when the run makes
 *     its first call, and replayed word for word after that. The model's
 *     reasoning is tied to everything that came before it, so rebuilding them
 *     mid-conversation (a deploy, a new rule, a saved playbook) makes it
 *     refuse its own history. What changes during a conversation reaches the
 *     model through tool results and new messages, never by editing these;
 *   - one worker at a time. A worker takes a short lease on the run before it
 *     touches it. A second cron tick, or a chat arriving mid-shift, finds the
 *     lease taken and steps aside. A lease left by a worker that died expires.
 */

export type ModelCall = (req: {
  model: string;
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  /** This conversation's earlier reasoning can no longer be read back; have the API drop it instead of refusing. */
  dropThinking?: boolean;
}) => Promise<Anthropic.Message>;

/** What a run froze at its first model call. */
type Frame = { system: Anthropic.TextBlockParam[]; tools: Anthropic.Tool[]; dropThinking?: boolean };

function isFrame(value: unknown): value is Frame {
  const f = value as Frame | null;
  return Boolean(f) && typeof f === "object" && Array.isArray(f!.system) && f!.system.length > 0 && Array.isArray(f!.tools);
}

/** True for the API's refusal of reasoning that was made under different instructions or tools. */
export function isStaleThinking(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  return message.includes("thinking") && message.includes("bound to a different conversation");
}

const THINKING_BINDING_BETA = "thinking-binding-controls-2026-08-01";

/**
 * The extra request settings for a conversation whose earlier reasoning must
 * be dropped: the API then skips the blocks it cannot verify instead of
 * answering 400. Spread `body` into the request and pass `options` as the
 * second argument. Both are empty when nothing needs dropping.
 */
export function thinkingSettings(dropThinking: boolean | undefined): { body: { thinking?: Anthropic.ThinkingConfigParam }; options: { headers?: Record<string, string> } } {
  if (!dropThinking) return { body: {}, options: {} };
  return {
    body: { thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } } as unknown as Anthropic.ThinkingConfigParam },
    options: { headers: { "anthropic-beta": THINKING_BINDING_BETA } },
  };
}

export type RunEvent = { type: "text"; text: string } | { type: "tool"; tool: string };

export const MAX_STEPS_PER_RUN = 24;

/** Longer than any one request can run, so a live worker never loses its lease. */
const LEASE_MS = 90_000;

const TERMINAL: RunStatus[] = ["done", "failed", "stopped"];

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

function defaultCall(slug: Agent["slug"]): ModelCall {
  return (req) => {
    const settings = thinkingSettings(req.dropThinking);
    return anthropic().messages.create(
      {
        model: req.model,
        max_tokens: 16000,
        system: req.system,
        tools: req.tools,
        messages: req.messages,
        ...effort(slug === "tess" ? TESS_EFFORT : CREW_EFFORT),
        ...settings.body,
      },
      settings.options
    );
  };
}

/** Why an input is not acceptable for a tool, or null when it is. */
export function inputProblem(tool: CrewTool, input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "The input must be an object.";
  const given = input as Record<string, unknown>;
  const props = (tool.input_schema.properties ?? {}) as Record<string, { type?: string; enum?: unknown[] }>;
  for (const key of tool.input_schema.required ?? []) {
    const v = given[key];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return `Missing required field: ${key}.`;
  }
  for (const [key, value] of Object.entries(given)) {
    const spec = props[key];
    if (!spec) {
      if (tool.input_schema.additionalProperties === false) return `Unknown field: ${key}.`;
      continue;
    }
    if (spec.type === "string" && typeof value !== "string") return `Field ${key} must be text.`;
    if (spec.enum && !spec.enum.includes(value)) return `Field ${key} must be one of: ${spec.enum.join(", ")}.`;
  }
  return null;
}

async function runTool(base: Omit<ToolContext, "toolUseId">, allowed: Map<string, CrewTool>, block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  const error = (content: string): Anthropic.ToolResultBlockParam => ({ type: "tool_result", tool_use_id: block.id, content, is_error: true });
  const tool = allowed.get(block.name);
  if (!tool) return error(`There is no tool called ${block.name} available to you.`);
  const problem = inputProblem(tool, block.input);
  if (problem) return error(problem);
  try {
    const result = await tool.run({ ...base, toolUseId: block.id }, block.input as Record<string, unknown>);
    return { type: "tool_result", tool_use_id: block.id, content: result.text, ...(result.ok ? {} : { is_error: true }) };
  } catch (err) {
    console.error(`[crew] tool ${block.name} threw:`, err);
    return error(`The tool failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

function toolUses(message: Anthropic.MessageParam | undefined): Anthropic.ToolUseBlock[] {
  if (!message || message.role !== "assistant" || typeof message.content === "string") return [];
  return message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
}

type AdvanceOptions = { deadlineAt: number; call?: ModelCall; onEvent?: (event: RunEvent) => void; maxModelCalls?: number };
export type AdvanceResult = { status: RunStatus; stepsThisTick: number; /** Another worker holds this run; nothing was done. */ busy?: boolean };

/** Take the run for this worker. False when another worker has it. */
async function takeLease(sb: SupabaseClient, runId: string): Promise<boolean> {
  const now = Date.now();
  const until = new Date(now + LEASE_MS).toISOString();
  const free = await sb.from("ai_runs").update({ locked_until: until }).eq("id", runId).is("locked_until", null).select("id");
  if (free.error) fail("Could not take the run", free.error);
  if (free.data?.length) return true;
  const stale = await sb.from("ai_runs").update({ locked_until: until }).eq("id", runId).lt("locked_until", new Date(now).toISOString()).select("id");
  if (stale.error) fail("Could not take the run", stale.error);
  return Boolean(stale.data?.length);
}

export async function advanceRun(sb: SupabaseClient, runId: string, opts: AdvanceOptions): Promise<AdvanceResult> {
  if (!(await takeLease(sb, runId))) {
    const { data, error } = await sb.from("ai_runs").select("status").eq("id", runId).maybeSingle();
    if (error) fail("Could not load the run", error);
    if (!data) throw new Error("No such run.");
    return { status: data.status as RunStatus, stepsThisTick: 0, busy: true };
  }
  try {
    return await advance(sb, runId, opts);
  } finally {
    const { error } = await sb.from("ai_runs").update({ locked_until: null }).eq("id", runId);
    if (error) console.error("[crew] could not release the run:", error.message);
  }
}

async function advance(sb: SupabaseClient, runId: string, opts: AdvanceOptions): Promise<AdvanceResult> {
  const { data: runRow, error: runError } = await sb.from("ai_runs").select("*").eq("id", runId).maybeSingle();
  if (runError) fail("Could not load the run", runError);
  if (!runRow) throw new Error("No such run.");
  const run = runRow as Run;
  if (TERMINAL.includes(run.status)) return { status: run.status, stepsThisTick: 0 };

  const [{ data: agentRow }, { data: rulesRows }] = await Promise.all([
    sb.from("ai_agents").select("*").eq("id", run.agent_id).maybeSingle(),
    sb.from("ai_rules").select("*").eq("active", true),
  ]);
  const agent = agentRow as Agent | null;
  if (!agent) throw new Error("The run's bot no longer exists.");
  const { data: bizRow } = run.business_id ? await sb.from("ai_businesses").select("*").eq("id", run.business_id).maybeSingle() : { data: null };
  const business = bizRow as Business | null;
  if (!business) throw new Error("The run's business no longer exists.");
  // Goals run on the business's calendar, not UTC's.
  const today = chicagoDate();
  const { data: goalRows } = await sb.from("ai_goals").select("*").eq("business_id", business.id).gte("period_end", today);
  const goals = (goalRows ?? []) as Goal[];

  const tools = toolsFor(agent.slug);
  const allowed = new Map(tools.map((t) => [t.name, t]));
  const apiTools: Anthropic.Tool[] = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const call = opts.call ?? defaultCall(agent.slug);

  // Frozen at the first call and replayed after that. Saving it is best effort:
  // without the column the run still works, it just is not protected.
  const saveFrame = async (next: Frame) => {
    const { error } = await sb.from("ai_runs").update({ frame: next }).eq("id", runId);
    if (error) console.error("[crew] could not save the run's frame:", error.message);
  };
  let frame: Frame;
  if (isFrame(run.frame)) {
    frame = run.frame;
  } else {
    frame = { system: systemFor(agent, business, goals, (rulesRows ?? []) as Rule[]), tools: apiTools };
    await saveFrame(frame);
  }
  const base = { sb, run, agent, business, goals };

  const messages = [...((run.transcript ?? []) as Anthropic.MessageParam[])];
  let cost = Number(run.cost_micro_usd ?? 0);
  const startSteps = Number(run.steps_taken ?? 0);
  let modelCalls = 0;

  const save = async (status: RunStatus) => {
    const { error } = await sb.from("ai_runs").update({ transcript: messages, cost_micro_usd: cost, status }).eq("id", runId);
    if (error) fail("Could not save the run", error);
  };
  const stepsNow = async () => {
    const { data } = await sb.from("ai_runs").select("steps_taken").eq("id", runId).maybeSingle();
    return Number(data?.steps_taken ?? startSteps);
  };
  const end = async (status: RunStatus, error?: string) => {
    await save(status);
    if (TERMINAL.includes(status) || status === "paused_budget") await finishRun(sb, runId, status, error);
    return { status, stepsThisTick: (await stepsNow()) - startSteps };
  };

  if (messages.length === 0) messages.push({ role: "user", content: ROLE[agent.slug].firstMessage });

  for (;;) {
    const last = messages[messages.length - 1];

    // The model asked for tools and the results are not in the transcript
    // yet: run them. This is also where a tick that died mid-tool picks up.
    const pending = toolUses(last);
    if (pending.length) {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of pending) {
        opts.onEvent?.({ type: "tool", tool: block.name });
        results.push(await runTool(base, allowed, block));
      }
      // Every result in one message, or the model learns to stop calling tools together.
      messages.push({ role: "user", content: results });
      await save("running");
      continue;
    }

    // The model had the last word and asked for nothing: it is finished.
    if (last.role === "assistant") return end("done");

    // About to call the model. Check everything that should stop us first.
    if (Date.now() >= opts.deadlineAt || (opts.maxModelCalls !== undefined && modelCalls >= opts.maxModelCalls)) return end("waiting");
    if ((await stepsNow()) >= MAX_STEPS_PER_RUN) return end("stopped", `Stopped after ${MAX_STEPS_PER_RUN} steps.`);
    if ((await spendCentsToday(sb)) >= business.caps.spendCentsPerDay) return end("paused_budget", "Today's AI spending limit was reached.");

    const started = Date.now();
    let response: Anthropic.Message;
    try {
      response = await call({ model: agent.model, system: frame.system, tools: frame.tools, messages: cacheMarked(messages), dropThinking: frame.dropThinking });
    } catch (err) {
      // A conversation from before its instructions were frozen, whose earlier reasoning the API now refuses.
      // Ask once more with that reasoning dropped, and remember the choice so every later call does the same.
      if (frame.dropThinking || !isStaleThinking(err)) throw err;
      console.error("[crew] the model refused this run's earlier reasoning; dropping it from here on:", runId);
      frame = { ...frame, dropThinking: true };
      await saveFrame(frame);
      response = await call({ model: agent.model, system: frame.system, tools: frame.tools, messages: cacheMarked(messages), dropThinking: true });
    }
    modelCalls += 1;
    const spent = costMicroUsd(agent.model, response.usage);
    cost += spent;
    const { error: spendError } = await sb.from("ai_spend").insert({ run_id: runId, agent_id: agent.id, micro_usd: spent, created_at: new Date().toISOString() });
    if (spendError) console.error("[crew] spend not recorded:", spendError.message);
    recordAiUsageAsync({
      slug: `crew-${agent.slug}`,
      model: agent.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs: Date.now() - started,
      eventType: "run",
      source: "internal",
      requestRef: runId,
    });

    // Appended exactly as it came. Never edited afterwards.
    messages.push({ role: "assistant", content: response.content });
    await save("running");

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) opts.onEvent?.({ type: "text", text: block.text });
    }

    if (response.stop_reason === "refusal") {
      const category = (response as { stop_details?: { category?: string | null } | null }).stop_details?.category ?? "unspecified";
      return end("failed", `The model declined to continue (${category}).`);
    }
    if (response.stop_reason === "max_tokens") return end("failed", "The model ran out of room mid-reply.");
    // tool_use, end_turn and pause_turn are all handled at the top of the loop.
  }
}
