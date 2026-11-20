import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn<(mail: { text: string; to: { email: string }[]; subject: string }) => Promise<{ id: string; threadId: string }>>(async () => ({ id: "gm-1", threadId: "th-1" })),
  gmailProfile: vi.fn(async () => ({ emailAddress: "john@example.test", messagesTotal: 0, threadsTotal: 0 })),
  listThreads: vi.fn(async () => ({ threads: [], nextPageToken: null, estimate: 0 })),
  getThread: vi.fn(),
  blocked: new Map<string, string>(),
  createArticleSocialDraft: vi.fn(async () => ({ state: "posted", postId: "post-1", platforms: ["linkedin", "facebook"], published: 2, failed: 0, errors: [] })),
  getArticle: vi.fn(async () => ({ slug: "ai-roi-gap", title: "The AI ROI Gap", summary: "s", tags: [], hero: null })),
  sendInvoiceReminder: vi.fn(async () => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google/gmail", () => ({ sendMail: mocks.sendMail, gmailProfile: mocks.gmailProfile, listThreads: mocks.listThreads, getThread: mocks.getThread }));
vi.mock("@/lib/email-marketing/suppression", () => ({ loadSuppression: vi.fn(async () => ({ blocked: mocks.blocked })) }));
vi.mock("@/lib/dashboard/sales", () => ({ loadLeadsNeedingAttention: vi.fn(async () => []) }));
vi.mock("@/lib/blog/social-draft", () => ({ createArticleSocialDraft: mocks.createArticleSocialDraft }));
vi.mock("@/lib/blog/repository", () => ({ getArticle: mocks.getArticle, getListedArticles: vi.fn(async () => []) }));
vi.mock("@/lib/social/publisher", () => ({ publishDueSocialPosts: vi.fn(async () => ({ published: 0, failed: 0, errors: [] })) }));
vi.mock("@/lib/invoices/emails", () => ({ sendInvoiceReminder: mocks.sendInvoiceReminder }));
vi.mock("@/lib/invoices/queries", () => ({ loadInvoiceWorkspace: vi.fn(async () => ({ rows: [], summary: {} })) }));
vi.mock("@/lib/finance/overview", () => ({ loadFinanceOverview: vi.fn(async () => ({})) }));

import { SIGNATURE, TOOLS, toolsFor, type ToolContext } from "../tools";
import type { Agent, Business, Goal, Run } from "../types";

const business: Business = {
  id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "launch", playbook: null, playbook_confirmed_at: "2026-11-20T00:00:00Z",
  caps: { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 },
};
const agent: Agent = { id: "agent-ft", slug: "follow-through", name: "Follow-through", rank: "desk", desk: "sales", business_id: "biz-1", model: "claude-sonnet-5-5", schedule_minutes: 120, paused: false, last_shift_at: null };
const goals: Goal[] = [{ id: "g1", business_id: "biz-1", metric: "booked_calls", target: 4, period_start: "2026-11-01", period_end: "2026-11-30" }];

function setup(over: Partial<Tables> = {}, biz: Business = business) {
  const fake = fakeSupabase({
    ai_crew_state: [{ id: true, paused: false }],
    ai_runs: [{ id: "run-1", agent_id: "agent-ft", business_id: "biz-1", trigger: "shift", status: "running", transcript: [], steps_taken: 0, cost_micro_usd: 0, started_at: new Date().toISOString() }],
    ai_steps: [], ai_actions: [], lead_events: [],
    leads: [{ id: "lead-1", first_name: "Ana", last_name: "Reyes", email: "ana@example.com", business_name: "Reyes Roofing", do_not_contact: false, unsubscribed_at: null, last_contacted_at: "2026-11-01T00:00:00.000Z", lead_status: "Contacted" }],
    ...over,
  });
  const run = fake.tables.ai_runs[0] as unknown as Run;
  const ctx = (toolUseId: string): ToolContext => ({ sb: fake.db, run, agent, business: biz, goals, toolUseId });
  return { ...fake, ctx };
}

const emailInput = { lead_id: "lead-1", subject: "Following up", body: "Hi Ana,\nChecking in on the roofing site.", goal_id: "g1", expectation: "A reply inside 3 days" };

beforeEach(() => {
  mocks.sendMail.mockClear();
  mocks.createArticleSocialDraft.mockClear();
  mocks.sendInvoiceReminder.mockClear();
  mocks.blocked.clear();
});

describe("send_lead_email", () => {
  it("sends once, signs as Tess, and logs an act step at the inbox", async () => {
    const { ctx, tables } = setup();
    const r = await TOOLS.send_lead_email.run(ctx("tu-1"), emailInput);

    expect(r.ok).toBe(true);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.text.trim().endsWith(SIGNATURE)).toBe(true);
    expect(mail.to[0].email).toBe("ana@example.com");
    expect(tables.ai_steps).toHaveLength(1);
    expect(tables.ai_steps[0]).toMatchObject({ kind: "act", station: "inbox", goal_id: "g1", tool: "send_lead_email" });
    expect(tables.lead_events[0]).toMatchObject({ lead_id: "lead-1", type: "email_sent", actor: "tess" });
    expect(tables.leads[0].last_contacted_at).not.toBe("2026-11-01T00:00:00.000Z");
  });

  it("uses the exact signature the design fixed", () => {
    expect(SIGNATURE).toBe("Tess, AI assistant to John Hockinson, Tomorrow's Tech AI");
  });

  it("does not send to a suppressed address and logs the refusal", async () => {
    const { ctx, tables } = setup();
    mocks.blocked.set("ana@example.com", "unsubscribed");
    const r = await TOOLS.send_lead_email.run(ctx("tu-1"), emailInput);

    expect(r.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(tables.ai_steps[0]).toMatchObject({ kind: "refused", station: "inbox" });
    expect((tables.ai_steps[0].payload as { reason: string }).reason).toBe("suppressed");
  });

  it("does not send when the lead has no email", async () => {
    const { ctx, tables } = setup({ leads: [{ id: "lead-1", first_name: "Natosha", last_name: "White", email: "", do_not_contact: false, unsubscribed_at: null, last_contacted_at: null, lead_status: "Contacted" }] });
    const r = await TOOLS.send_lead_email.run(ctx("tu-1"), emailInput);

    expect(r.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(tables.ai_steps[0].kind).toBe("refused");
  });

  it("does not send to a lead marked do-not-contact", async () => {
    const { ctx } = setup({ leads: [{ id: "lead-1", first_name: "A", last_name: "B", email: "ana@example.com", do_not_contact: true, unsubscribed_at: null, last_contacted_at: null, lead_status: "Contacted" }] });
    const r = await TOOLS.send_lead_email.run(ctx("tu-1"), emailInput);
    expect(r.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("running the same tool call twice sends one email", async () => {
    const { ctx } = setup();
    await TOOLS.send_lead_email.run(ctx("tu-1"), emailInput);
    const again = await TOOLS.send_lead_email.run(ctx("tu-1"), emailInput);

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(again.text).toMatch(/already/i);
  });

  it("will not email someone John contacted less than 48 hours ago", async () => {
    const recent = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const { ctx, tables } = setup({ leads: [{ id: "lead-1", first_name: "Ana", last_name: "Reyes", email: "ana@example.com", do_not_contact: false, unsubscribed_at: null, last_contacted_at: recent, lead_status: "Contacted" }] });
    const r = await TOOLS.send_lead_email.run(ctx("tu-1"), emailInput);

    expect(r.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect((tables.ai_steps[0].payload as { reason: string }).reason).toBe("too_soon");
  });

  it("sends nothing while the business is still in setup", async () => {
    const { ctx, tables } = setup({}, { ...business, mode: "setup" });
    const r = await TOOLS.send_lead_email.run(ctx("tu-1"), emailInput);

    expect(r.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect((tables.ai_steps[0].payload as { reason: string }).reason).toBe("not_launched");
  });

  it("treats a goal that is not this business's as no goal", async () => {
    const { ctx, tables } = setup();
    const r = await TOOLS.send_lead_email.run(ctx("tu-1"), { ...emailInput, goal_id: "someone-elses-goal" });

    expect(r.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect((tables.ai_steps[0].payload as { reason: string }).reason).toBe("no_goal");
  });
});

describe("flag_for_john", () => {
  it("writes a proposed item for John and executes nothing", async () => {
    const { ctx, tables } = setup();
    const r = await TOOLS.flag_for_john.run(ctx("tu-9"), { title: "Refund ROMAR $49", why: "They were double charged.", goal_id: "g1", expectation: "John decides" });

    expect(r.ok).toBe(false);
    expect(tables.ai_actions).toHaveLength(1);
    expect(tables.ai_actions[0]).toMatchObject({ status: "proposed", proposed_by: "ai", title: "Refund ROMAR $49" });
    expect(tables.ai_steps[0].kind).toBe("needs_john");
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe("publish_article_post", () => {
  it("publishes through the existing publisher and records the channels", async () => {
    const { ctx, tables } = setup();
    const r = await TOOLS.publish_article_post.run(ctx("tu-2"), { slug: "ai-roi-gap", goal_id: "g1", expectation: "200 views" });

    expect(r.ok).toBe(true);
    expect(mocks.createArticleSocialDraft).toHaveBeenCalledTimes(1);
    expect(tables.ai_steps[0]).toMatchObject({ kind: "act", station: "social" });
    expect((tables.ai_steps[0].payload as { channels: string[] }).channels).toEqual(["linkedin", "facebook"]);
  });
});

describe("the registry", () => {
  it("gives each bot only its own tools", () => {
    const names = (slug: Parameters<typeof toolsFor>[0]) => toolsFor(slug).map((t) => t.name);
    expect(names("finance")).not.toContain("send_lead_email");
    expect(names("finance")).toContain("send_invoice_reminder");
    expect(names("follow-through")).toContain("send_lead_email");
    expect(names("content")).toContain("publish_article_post");
    expect(names("content")).not.toContain("send_invoice_reminder");
  });

  it("every act tool requires a goal and an expectation, and allows nothing extra", () => {
    for (const t of Object.values(TOOLS)) {
      if (t.kind !== "act") continue;
      expect(t.input_schema.required, t.name).toEqual(expect.arrayContaining(["goal_id", "expectation"]));
      expect(t.input_schema.additionalProperties, t.name).toBe(false);
    }
  });

  it("every tool names a station", () => {
    for (const t of Object.values(TOOLS)) expect(t.station, t.name).toBeTruthy();
  });
});
