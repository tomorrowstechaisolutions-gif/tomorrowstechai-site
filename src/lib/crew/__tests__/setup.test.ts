import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

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

import { confirmPlaybook, setAgentPaused, setCrewPaused } from "../setup";
import { TOOLS, toolsFor, type ToolContext } from "../tools";
import type { Agent, Business, Run } from "../types";

const business: Business = { id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "setup", playbook: null, playbook_confirmed_at: null, caps: { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 } };
const tess: Agent = { id: "agent-tess", slug: "tess", name: "Tess", rank: "lead", desk: null, business_id: "biz-1", model: "claude-opus-5-5", schedule_minutes: null, paused: false, last_shift_at: null };
const playbook = { sells_to: "Contractors in Central Texas", offers: ["Classic Business Website"], voice: "Plain and direct", off_limits: ["No discounts"], channels: ["email", "linkedin"] };
const saved = { sellsTo: "x", offers: [], voice: "y", offLimits: [], channels: [] };

function setup(over: Partial<Tables> = {}) {
  const fake = fakeSupabase({
    ai_businesses: [{ ...business }], ai_goals: [], ai_rules: [], ai_steps: [],
    ai_crew_state: [{ id: true, paused: false }], ai_agents: [{ ...tess }, { id: "agent-ft", slug: "follow-through", paused: false }],
    ai_runs: [{ id: "run-1", agent_id: "agent-tess", business_id: "biz-1", trigger: "chat", status: "running", transcript: [], steps_taken: 0, cost_micro_usd: 0 }],
    ...over,
  });
  const ctx = (id: string): ToolContext => ({ sb: fake.db, run: fake.tables.ai_runs[0] as unknown as Run, agent: tess, business, goals: [], toolUseId: id });
  return { ...fake, ctx };
}

describe("the setup tools", () => {
  it("only Tess has them", () => {
    const names = (s: Parameters<typeof toolsFor>[0]) => toolsFor(s).map((t) => t.name);
    for (const name of ["save_playbook", "set_target", "add_rule"]) {
      expect(names("tess")).toContain(name);
      expect(names("follow-through")).not.toContain(name);
    }
  });

  it("save_playbook stores the playbook and leaves the business in setup", async () => {
    const { ctx, tables } = setup();
    const r = await TOOLS.save_playbook.run(ctx("tu-1"), playbook);

    expect(r.ok).toBe(true);
    expect(tables.ai_businesses[0].mode).toBe("setup");
    expect(tables.ai_businesses[0].playbook).toEqual({ sellsTo: "Contractors in Central Texas", offers: ["Classic Business Website"], voice: "Plain and direct", offLimits: ["No discounts"], channels: ["email", "linkedin"] });
  });

  it("saving a new playbook clears an earlier confirmation", async () => {
    const { ctx, tables } = setup({ ai_businesses: [{ ...business, mode: "launch", playbook_confirmed_at: "2026-11-01T00:00:00Z" }] });
    await TOOLS.save_playbook.run(ctx("tu-1"), playbook);

    expect(tables.ai_businesses[0].mode).toBe("setup");
    expect(tables.ai_businesses[0].playbook_confirmed_at).toBeNull();
  });

  it("set_target writes one goal for the current month and replaces it on a second call", async () => {
    const { ctx, tables } = setup();
    await TOOLS.set_target.run(ctx("tu-1"), { metric: "qualified_leads", target: 10 });
    await TOOLS.set_target.run(ctx("tu-2"), { metric: "qualified_leads", target: 12 });

    expect(tables.ai_goals).toHaveLength(1);
    expect(tables.ai_goals[0]).toMatchObject({ business_id: "biz-1", metric: "qualified_leads", target: 12 });
    expect(String(tables.ai_goals[0].period_start)).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("add_rule saves a correction for every bot", async () => {
    const { ctx, tables } = setup();
    const r = await TOOLS.add_rule.run(ctx("tu-1"), { rule: "Never open an email with a line about hoping it finds them well." });

    expect(r.ok).toBe(true);
    expect(tables.ai_rules[0]).toMatchObject({ scope: "all", active: true, text: "Never open an email with a line about hoping it finds them well." });
  });
});

describe("confirmPlaybook", () => {
  it("refuses when there is no playbook", async () => {
    const { db, tables } = setup();
    await expect(confirmPlaybook(db, "biz-1")).rejects.toThrow(/playbook/i);
    expect(tables.ai_businesses[0].mode).toBe("setup");
  });

  it("refuses when there is a playbook but no target", async () => {
    const { db, tables } = setup({ ai_businesses: [{ ...business, playbook: saved }] });
    await expect(confirmPlaybook(db, "biz-1")).rejects.toThrow(/target/i);
    expect(tables.ai_businesses[0].mode).toBe("setup");
  });

  it("with a playbook and a target it puts the business into launch mode", async () => {
    const { db, tables } = setup({
      ai_businesses: [{ ...business, playbook: saved }],
      ai_goals: [{ id: "g1", business_id: "biz-1", metric: "sales", target: 2, period_start: "2026-11-01", period_end: "2099-12-31" }],
    });
    await confirmPlaybook(db, "biz-1");

    expect(tables.ai_businesses[0].mode).toBe("launch");
    expect(tables.ai_businesses[0].playbook_confirmed_at).toEqual(expect.any(String));
  });
});

describe("pausing", () => {
  it("pauses and resumes the whole crew", async () => {
    const { db, tables } = setup();
    await setCrewPaused(db, true);
    expect(tables.ai_crew_state[0].paused).toBe(true);
    await setCrewPaused(db, false);
    expect(tables.ai_crew_state[0].paused).toBe(false);
  });

  it("pauses one bot without touching the others", async () => {
    const { db, tables } = setup();
    await setAgentPaused(db, "follow-through", true);
    expect(tables.ai_agents.find((a) => a.slug === "follow-through")?.paused).toBe(true);
    expect(tables.ai_agents.find((a) => a.slug === "tess")?.paused).toBe(false);
  });
});
