import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn<(mail: { text: string }) => Promise<{ id: string; threadId: string }>>(async () => ({ id: "gm-1", threadId: "th-1" })),
  recordAiUsageAsync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google/gmail", () => ({ sendMail: mocks.sendMail, gmailProfile: vi.fn(async () => ({ emailAddress: "john@example.test" })), listThreads: vi.fn(), getThread: vi.fn() }));
vi.mock("@/lib/email-marketing/suppression", () => ({ loadSuppression: vi.fn(async () => ({ blocked: new Map() })) }));
vi.mock("@/lib/dashboard/sales", () => ({ loadLeadsNeedingAttention: vi.fn(async () => [{ id: "lead-1", name: "Ana Reyes", business: "Reyes Roofing", status: "Contacted", lastContactedAt: null, nextAction: "Follow-up is due" }]) }));
vi.mock("@/lib/blog/social-draft", () => ({ createArticleSocialDraft: vi.fn() }));
vi.mock("@/lib/blog/repository", () => ({ getArticle: vi.fn(), getListedArticles: vi.fn(async () => []) }));
vi.mock("@/lib/social/publisher", () => ({ publishDueSocialPosts: vi.fn() }));
vi.mock("@/lib/invoices/emails", () => ({ sendInvoiceReminder: vi.fn() }));
vi.mock("@/lib/invoices/queries", () => ({ loadInvoiceWorkspace: vi.fn(async () => ({ rows: [] })) }));
vi.mock("@/lib/finance/overview", () => ({ loadFinanceOverview: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai/record", () => ({ recordAiUsageAsync: mocks.recordAiUsageAsync }));

import { advanceRun, MAX_STEPS_PER_RUN, type ModelCall } from "../run";

type Block = Anthropic.ContentBlock;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Block;
const use = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input }) as unknown as Block;
const thinking = (t: string) => ({ type: "thinking", thinking: t, signature: "sig" }) as unknown as Block;

function reply(content: Block[], stop: string, extra: Record<string, unknown> = {}): Anthropic.Message {
  return { id: "msg", type: "message", role: "assistant", model: "claude-sonnet-5-5", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 100 }, ...extra } as unknown as Anthropic.Message;
}

/** A model that plays back a fixed list of replies and records what it was sent. */
function script(replies: Anthropic.Message[]) {
  const seen: Anthropic.MessageParam[][] = [];
  const call: ModelCall = vi.fn(async (req) => {
    seen.push(JSON.parse(JSON.stringify(req.messages)));
    const next = replies.shift();
    if (!next) throw new Error("the script ran out of replies");
    return next;
  });
  return { call, seen };
}

const emailInput = { lead_id: "lead-1", subject: "Following up", body: "Hi Ana, checking in.", goal_id: "g1", expectation: "A reply inside 3 days" };

function setup(over: Partial<Tables> = {}) {
  const fake = fakeSupabase({
    ai_crew_state: [{ id: true, paused: false }],
    ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "launch", playbook: null, playbook_confirmed_at: "x", caps: { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 } }],
    ai_goals: [{ id: "g1", business_id: "biz-1", metric: "booked_calls", target: 4, period_start: "2026-11-01", period_end: "2099-12-31" }],
    ai_agents: [{ id: "agent-ft", slug: "follow-through", name: "Follow-through", rank: "desk", desk: "sales", business_id: "biz-1", model: "claude-sonnet-5-5", schedule_minutes: 120, paused: false, last_shift_at: null }],
    ai_runs: [{ id: "run-1", agent_id: "agent-ft", business_id: "biz-1", trigger: "shift", status: "running", transcript: [], steps_taken: 0, cost_micro_usd: 0, started_at: new Date().toISOString(), finished_at: null, error: null }],
    ai_steps: [], ai_rules: [], ai_actions: [], lead_events: [],
    leads: [{ id: "lead-1", first_name: "Ana", last_name: "Reyes", email: "ana@example.com", business_name: "Reyes Roofing", do_not_contact: false, unsubscribed_at: null, last_contacted_at: null, lead_status: "Contacted" }],
    ...over,
  });
  const run = () => fake.tables.ai_runs[0];
  return { ...fake, run };
}

const later = () => Date.now() + 60_000;

beforeEach(() => {
  mocks.sendMail.mockClear();
  mocks.recordAiUsageAsync.mockClear();
});

describe("advanceRun", () => {
  it("runs a tool the model asks for and feeds the result back", async () => {
    const { db, run } = setup();
    const { call, seen } = script([
      reply([use("tu-1", "list_leads_needing_attention", {})], "tool_use"),
      reply([text("Nothing more to do.")], "end_turn"),
    ]);

    const result = await advanceRun(db, "run-1", { deadlineAt: later(), call });

    expect(result.status).toBe("done");
    expect(run().status).toBe("done");
    const lastSent = seen[1][seen[1].length - 1];
    expect(lastSent.role).toBe("user");
    expect((lastSent.content as Anthropic.ToolResultBlockParam[])[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu-1" });
  });

  it("an unknown tool becomes an error result and the run continues", async () => {
    const { db, run } = setup();
    const { call, seen } = script([reply([use("tu-1", "delete_everything", {})], "tool_use"), reply([text("ok")], "end_turn")]);

    await advanceRun(db, "run-1", { deadlineAt: later(), call });

    const result = (seen[1][seen[1].length - 1].content as Anthropic.ToolResultBlockParam[])[0];
    expect(result.is_error).toBe(true);
    expect(run().status).toBe("done");
  });

  it("a tool this bot is not given is refused even though it exists", async () => {
    const { db } = setup();
    const { call, seen } = script([reply([use("tu-1", "send_invoice_reminder", { invoice_id: "x", goal_id: "g1", expectation: "paid" })], "tool_use"), reply([text("ok")], "end_turn")]);

    await advanceRun(db, "run-1", { deadlineAt: later(), call });

    expect((seen[1][seen[1].length - 1].content as Anthropic.ToolResultBlockParam[])[0].is_error).toBe(true);
  });

  it("input that fails the schema becomes an error result and nothing is sent", async () => {
    const { db } = setup();
    const { call, seen } = script([reply([use("tu-1", "send_lead_email", { lead_id: "lead-1", subject: "Hi" })], "tool_use"), reply([text("ok")], "end_turn")]);

    await advanceRun(db, "run-1", { deadlineAt: later(), call });

    const result = (seen[1][seen[1].length - 1].content as Anthropic.ToolResultBlockParam[])[0];
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/body/);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("returns every tool result in one message when the model calls two tools at once", async () => {
    const { db } = setup();
    const { call, seen } = script([
      reply([use("tu-1", "list_leads_needing_attention", {}), use("tu-2", "read_lead", { lead_id: "lead-1" })], "tool_use"),
      reply([text("ok")], "end_turn"),
    ]);

    await advanceRun(db, "run-1", { deadlineAt: later(), call });

    const results = seen[1][seen[1].length - 1].content as Anthropic.ToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["tu-1", "tu-2"]);
  });

  it("stops as waiting at the deadline without calling the model", async () => {
    const { db, run } = setup();
    const { call } = script([]);

    const result = await advanceRun(db, "run-1", { deadlineAt: Date.now() - 1, call });

    expect(result.status).toBe("waiting");
    expect(run().status).toBe("waiting");
    expect(call).not.toHaveBeenCalled();
  });

  it("resumes after a deadline and does not repeat an action", async () => {
    const { db } = setup();
    const { call } = script([reply([use("tu-1", "send_lead_email", emailInput)], "tool_use"), reply([text("done")], "end_turn")]);

    // First tick: one model call, the email goes out, then time is up.
    let calls = 0;
    const oneCall: ModelCall = async (req) => { calls += 1; return call(req); };
    await advanceRun(db, "run-1", { deadlineAt: later(), call: oneCall, maxModelCalls: 1 });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);

    const result = await advanceRun(db, "run-1", { deadlineAt: later(), call: oneCall });
    expect(result.status).toBe("done");
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });

  it("a tick that died after sending, before saving the result, does not send again", async () => {
    // The transcript holds the model's tool call but no result, and the step
    // log already has the email: exactly what a crash mid-tool leaves behind.
    const { db, tables } = setup();
    tables.ai_runs[0].transcript = [
      { role: "user", content: "Start your shift." },
      { role: "assistant", content: [use("tu-1", "send_lead_email", emailInput)] },
    ];
    tables.ai_steps.push({ id: "s1", run_id: "run-1", agent_id: "agent-ft", business_id: "biz-1", seq: 1, kind: "act", tool: "send_lead_email", station: "inbox", summary: "emailed Ana", tool_use_id: "tu-1", payload: { to: "ana@example.com" }, created_at: new Date().toISOString() });
    tables.ai_runs[0].steps_taken = 1;
    const { call, seen } = script([reply([text("done")], "end_turn")]);

    const result = await advanceRun(db, "run-1", { deadlineAt: later(), call });

    expect(result.status).toBe("done");
    expect(mocks.sendMail).not.toHaveBeenCalled();
    const fed = (seen[0][seen[0].length - 1].content as Anthropic.ToolResultBlockParam[])[0];
    expect(fed).toMatchObject({ type: "tool_result", tool_use_id: "tu-1" });
  });

  it("stops as paused_budget before calling the model when the day's spend is used", async () => {
    const { db, run, tables } = setup();
    tables.ai_runs.push({ id: "run-old", agent_id: "agent-ft", business_id: "biz-1", trigger: "shift", status: "done", transcript: [], steps_taken: 3, cost_micro_usd: 5_000_000, started_at: new Date().toISOString() });
    const { call } = script([]);

    const result = await advanceRun(db, "run-1", { deadlineAt: later(), call });

    expect(result.status).toBe("paused_budget");
    expect(run().status).toBe("paused_budget");
    expect(call).not.toHaveBeenCalled();
  });

  it("adds what each model call cost to the run", async () => {
    const { db, run } = setup();
    const { call } = script([reply([text("done")], "end_turn")]);

    await advanceRun(db, "run-1", { deadlineAt: later(), call });

    // 1000 input at $2 per million + 100 output at $10 per million = $0.003.
    expect(run().cost_micro_usd).toBe(3000);
    expect(mocks.recordAiUsageAsync).toHaveBeenCalledWith(expect.objectContaining({ slug: "crew-follow-through", inputTokens: 1000, outputTokens: 100 }));
  });

  it("stops after the maximum number of steps", async () => {
    const { db, run, tables } = setup();
    tables.ai_runs[0].steps_taken = MAX_STEPS_PER_RUN;
    tables.ai_runs[0].transcript = [{ role: "user", content: "Start your shift." }];
    const { call } = script([]);

    const result = await advanceRun(db, "run-1", { deadlineAt: later(), call });

    expect(MAX_STEPS_PER_RUN).toBe(24);
    expect(result.status).toBe("stopped");
    expect(run().status).toBe("stopped");
    expect(call).not.toHaveBeenCalled();
  });

  it("a refusal ends the run as failed and records the category", async () => {
    const { db, run } = setup();
    const { call } = script([reply([], "refusal", { stop_details: { type: "refusal", category: "cyber", explanation: "x" } })]);

    const result = await advanceRun(db, "run-1", { deadlineAt: later(), call });

    expect(result.status).toBe("failed");
    expect(String(run().error)).toMatch(/cyber/);
  });

  it("appends response content unchanged, thinking blocks included", async () => {
    const { db, run } = setup();
    const blocks = [thinking("weighing who to contact"), text("done")];
    const { call } = script([reply(blocks, "end_turn")]);

    await advanceRun(db, "run-1", { deadlineAt: later(), call });

    const transcript = run().transcript as Anthropic.MessageParam[];
    expect(transcript[transcript.length - 1]).toEqual({ role: "assistant", content: blocks });
  });

  it("never rewrites earlier turns", async () => {
    const { db, run } = setup();
    const { call } = script([reply([use("tu-1", "list_leads_needing_attention", {})], "tool_use"), reply([text("done")], "end_turn")]);

    await advanceRun(db, "run-1", { deadlineAt: later(), call, maxModelCalls: 1 });
    const before = JSON.stringify((run().transcript as unknown[]).slice(0, 3));
    await advanceRun(db, "run-1", { deadlineAt: later(), call });

    expect(JSON.stringify((run().transcript as unknown[]).slice(0, 3))).toBe(before);
  });

  it("does nothing to a run that is already finished", async () => {
    const { db, tables } = setup();
    tables.ai_runs[0].status = "done";
    const { call } = script([]);

    const result = await advanceRun(db, "run-1", { deadlineAt: later(), call });

    expect(result.status).toBe("done");
    expect(call).not.toHaveBeenCalled();
  });

  it("reports text and tool activity as it happens", async () => {
    const { db } = setup();
    const { call } = script([reply([text("Checking leads."), use("tu-1", "list_leads_needing_attention", {})], "tool_use"), reply([text("All quiet.")], "end_turn")]);
    const events: string[] = [];

    await advanceRun(db, "run-1", { deadlineAt: later(), call, onEvent: (e) => events.push(e.type === "text" ? `text:${e.text}` : `tool:${e.tool}`) });

    expect(events).toEqual(["text:Checking leads.", "tool:list_leads_needing_attention", "text:All quiet."]);
  });
});
