import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { chatSummaries, monthStart, summarizeDay, summarizeDue, weekStart, type SummaryCall } from "../summaries";

// Friday 20 November 2026, 15:00 in Chicago.
const NOW = Date.parse("2026-11-20T21:00:00.000Z");

const run = (id: string, startedAt: string, said: string, over: Record<string, unknown> = {}) => ({
  id, agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "done", started_by: "user-1", steps_taken: 1, cost_micro_usd: 0,
  started_at: startedAt, finished_at: startedAt,
  transcript: [
    { role: "user", content: [{ type: "text", text: "<brief>\nBRIEF\n</brief>" }, { type: "text", text: said }] },
    { role: "assistant", content: [{ type: "text", text: `Tess on: ${said}` }] },
  ],
  ...over,
});

const summary = (period: string, start: string, text: string, createdAt = "2026-11-25T12:00:00.000Z") => ({
  id: `${period}-${start}`, user_id: "user-1", period, period_start: start, summary: text, lines: 2, created_at: createdAt,
});

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({ ai_runs: [], ai_chat_summaries: [], ai_spend: [], ...over });
}

function caller() {
  const prompts: string[] = [];
  const call: SummaryCall = async (prompt) => {
    prompts.push(prompt);
    return { text: `SUMMARY ${prompts.length}`, microUsd: 1200 };
  };
  return { call, prompts };
}

describe("the calendar the summaries follow", () => {
  it("a week starts on Monday", () => {
    expect(weekStart("2026-11-20")).toBe("2026-11-16");
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
  });

  it("a month starts on the first", () => {
    expect(monthStart("2026-11-20")).toBe("2026-11-01");
  });
});

describe("summarising a day of chat", () => {
  it("summarises a finished day that has none, from what was actually said", async () => {
    const { db, tables } = setup({ ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", "Where are we on leads?")] });
    const { call, prompts } = caller();
    const result = await summarizeDue(db, { now: NOW, call });

    expect(result.written).toBe(1);
    expect(tables.ai_chat_summaries[0]).toMatchObject({ user_id: "user-1", period: "day", period_start: "2026-11-19", summary: "SUMMARY 1", lines: 2 });
    expect(prompts[0]).toContain("Where are we on leads?");
    expect(prompts[0]).not.toContain("BRIEF");
  });

  it("leaves today alone until the day is over", async () => {
    const { db, tables } = setup({ ai_runs: [run("r1", "2026-11-20T15:00:00.000Z", "Morning")] });
    const { call } = caller();
    expect((await summarizeDue(db, { now: NOW, call })).written).toBe(0);
    expect(tables.ai_chat_summaries).toHaveLength(0);
  });

  it("does not summarise the same day twice", async () => {
    const { db } = setup({
      ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", "Leads")],
      ai_chat_summaries: [summary("day", "2026-11-19", "Already done.", "2026-11-20T08:00:00.000Z")],
    });
    const { call, prompts } = caller();
    await summarizeDue(db, { now: NOW, call });
    expect(prompts).toHaveLength(0);
  });

  it("redoes a summary John asked for before that day had ended", async () => {
    const { db, tables } = setup({
      ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", "Leads"), run("r2", "2026-11-20T02:00:00.000Z", "One more thing that evening")],
      // Written at 3pm Chicago on the 19th, while the day was still going.
      ai_chat_summaries: [summary("day", "2026-11-19", "Early version.", "2026-11-19T21:00:00.000Z")],
    });
    const { call, prompts } = caller();
    await summarizeDue(db, { now: NOW, call });
    expect(prompts[0]).toContain("One more thing that evening");
    expect(tables.ai_chat_summaries).toHaveLength(1);
    expect(tables.ai_chat_summaries[0].summary).toBe("SUMMARY 1");
  });

  it("skips a day where nothing was said", async () => {
    const { db } = setup({ ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", "John has just opened the Tess tab.", { transcript: [{ role: "user", content: [{ type: "text", text: "John has just opened the Tess tab." }] }] })] });
    const { call, prompts } = caller();
    await summarizeDue(db, { now: NOW, call });
    expect(prompts).toHaveLength(0);
  });

  it("summarises today on request", async () => {
    const { db, tables } = setup({ ai_runs: [run("r1", "2026-11-20T15:00:00.000Z", "Morning plan")] });
    const { call } = caller();
    const done = await summarizeDay(db, "user-1", "2026-11-20", { now: NOW, call });
    expect(done).toBe(true);
    expect(tables.ai_chat_summaries[0]).toMatchObject({ period: "day", period_start: "2026-11-20" });
  });
});

describe("rolling days up into weeks and months", () => {
  it("summarises a finished week from its days", async () => {
    const { db, tables } = setup({
      ai_chat_summaries: [summary("day", "2026-11-10", "Tuesday: priced the pool app."), summary("day", "2026-11-12", "Thursday: fixed the mic.")],
    });
    const { call, prompts } = caller();
    await summarizeDue(db, { now: NOW, call });
    const week = tables.ai_chat_summaries.find((r) => r.period === "week");
    expect(week).toMatchObject({ period_start: "2026-11-09", summary: "SUMMARY 1" });
    expect(prompts[0]).toContain("priced the pool app");
    expect(prompts[0]).toContain("fixed the mic");
  });

  it("does not summarise the week still in progress", async () => {
    const { db, tables } = setup({ ai_chat_summaries: [summary("day", "2026-11-17", "Tuesday this week.")] });
    const { call } = caller();
    await summarizeDue(db, { now: NOW, call });
    expect(tables.ai_chat_summaries.some((r) => r.period === "week")).toBe(false);
  });

  it("summarises a finished month from its days", async () => {
    const { db, tables } = setup({
      ai_chat_summaries: [summary("day", "2026-10-05", "Early October."), summary("day", "2026-10-28", "Late October."), summary("week", "2026-10-05", "w"), summary("week", "2026-10-26", "w")],
    });
    const { call, prompts } = caller();
    await summarizeDue(db, { now: NOW, call });
    const month = tables.ai_chat_summaries.find((r) => r.period === "month");
    expect(month).toMatchObject({ period_start: "2026-10-01" });
    expect(prompts[0]).toContain("Early October.");
    expect(prompts[0]).toContain("Late October.");
  });
});

describe("keeping the summaries cheap and bounded", () => {
  it("writes nothing once today's AI spending limit is reached", async () => {
    const { db } = setup({
      ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", "Leads")],
      ai_spend: [{ id: "s1", micro_usd: 5_000_000, created_at: "2026-11-20T15:00:00.000Z" }],
    });
    const { call, prompts } = caller();
    const result = await summarizeDue(db, { now: NOW, call });
    expect(prompts).toHaveLength(0);
    expect(result.written).toBe(0);
  });

  it("counts what each summary cost toward today's spend", async () => {
    const { db, tables } = setup({ ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", "Leads")] });
    const { call } = caller();
    await summarizeDue(db, { now: NOW, call });
    expect(tables.ai_spend).toHaveLength(1);
    expect(tables.ai_spend[0]).toMatchObject({ micro_usd: 1200 });
  });

  it("does only a few per tick, so a backlog never crowds out the crew", async () => {
    const { db } = setup({
      ai_runs: ["13", "14", "15", "16", "17", "18", "19"].map((d, i) => run(`r${i}`, `2026-11-${d}T15:00:00.000Z`, `Day ${d}`)),
    });
    const { call, prompts } = caller();
    const result = await summarizeDue(db, { now: NOW, call, max: 3 });
    expect(prompts).toHaveLength(3);
    expect(result.written).toBe(3);
  });

  it("stores nothing when the model returns nothing", async () => {
    const { db, tables } = setup({ ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", "Leads")] });
    const result = await summarizeDue(db, { now: NOW, call: async () => ({ text: "  ", microUsd: 10 }) });
    expect(result.written).toBe(0);
    expect(tables.ai_chat_summaries).toHaveLength(0);
  });
});

describe("reading the summaries back", () => {
  it("returns this admin's summaries by period, newest first", async () => {
    const { db } = setup({
      ai_chat_summaries: [
        summary("day", "2026-11-18", "Wed"), summary("day", "2026-11-19", "Thu"), summary("week", "2026-11-09", "Week"), summary("month", "2026-10-01", "Oct"),
        { ...summary("day", "2026-11-19", "Someone else"), id: "x", user_id: "user-2" },
      ],
    });
    const all = await chatSummaries(db, "user-1");
    expect(all.days.map((s) => s.summary)).toEqual(["Thu", "Wed"]);
    expect(all.weeks.map((s) => s.summary)).toEqual(["Week"]);
    expect(all.months.map((s) => s.summary)).toEqual(["Oct"]);
  });

  it("is empty, not an error, before the table exists", async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "relation does not exist" } }) }) }) }) }) };
    expect(await chatSummaries(db as never, "user-1")).toEqual({ days: [], weeks: [], months: [], ready: false });
  });
});
