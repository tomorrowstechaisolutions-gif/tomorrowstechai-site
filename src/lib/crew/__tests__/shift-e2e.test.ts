import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

/**
 * One whole Follow-through shift, from the cron's entry point to the report,
 * with a scripted model and a fake database. Everything in between is real:
 * the scheduler, the run loop, the tools, the gate and the step log.
 */

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn<(mail: { text: string; to: { email: string }[] }) => Promise<{ id: string; threadId: string }>>(async () => ({ id: "gm-1", threadId: "th-1" })),
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
vi.mock("@/lib/ai/record", () => ({ recordAiUsageAsync: vi.fn() }));

import { startRun } from "../log";
import { advanceRun, type ModelCall } from "../run";
import { runShifts } from "../shifts";
import { SIGNATURE } from "../tools";
import type { Agent } from "../types";

type Block = Anthropic.ContentBlock;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Block;
const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input }) as unknown as Block;
const reply = (content: Block[], stop: string): Anthropic.Message =>
  ({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-5-5", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 100 } }) as unknown as Anthropic.Message;

const email = { lead_id: "lead-1", subject: "Following up on your roofing site", body: "Hi Ana,\nChecking in on the site we talked about.", goal_id: "g1", expectation: "A reply inside 3 days" };

/** The model's side of one shift: list, read, email, report, sign off. */
function shiftScript(prefix: string): ModelCall {
  const replies = [
    reply([toolUse(`${prefix}-1`, "list_leads_needing_attention", {})], "tool_use"),
    reply([toolUse(`${prefix}-2`, "read_lead", { lead_id: "lead-1" })], "tool_use"),
    reply([toolUse(`${prefix}-3`, "send_lead_email", email)], "tool_use"),
    reply([toolUse(`${prefix}-4`, "report", { summary: "Worked one lead." })], "tool_use"),
    reply([text("Done.")], "end_turn"),
  ];
  return async () => {
    const next = replies.shift();
    if (!next) throw new Error("the script ran out of replies");
    return next;
  };
}

const agent: Agent = { id: "agent-ft", slug: "follow-through", name: "Follow-through", rank: "desk", desk: "sales", business_id: "biz-1", model: "claude-sonnet-5-5", schedule_minutes: 120, paused: false, last_shift_at: null };

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({
    ai_crew_state: [{ id: true, paused: false }],
    ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "launch", playbook: null, playbook_confirmed_at: "2026-11-01T00:00:00Z", caps: { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 } }],
    ai_goals: [{ id: "g1", business_id: "biz-1", metric: "booked_calls", target: 4, period_start: "2026-11-01", period_end: "2099-12-31" }],
    ai_agents: [{ ...agent }],
    ai_runs: [], ai_steps: [], ai_rules: [], ai_actions: [], lead_events: [],
    leads: [{ id: "lead-1", first_name: "Ana", last_name: "Reyes", email: "ana@example.com", business_name: "Reyes Roofing", do_not_contact: false, unsubscribed_at: null, last_contacted_at: null, lead_status: "Contacted" }],
    ...over,
  });
}

const later = () => Date.now() + 60_000;

beforeEach(() => mocks.sendMail.mockClear());

describe("a Follow-through shift, end to end", () => {
  it("lists, reads, sends one email signed as Tess, and reports", async () => {
    const { db, tables } = setup();
    const result = await runShifts(db, { deadlineAt: later(), call: shiftScript("a") });

    expect(result).toEqual({ advanced: 0, started: 1 });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.to[0].email).toBe("ana@example.com");
    expect(mail.text.trim().endsWith(SIGNATURE)).toBe(true);

    expect(tables.ai_steps.map((s) => s.kind)).toEqual(["read", "read", "act", "report"]);
    // The report is made to Tess, not at a station.
    expect(tables.ai_steps.map((s) => s.station)).toEqual(["crm", "crm", "inbox", null]);
    expect(tables.ai_steps.map((s) => s.seq)).toEqual([1, 2, 3, 4]);
    expect(tables.ai_steps[2]).toMatchObject({ goal_id: "g1", expectation: "A reply inside 3 days" });
    expect(tables.ai_runs[0]).toMatchObject({ status: "done", trigger: "shift", steps_taken: 4 });
    expect(tables.ai_agents[0].last_shift_at).toEqual(expect.any(String));
  });

  it("a second shift the same day will not email the same lead again", async () => {
    const { db, tables } = setup();
    await runShifts(db, { deadlineAt: later(), call: shiftScript("a") });
    // Make the bot due again without moving the clock.
    tables.ai_agents[0].last_shift_at = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const second = await runShifts(db, { deadlineAt: later(), call: shiftScript("b") });

    expect(second.started).toBe(1);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const refused = tables.ai_steps.filter((s) => s.kind === "refused");
    expect(refused).toHaveLength(1);
    expect((refused[0].payload as { reason: string }).reason).toBe("too_soon");
    expect(tables.ai_runs[1].status).toBe("done");
  });

  it("does not start a shift at all while the business is still being set up", async () => {
    const { db, tables } = setup({ ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "setup", playbook: null, playbook_confirmed_at: null, caps: { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 } }] });
    const result = await runShifts(db, { deadlineAt: later(), call: shiftScript("a") });

    expect(result).toEqual({ advanced: 0, started: 0 });
    expect(tables.ai_runs).toHaveLength(0);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("and if a run exists for a business in setup anyway, the gate still sends nothing", async () => {
    const { db, tables } = setup({ ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "setup", playbook: null, playbook_confirmed_at: null, caps: { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 } }] });
    const run = await startRun(db, { agent, businessId: "biz-1", trigger: "shift" });
    await advanceRun(db, run.id, { deadlineAt: later(), call: shiftScript("a") });

    expect(mocks.sendMail).not.toHaveBeenCalled();
    const refused = tables.ai_steps.filter((s) => s.kind === "refused");
    expect(refused).toHaveLength(1);
    expect((refused[0].payload as { reason: string }).reason).toBe("not_launched");
  });

  it("a paused crew starts nothing", async () => {
    const { db, tables } = setup({ ai_crew_state: [{ id: true, paused: true }] });
    expect(await runShifts(db, { deadlineAt: later(), call: shiftScript("a") })).toEqual({ advanced: 0, started: 0 });
    expect(tables.ai_runs).toHaveLength(0);
  });
});
