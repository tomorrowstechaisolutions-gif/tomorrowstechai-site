import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { finishRun, loadStepsSince, logStep, startRun, stepFor } from "../log";
import type { Agent } from "../types";

const agent: Agent = {
  id: "agent-1", slug: "follow-through", name: "Follow-through", rank: "desk", desk: "sales",
  business_id: "biz-1", model: "claude-sonnet-5-5", schedule_minutes: 120, paused: false, last_shift_at: null,
};

const email = { kind: "act" as const, tool: "send_lead_email", station: "inbox" as const, summary: "sent the follow-up to Ana", goal_id: "g1", expectation: "A reply", tool_use_id: "toolu_1" };

describe("the step log", () => {
  it("starts a run as running with an empty transcript", async () => {
    const { db, tables } = fakeSupabase({ ai_runs: [], ai_agents: [{ ...agent }] });
    const run = await startRun(db, { agent, businessId: "biz-1", trigger: "shift" });
    expect(run).toMatchObject({ agent_id: "agent-1", business_id: "biz-1", trigger: "shift", status: "running", steps_taken: 0 });
    expect(run.transcript).toEqual([]);
    expect(tables.ai_runs).toHaveLength(1);
  });

  it("stamps the bot's last shift when a shift starts, but not for a chat", async () => {
    const { db, tables } = fakeSupabase({ ai_runs: [], ai_agents: [{ ...agent }] });
    await startRun(db, { agent, businessId: "biz-1", trigger: "chat" });
    expect(tables.ai_agents[0].last_shift_at).toBeNull();
    await startRun(db, { agent, businessId: "biz-1", trigger: "shift" });
    expect(tables.ai_agents[0].last_shift_at).toEqual(expect.any(String));
  });

  it("a logged step can be read back with its station and summary", async () => {
    const { db, tables } = fakeSupabase({ ai_runs: [], ai_steps: [], ai_agents: [{ ...agent }] });
    const run = await startRun(db, { agent, businessId: "biz-1", trigger: "shift" });
    const { step, duplicate } = await logStep(db, run, email);
    expect(duplicate).toBe(false);
    expect(step).toMatchObject({ seq: 1, station: "inbox", summary: "sent the follow-up to Ana", agent_id: "agent-1", business_id: "biz-1" });
    expect(tables.ai_runs[0].steps_taken).toBe(1);
  });

  it("logging the same tool_use_id twice keeps one row and says so", async () => {
    const { db, tables } = fakeSupabase({ ai_runs: [], ai_steps: [], ai_agents: [{ ...agent }] });
    const run = await startRun(db, { agent, businessId: "biz-1", trigger: "shift" });
    await logStep(db, run, email);
    const again = await logStep(db, run, email);
    expect(again.duplicate).toBe(true);
    expect(tables.ai_steps).toHaveLength(1);
    expect(tables.ai_runs[0].steps_taken).toBe(1);
  });

  it("numbers steps in order within a run", async () => {
    const { db } = fakeSupabase({ ai_runs: [], ai_steps: [], ai_agents: [{ ...agent }] });
    const run = await startRun(db, { agent, businessId: "biz-1", trigger: "shift" });
    const a = await logStep(db, run, { ...email, tool_use_id: "toolu_a" });
    const b = await logStep(db, run, { ...email, tool_use_id: "toolu_b" });
    expect([a.step.seq, b.step.seq]).toEqual([1, 2]);
  });

  it("stepFor finds the step a tool call already produced", async () => {
    const { db } = fakeSupabase({ ai_runs: [], ai_steps: [], ai_agents: [{ ...agent }] });
    const run = await startRun(db, { agent, businessId: "biz-1", trigger: "shift" });
    expect(await stepFor(db, run.id, "toolu_1")).toBeNull();
    await logStep(db, run, email);
    expect((await stepFor(db, run.id, "toolu_1"))?.tool).toBe("send_lead_email");
  });

  it("finishRun records the status, the time and any error", async () => {
    const { db, tables } = fakeSupabase({ ai_runs: [], ai_agents: [{ ...agent }] });
    const run = await startRun(db, { agent, businessId: "biz-1", trigger: "shift" });
    await finishRun(db, run.id, "failed", "model refused: cyber");
    expect(tables.ai_runs[0]).toMatchObject({ status: "failed", error: "model refused: cyber" });
    expect(tables.ai_runs[0].finished_at).toEqual(expect.any(String));
  });

  it("loadStepsSince returns only later steps, oldest first", async () => {
    const { db } = fakeSupabase({
      ai_steps: [
        { id: "s3", created_at: "2026-11-20T10:03:00.000Z", summary: "third" },
        { id: "s1", created_at: "2026-11-20T09:00:00.000Z", summary: "too old" },
        { id: "s2", created_at: "2026-11-20T10:01:00.000Z", summary: "second" },
      ],
    });
    const steps = await loadStepsSince(db, "2026-11-20T10:00:00.000Z");
    expect(steps.map((s) => s.summary)).toEqual(["second", "third"]);
  });
});
