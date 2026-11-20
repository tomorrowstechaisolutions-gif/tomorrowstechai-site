import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, effort } from "@/lib/ai/claude";
import { addDays, chicagoDate, chicagoDayEnd } from "@/lib/time/chicago";
import { chatArchive, type ArchiveDay } from "./chat";
import { spendCentsToday } from "./gate-state";
import { costMicroUsd, CREW_EFFORT, CREW_MODEL } from "./models";
import { STARTING_CAPS } from "./types";

/**
 * Summaries of John's conversations with Tess: one for each day he talked
 * to her, then one for each week (Monday to Sunday) and each month, built
 * from the days.
 *
 * They are written on the crew's clock: a day once it is over, a week or a
 * month once it is over and all of its days are done. A day can also be
 * summarised on request while it is still going; that early version is
 * redone once the day ends. Each summary is one short call to the cheaper
 * model, counted toward the same daily AI spending limit as everything else.
 */

export type SummaryPeriod = "day" | "week" | "month";
export type Summary = { id: string; user_id: string; period: SummaryPeriod; period_start: string; summary: string; lines: number; created_at: string };
export type Summaries = { days: Summary[]; weeks: Summary[]; months: Summary[]; /** False when the table does not exist yet. */ ready: boolean };

/** One model call: the prompt in, the summary and what it cost out. */
export type SummaryCall = (prompt: string) => Promise<{ text: string; microUsd: number }>;

const TABLE = "ai_chat_summaries";
/** How far back a missing summary is still worth writing. */
const LOOKBACK_DAYS = 62;
const MAX_CONVERSATION_CHARS = 30_000;

/** The Monday of the week a date falls in. */
export function weekStart(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 is Sunday
  return addDays(isoDate, -((weekday + 6) % 7));
}

export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

function nextMonthStart(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

const SYSTEM =
  "You write short, plain summaries of a founder's working conversations with his AI assistant, for his own archive. Plain sentences, no headings, no bullet points, no preamble. Say only what the material supports.";

function dayPrompt(day: ArchiveDay): string {
  const said = day.lines.map((l) => `${l.role === "john" ? "John" : "Tess"}: ${l.text}`).join("\n");
  const conversation = said.length > MAX_CONVERSATION_CHARS ? `${said.slice(0, MAX_CONVERSATION_CHARS)}\n[cut for length]` : said;
  return `Summarise John's conversations with Tess on ${day.date} in under 120 words: what they talked about, anything he decided, anything he asked for or said he would do, and what was left open. John's words came through a microphone and may be garbled in places; do not guess at what a garbled line meant.\n\n<conversation>\n${conversation}\n</conversation>`;
}

function rollupPrompt(period: "week" | "month", start: string, days: Summary[]): string {
  const material = days.map((d) => `${d.period_start}: ${d.summary}`).join("\n\n");
  const span = period === "week" ? `the week starting ${start}` : `the month starting ${start}`;
  return `These are the daily summaries of John's conversations with Tess for ${span}. Write one summary of the ${period} in under ${period === "week" ? 150 : 200} words: the main threads, what was decided, what moved forward, and what is still open at the end.\n\n<daily_summaries>\n${material}\n</daily_summaries>`;
}

const defaultCall: SummaryCall = async (prompt) => {
  const res = await anthropic().messages.create({
    model: CREW_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    ...effort(CREW_EFFORT),
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  return { text, microUsd: costMicroUsd(CREW_MODEL, res.usage) };
};

async function loadAll(sb: SupabaseClient, userId: string): Promise<{ rows: Summary[]; ready: boolean }> {
  const { data, error } = await sb.from(TABLE).select("*").eq("user_id", userId).order("period_start", { ascending: false }).limit(500);
  if (error) return { rows: [], ready: false };
  return { rows: (data ?? []) as Summary[], ready: true };
}

/** This admin's summaries, newest first in each period. */
export async function chatSummaries(sb: SupabaseClient, userId: string): Promise<Summaries> {
  const { rows, ready } = await loadAll(sb, userId);
  const of = (period: SummaryPeriod) => rows.filter((r) => r.period === period);
  return { days: of("day"), weeks: of("week"), months: of("month"), ready };
}

/** Make one summary and save it. Returns the saved row, or null when the model gave nothing. */
async function write(
  sb: SupabaseClient,
  call: SummaryCall,
  now: number,
  item: { userId: string; period: SummaryPeriod; start: string; prompt: string; lines: number }
): Promise<Summary | null> {
  const { text, microUsd } = await call(item.prompt);
  const created = new Date(now).toISOString();
  if (microUsd > 0) {
    const { error } = await sb.from("ai_spend").insert({ run_id: null, agent_id: null, micro_usd: microUsd, created_at: created });
    if (error) console.error("[tess] could not record what a summary cost:", error.message);
  }
  const summary = text.trim();
  if (!summary) return null;
  const row = { user_id: item.userId, period: item.period, period_start: item.start, summary, lines: item.lines, created_at: created };
  const { error } = await sb.from(TABLE).upsert(row, { onConflict: "user_id,period,period_start" });
  if (error) throw new Error(`Could not save the summary: ${error.message}`);
  return { id: `${item.period}-${item.start}`, ...row };
}

const overBudget = async (sb: SupabaseClient, now: number) => (await spendCentsToday(sb, now)) >= STARTING_CAPS.spendCentsPerDay;

/** Summarise one day now, finished or not. False when there was nothing to summarise or the spending limit is reached. */
export async function summarizeDay(sb: SupabaseClient, userId: string, date: string, opts: { now?: number; call?: SummaryCall } = {}): Promise<boolean> {
  const now = opts.now ?? Date.now();
  if (await overBudget(sb, now)) return false;
  const day = (await chatArchive(sb, userId)).find((d) => d.date === date);
  if (!day) return false;
  return Boolean(await write(sb, opts.call ?? defaultCall, now, { userId, period: "day", start: date, prompt: dayPrompt(day), lines: day.lines.length }));
}

/**
 * Write the summaries that are due, oldest first, for everyone who has
 * talked to Tess. Does at most `max` in one go so a backlog never crowds
 * out the crew's shifts.
 */
export async function summarizeDue(sb: SupabaseClient, opts: { now?: number; call?: SummaryCall; max?: number } = {}): Promise<{ written: number; skipped?: "budget" | "no_table" }> {
  const now = opts.now ?? Date.now();
  const call = opts.call ?? defaultCall;
  const max = opts.max ?? 3;
  if (await overBudget(sb, now)) return { written: 0, skipped: "budget" };

  const today = chicagoDate(new Date(now));
  const earliest = addDays(today, -LOOKBACK_DAYS);

  const { data: recent, error } = await sb.from("ai_runs").select("started_by").eq("trigger", "chat").order("started_at", { ascending: false }).limit(500);
  if (error) throw new Error(`Could not find who has talked to Tess: ${error.message}`);
  const fromRuns = ((recent ?? []) as { started_by: string | null }[]).map((r) => r.started_by).filter((id): id is string => Boolean(id));
  // Someone with day summaries but no recent chats can still be owed a week or a month.
  const { data: holders } = await sb.from(TABLE).select("user_id").eq("period", "day").gte("period_start", earliest).limit(500);
  const users = [...new Set([...fromRuns, ...((holders ?? []) as { user_id: string }[]).map((r) => r.user_id)])];

  let written = 0;
  for (const userId of users) {
    const { rows, ready } = await loadAll(sb, userId);
    if (!ready) return { written, skipped: "no_table" };
    const have = (period: SummaryPeriod, start: string) => rows.find((r) => r.period === period && r.period_start === start);

    // Days that are over, and either have no summary or have one written before the day ended.
    const days = (await chatArchive(sb, userId)).filter((d) => d.date < today && d.date >= earliest).sort((a, b) => a.date.localeCompare(b.date));
    const dueDays = days.filter((d) => {
      const existing = have("day", d.date);
      return !existing || new Date(existing.created_at).getTime() < chicagoDayEnd(d.date).getTime();
    });
    const pending = new Set(dueDays.map((d) => d.date));

    for (const day of dueDays) {
      if (written >= max) return { written };
      const saved = await write(sb, call, now, { userId, period: "day", start: day.date, prompt: dayPrompt(day), lines: day.lines.length });
      pending.delete(day.date);
      if (!saved) continue;
      const at = rows.findIndex((r) => r.period === "day" && r.period_start === day.date);
      if (at >= 0) rows[at] = saved;
      else rows.push(saved);
      written += 1;
    }

    // Weeks and months that are over, with every one of their days done.
    const daySummaries = rows.filter((r) => r.period === "day" && r.period_start >= earliest).sort((a, b) => a.period_start.localeCompare(b.period_start));
    const rollups: { period: "week" | "month"; start: string; end: string }[] = [];
    for (const d of daySummaries) {
      const week = weekStart(d.period_start);
      const month = monthStart(d.period_start);
      if (!rollups.some((r) => r.period === "week" && r.start === week)) rollups.push({ period: "week", start: week, end: addDays(week, 7) });
      if (!rollups.some((r) => r.period === "month" && r.start === month)) rollups.push({ period: "month", start: month, end: nextMonthStart(month) });
    }
    for (const r of rollups) {
      if (r.end > today || have(r.period, r.start)) continue;
      if ([...pending].some((date) => date >= r.start && date < r.end)) continue;
      if (written >= max) return { written };
      const members = daySummaries.filter((d) => d.period_start >= r.start && d.period_start < r.end);
      const saved = await write(sb, call, now, { userId, period: r.period, start: r.start, prompt: rollupPrompt(r.period, r.start, members), lines: members.reduce((t, d) => t + d.lines, 0) });
      if (!saved) continue;
      rows.push(saved);
      written += 1;
    }
  }
  return { written };
}
