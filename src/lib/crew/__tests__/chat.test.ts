import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { chatHistory, openChatTurn } from "../chat";

const NOW = Date.parse("2026-11-20T14:00:00.000Z");
const brief = vi.fn(async () => "BRIEF TEXT");

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({
    ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "launch" }],
    ai_agents: [{ id: "a-tess", slug: "tess", name: "Tess", model: "claude-opus-5-5" }],
    ai_runs: [],
    ...over,
  });
}

type Msg = { role: string; content: { type: string; text?: string }[] | string };
const texts = (m: Msg) => (typeof m.content === "string" ? [m.content] : m.content.map((b) => b.text ?? ""));

const openRun = (over: Record<string, unknown> = {}) => ({
  id: "run-1", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "done", started_by: "user-1", steps_taken: 2, cost_micro_usd: 0,
  started_at: "2026-11-20T13:00:00.000Z", finished_at: "2026-11-20T13:01:00.000Z",
  transcript: [
    { role: "user", content: [{ type: "text", text: "<brief>\nOLD BRIEF\n</brief>" }, { type: "text", text: "John has just opened the Tess tab." }] },
    { role: "assistant", content: [{ type: "thinking", thinking: "hm", signature: "s" }, { type: "text", text: "Morning, John." }] },
  ],
  ...over,
});

describe("openChatTurn", () => {
  it("starts a chat run for this admin with the brief ahead of the first message", async () => {
    brief.mockClear();
    const { db, tables } = setup();
    const runId = await openChatTurn(db, { userId: "user-1", message: "Where are we?", brief, now: NOW });

    const run = tables.ai_runs[0];
    expect(run).toMatchObject({ id: runId, trigger: "chat", started_by: "user-1", agent_id: "a-tess", business_id: "biz-1", status: "running" });
    const first = (run.transcript as Msg[])[0];
    expect(first.role).toBe("user");
    expect(texts(first)[0]).toContain("BRIEF TEXT");
    expect(texts(first)[1]).toBe("Where are we?");
  });

  it("an empty message is John opening the tab", async () => {
    const { db, tables } = setup();
    await openChatTurn(db, { userId: "user-1", message: "  ", brief, now: NOW });
    expect(texts((tables.ai_runs[0].transcript as Msg[])[0])[1]).toBe("John has just opened the Tess tab.");
  });

  it("carries on the same conversation without a second brief", async () => {
    brief.mockClear();
    const { db, tables } = setup({ ai_runs: [openRun()] });
    const runId = await openChatTurn(db, { userId: "user-1", message: "What should I do first?", brief, now: NOW });

    expect(runId).toBe("run-1");
    expect(tables.ai_runs).toHaveLength(1);
    expect(brief).not.toHaveBeenCalled();
    const transcript = tables.ai_runs[0].transcript as Msg[];
    expect(transcript).toHaveLength(3);
    expect(texts(transcript[2])).toEqual(["What should I do first?"]);
    expect(tables.ai_runs[0]).toMatchObject({ status: "running", finished_at: null });
  });

  it("leaves earlier turns exactly as they were", async () => {
    const before = openRun();
    const { db, tables } = setup({ ai_runs: [openRun()] });
    await openChatTurn(db, { userId: "user-1", message: "Next?", brief, now: NOW });
    expect((tables.ai_runs[0].transcript as Msg[]).slice(0, 2)).toEqual(before.transcript);
  });

  it.each([
    ["is from yesterday", { started_at: "2026-11-19T10:00:00.000Z" }],
    ["was stopped", { status: "stopped" }],
    ["failed", { status: "failed" }],
    ["is close to the step limit", { steps_taken: 21 }],
    ["belongs to another admin", { started_by: "user-2" }],
    ["was cut off with a tool call unanswered", { transcript: [{ role: "user", content: "hi" }, { role: "assistant", content: [{ type: "tool_use", id: "tu-1", name: "read_lead", input: {} }] }] }],
  ])("starts a fresh conversation when the last one %s", async (_why, over) => {
    brief.mockClear();
    const { db, tables } = setup({ ai_runs: [openRun(over)] });
    const runId = await openChatTurn(db, { userId: "user-1", message: "Hello", brief, now: NOW });

    expect(runId).not.toBe("run-1");
    expect(tables.ai_runs).toHaveLength(2);
    expect(brief).toHaveBeenCalledTimes(1);
  });
});

describe("chatHistory", () => {
  it("returns what was said, without the brief, the thinking or the tab-open marker", async () => {
    const { db } = setup({ ai_runs: [openRun()] });
    expect(await chatHistory(db, "user-1", NOW)).toEqual([{ role: "tess", text: "Morning, John." }]);
  });

  it("includes what John said", async () => {
    const run = openRun();
    run.transcript.push({ role: "user", content: [{ type: "text", text: "What first?" }] });
    const { db } = setup({ ai_runs: [run] });
    expect(await chatHistory(db, "user-1", NOW)).toEqual([{ role: "tess", text: "Morning, John." }, { role: "john", text: "What first?" }]);
  });

  it("is empty when there is no conversation to carry on", async () => {
    expect(await chatHistory(setup().db, "user-1", NOW)).toEqual([]);
  });
});
