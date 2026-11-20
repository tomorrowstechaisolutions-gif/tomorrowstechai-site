import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startRun } from "./log";
import { ROLE } from "./roles";
import type { Agent, Run } from "./types";

/**
 * John's conversation with Tess.
 *
 * A conversation is one `chat` run. Each thing John says is appended to that
 * run's transcript and the engine carries it forward, so Tess remembers the
 * sitting. The brief goes in once, ahead of the first message; later turns
 * add only what John said, which keeps everything before them cached.
 *
 * A new conversation starts when the last one is from an earlier sitting,
 * ended badly, or is close to the engine's step limit.
 */

const CONVERSATION_MS = 12 * 3_600_000;
/** Leave room under the engine's 24-step limit for this turn's tool calls. */
const STEP_HEADROOM = 18;
const REUSABLE = ["running", "waiting", "done", "paused_budget"];
const BRIEF_OPEN = "<brief>";

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

function hasOpenToolCall(transcript: Anthropic.MessageParam[]): boolean {
  const last = transcript[transcript.length - 1];
  return Boolean(last && last.role === "assistant" && typeof last.content !== "string" && last.content.some((b) => b.type === "tool_use"));
}

/** The conversation this admin can carry on, if there is one. */
async function currentRun(sb: SupabaseClient, userId: string, now: number): Promise<Run | null> {
  const { data, error } = await sb
    .from("ai_runs")
    .select("*")
    .eq("trigger", "chat")
    .eq("started_by", userId)
    .gte("started_at", new Date(now - CONVERSATION_MS).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("Could not load the conversation", error);
  const run = data as Run | null;
  if (!run || !REUSABLE.includes(run.status)) return null;
  if (Number(run.steps_taken ?? 0) > STEP_HEADROOM) return null;
  if (hasOpenToolCall((run.transcript ?? []) as Anthropic.MessageParam[])) return null;
  return run;
}

/**
 * Add what John said to his conversation and return the run to advance.
 * `brief` is only called when a new conversation starts.
 */
export async function openChatTurn(
  sb: SupabaseClient,
  input: { userId: string; message: string; brief: () => Promise<string>; now?: number }
): Promise<string> {
  const now = input.now ?? Date.now();
  const said = input.message.trim().slice(0, 4000) || ROLE.tess.firstMessage;
  const existing = await currentRun(sb, input.userId, now);

  if (existing) {
    const transcript = [...((existing.transcript ?? []) as Anthropic.MessageParam[]), { role: "user", content: [{ type: "text", text: said }] } as Anthropic.MessageParam];
    const { error } = await sb.from("ai_runs").update({ transcript, status: "running", finished_at: null, error: null }).eq("id", existing.id);
    if (error) fail("Could not add to the conversation", error);
    return existing.id;
  }

  const [{ data: agent, error: agentError }, { data: businesses, error: bizError }] = await Promise.all([
    sb.from("ai_agents").select("*").eq("slug", "tess").maybeSingle(),
    sb.from("ai_businesses").select("id, mode"),
  ]);
  if (agentError) fail("Could not load Tess", agentError);
  if (bizError) fail("Could not load the business", bizError);
  if (!agent) throw new Error("Tess is not set up yet. The crew tables need to be created first.");
  const list = (businesses ?? []) as { id: string; mode: string }[];
  const business = list.find((b) => b.mode === "launch") ?? list[0];
  if (!business) throw new Error("There is no business for Tess to work on yet.");

  const run = await startRun(sb, { agent: agent as Agent, businessId: business.id, trigger: "chat", startedBy: input.userId });
  const transcript: Anthropic.MessageParam[] = [
    { role: "user", content: [{ type: "text", text: `${BRIEF_OPEN}\n${await input.brief()}\n</brief>` }, { type: "text", text: said }] },
  ];
  const { error } = await sb.from("ai_runs").update({ transcript }).eq("id", run.id);
  if (error) fail("Could not start the conversation", error);
  return run.id;
}

export type ChatLine = { role: "john" | "tess"; text: string };

/** What has been said in the conversation John can carry on, for the page. */
export async function chatHistory(sb: SupabaseClient, userId: string, now: number = Date.now()): Promise<ChatLine[]> {
  const run = await currentRun(sb, userId, now);
  if (!run) return [];
  const lines: ChatLine[] = [];
  for (const message of (run.transcript ?? []) as Anthropic.MessageParam[]) {
    const blocks = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content;
    const text = blocks
      .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
      .map((b) => b.text)
      .filter((t) => !t.startsWith(BRIEF_OPEN) && t !== ROLE.tess.firstMessage)
      .join("\n")
      .trim();
    if (text) lines.push({ role: message.role === "assistant" ? "tess" : "john", text });
  }
  return lines;
}
