import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google/gmail", () => ({ sendMail: vi.fn(), gmailProfile: vi.fn(), listThreads: vi.fn(), getThread: vi.fn() }));
vi.mock("@/lib/email-marketing/suppression", () => ({ loadSuppression: vi.fn(async () => ({ blocked: new Map() })) }));
vi.mock("@/lib/dashboard/sales", () => ({ loadLeadsNeedingAttention: vi.fn(async () => []) }));
vi.mock("@/lib/blog/social-draft", () => ({ createArticleSocialDraft: vi.fn() }));
vi.mock("@/lib/blog/repository", () => ({ getArticle: vi.fn(), getListedArticles: vi.fn(async () => []) }));
vi.mock("@/lib/social/publisher", () => ({ publishDueSocialPosts: vi.fn() }));
vi.mock("@/lib/invoices/emails", () => ({ sendInvoiceReminder: vi.fn() }));
vi.mock("@/lib/invoices/queries", () => ({ loadInvoiceWorkspace: vi.fn(async () => ({ rows: [] })) }));
vi.mock("@/lib/finance/overview", () => ({ loadFinanceOverview: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai/record", () => ({ recordAiUsageAsync: vi.fn() }));

import { advanceRun, isStaleThinking, type ModelCall } from "../run";

type Req = Parameters<ModelCall>[0];
const reply = (text: string): Anthropic.Message =>
  ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "thinking", thinking: "hm", signature: "sig" }, { type: "text", text, citations: null }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 10 } }) as unknown as Anthropic.Message;

const STALE = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation. Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to \\"drop_block\\"."}}');

function setup() {
  const fake = fakeSupabase({
    ai_crew_state: [{ id: true, paused: false }],
    ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "setup", playbook: null, playbook_confirmed_at: null, caps: { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 } }],
    ai_goals: [],
    ai_agents: [{ id: "a-tess", slug: "tess", name: "Tess", rank: "lead", desk: null, business_id: null, model: "claude-opus-5-5", schedule_minutes: 0, paused: false, last_shift_at: null }],
    ai_runs: [{ id: "run-1", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "running", started_by: "user-1", transcript: [{ role: "user", content: [{ type: "text", text: "Morning" }] }], steps_taken: 0, cost_micro_usd: 0, started_at: new Date().toISOString(), finished_at: null, error: null }],
    ai_steps: [], ai_rules: [], ai_spend: [],
  });
  const seen: Req[] = [];
  const say = async (db: typeof fake.db, text: string, call: ModelCall) => {
    const run = fake.tables.ai_runs[0];
    run.transcript = [...(run.transcript as unknown[]), { role: "user", content: [{ type: "text", text }] }];
    run.status = "running";
    return advanceRun(db, "run-1", { deadlineAt: Date.now() + 60_000, call });
  };
  const record: ModelCall = async (req) => {
    seen.push(JSON.parse(JSON.stringify(req)) as Req);
    return reply("Okay.");
  };
  return { ...fake, seen, say, record };
}

describe("a conversation keeps the instructions it started with", () => {
  it("sends the same instructions after a rule is added mid-conversation", async () => {
    const { db, tables, seen, say, record } = setup();
    await advanceRun(db, "run-1", { deadlineAt: Date.now() + 60_000, call: record });
    tables.ai_rules.push({ id: "r1", text: "Never email on Sundays.", scope: "all", active: true });
    tables.ai_businesses[0].mode = "launch";
    await say(db, "And now?", record);

    expect(seen).toHaveLength(2);
    expect(seen[1].system).toEqual(seen[0].system);
    expect(JSON.stringify(seen[1].system)).not.toContain("Never email on Sundays.");
  });

  it("sends the same tool definitions it started with", async () => {
    const { db, tables, seen, say, record } = setup();
    await advanceRun(db, "run-1", { deadlineAt: Date.now() + 60_000, call: record });
    const frame = tables.ai_runs[0].frame as { tools: { name: string; description: string }[] };
    expect(frame.tools.length).toBeGreaterThan(0);
    // What a deploy does: the saved definition no longer matches the code's.
    frame.tools[0].description = "AN OLDER DESCRIPTION";
    await say(db, "And now?", record);
    expect(seen[1].tools[0].description).toBe("AN OLDER DESCRIPTION");
  });

  it("a new conversation picks up the current instructions", async () => {
    const { db, tables, seen, record } = setup();
    tables.ai_rules.push({ id: "r1", text: "Never email on Sundays.", scope: "all", active: true });
    await advanceRun(db, "run-1", { deadlineAt: Date.now() + 60_000, call: record });
    expect(JSON.stringify(seen[0].system)).toContain("Never email on Sundays.");
  });
});

describe("when the model refuses an older conversation's reasoning", () => {
  it("recognises that refusal and nothing else", () => {
    expect(isStaleThinking(STALE)).toBe(true);
    expect(isStaleThinking(new Error("529 overloaded"))).toBe(false);
    expect(isStaleThinking(null)).toBe(false);
  });

  it("asks once more with the old reasoning dropped, and answers", async () => {
    const { db, tables, seen } = setup();
    let calls = 0;
    const call: ModelCall = async (req) => {
      calls += 1;
      seen.push(JSON.parse(JSON.stringify(req)) as Req);
      if (calls === 1) throw STALE;
      return reply("Here I am.");
    };
    const result = await advanceRun(db, "run-1", { deadlineAt: Date.now() + 60_000, call });

    expect(result.status).toBe("done");
    expect(seen).toHaveLength(2);
    expect(seen[0].dropThinking).toBeFalsy();
    expect(seen[1].dropThinking).toBe(true);
    const last = (tables.ai_runs[0].transcript as { role: string }[]).at(-1);
    expect(last?.role).toBe("assistant");
  });

  it("remembers, so every later message in that conversation drops it from the start", async () => {
    const { db, seen, say } = setup();
    let calls = 0;
    const call: ModelCall = async (req) => {
      calls += 1;
      seen.push(JSON.parse(JSON.stringify(req)) as Req);
      if (calls === 1) throw STALE;
      return reply("Okay.");
    };
    await advanceRun(db, "run-1", { deadlineAt: Date.now() + 60_000, call });
    await say(db, "Next thing", call);
    expect(seen).toHaveLength(3);
    expect(seen[2].dropThinking).toBe(true);
  });

  it("does not loop: a second refusal fails the run", async () => {
    const { db } = setup();
    const call: ModelCall = async () => {
      throw STALE;
    };
    await expect(advanceRun(db, "run-1", { deadlineAt: Date.now() + 60_000, call })).rejects.toThrow(/different conversation/);
  });

  it("still fails on any other error, without a second try", async () => {
    const { db } = setup();
    let calls = 0;
    const call: ModelCall = async () => {
      calls += 1;
      throw new Error("529 overloaded");
    };
    await expect(advanceRun(db, "run-1", { deadlineAt: Date.now() + 60_000, call })).rejects.toThrow(/overloaded/);
    expect(calls).toBe(1);
  });
});
