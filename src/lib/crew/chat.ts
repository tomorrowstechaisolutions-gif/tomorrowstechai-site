import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chicagoDate } from "@/lib/time/chicago";
import { startRun } from "./log";
import { ROLE } from "./roles";
import { CONTEXT_TAGS } from "./tess-modes";
import type { Agent, Run } from "./types";

/**
 * John's conversation with Tess.
 *
 * A conversation is one `chat` run. Each thing John says is appended to that
 * run's transcript and the engine carries it forward, so Tess remembers the
 * sitting. The brief goes in once, ahead of the first message; later turns
 * add only what John said, which keeps everything before them cached.
 *
 * Who John is and how he wants to be answered (his profile, the mode, the
 * dials) travel the same way: as blocks ahead of what he said, sent at the
 * start and again only when one of them has changed. Nothing already in the
 * conversation is rewritten, so switching mode costs one short block.
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

function textsOf(message: Anthropic.MessageParam): string[] {
  if (typeof message.content === "string") return [message.content];
  return message.content.filter((b): b is Anthropic.TextBlockParam => b.type === "text").map((b) => b.text);
}

/** The context blocks Tess has not been told yet: new ones, and ones whose words changed. */
function changedContext(transcript: Anthropic.MessageParam[], context: string[]): string[] {
  return context.filter((block) => {
    const tag = CONTEXT_TAGS.find((t) => block.startsWith(t));
    if (!tag) return false;
    let last: string | undefined;
    for (const message of transcript) {
      if (message.role !== "user") continue;
      for (const text of textsOf(message)) if (text.startsWith(tag)) last = text;
    }
    return last !== block;
  });
}

const asText = (text: string): Anthropic.TextBlockParam => ({ type: "text", text });

/** Tess as the code has her today (see tess-current.ts). */
export type TessCurrent = { prompt: string; toolNames: string[] };

/**
 * True when a conversation was started under different standing instructions
 * or a different set of tools than Tess has now. Its instructions and tools
 * are frozen (see run.ts), so it would never get what was added since.
 * Starting a new conversation is the clean way to pick that up.
 */
export function frameOutdated(frame: unknown, current: TessCurrent): boolean {
  const f = frame as { system?: { text?: string }[]; tools?: { name?: string }[] } | null | undefined;
  if (!f || !Array.isArray(f.system) || !Array.isArray(f.tools)) return false;
  if (f.system[0]?.text !== current.prompt) return true;
  const had = f.tools.map((t) => t.name).sort().join("|");
  return had !== [...current.toolNames].sort().join("|");
}

/** The conversation this admin can carry on, if there is one. */
async function currentRun(sb: SupabaseClient, userId: string, now: number, current?: TessCurrent): Promise<Run | null> {
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
  if (current && frameOutdated(run.frame, current)) return null;
  return run;
}

/**
 * Add what John said to his conversation and return the run to advance.
 * `brief` is only called when a new conversation starts.
 */
export async function openChatTurn(
  sb: SupabaseClient,
  input: { userId: string; message: string; brief: () => Promise<string>; context?: string[]; current?: TessCurrent; now?: number }
): Promise<string> {
  const now = input.now ?? Date.now();
  const said = input.message.trim().slice(0, 4000) || ROLE.tess.firstMessage;
  const context = input.context ?? [];
  const existing = await currentRun(sb, input.userId, now, input.current);

  if (existing) {
    const before = (existing.transcript ?? []) as Anthropic.MessageParam[];
    const transcript: Anthropic.MessageParam[] = [...before, { role: "user", content: [...changedContext(before, context).map(asText), asText(said)] }];
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
    { role: "user", content: [asText(`${BRIEF_OPEN}\n${await input.brief()}\n</brief>`), ...changedContext([], context).map(asText), asText(said)] },
  ];
  const { error } = await sb.from("ai_runs").update({ transcript }).eq("id", run.id);
  if (error) fail("Could not start the conversation", error);
  return run.id;
}

export type ChatLine = { role: "john" | "tess"; text: string };

/** What has been said in the conversation John can carry on, for the page. */
export async function chatHistory(sb: SupabaseClient, userId: string, now: number = Date.now(), current?: TessCurrent): Promise<ChatLine[]> {
  const run = await currentRun(sb, userId, now, current);
  return run ? linesOf(run) : [];
}

/** What John and Tess actually said in one saved conversation: no brief, no settings, no tool calls. */
function linesOf(run: Pick<Run, "transcript">): ChatLine[] {
  const lines: ChatLine[] = [];
  for (const message of (run.transcript ?? []) as Anthropic.MessageParam[]) {
    const blocks = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content;
    const text = blocks
      .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
      .map((b) => b.text)
      .filter((t) => !t.startsWith(BRIEF_OPEN) && !CONTEXT_TAGS.some((tag) => t.startsWith(tag)) && t !== ROLE.tess.firstMessage)
      .join("\n")
      .trim();
    if (text) lines.push({ role: message.role === "assistant" ? "tess" : "john", text });
  }
  return lines;
}

export type ArchiveDay = { /** YYYY-MM-DD, Chicago. */ date: string; conversations: number; lines: ChatLine[] };

/**
 * This admin's conversations with Tess, grouped by the Chicago day each one
 * started, newest day first. A day where nothing was actually said (he
 * opened the tab and left) is left out.
 */
export async function chatArchive(sb: SupabaseClient, userId: string, limit: number = 300): Promise<ArchiveDay[]> {
  const { data, error } = await sb
    .from("ai_runs")
    .select("id, started_at, transcript")
    .eq("trigger", "chat")
    .eq("started_by", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) fail("Could not load the archive", error);

  const byDay = new Map<string, ArchiveDay>();
  const oldestFirst = [...((data ?? []) as Pick<Run, "id" | "started_at" | "transcript">[])].sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const run of oldestFirst) {
    const lines = linesOf(run);
    if (!lines.length) continue;
    const date = chicagoDate(new Date(run.started_at));
    const day = byDay.get(date) ?? { date, conversations: 0, lines: [] };
    day.conversations += 1;
    day.lines.push(...lines);
    byDay.set(date, day);
  }
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}
