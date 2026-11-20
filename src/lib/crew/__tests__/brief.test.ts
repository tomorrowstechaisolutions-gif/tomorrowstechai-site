import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dashboard/advisor-context", () => ({ buildAdvisorContext: vi.fn(async () => ({ asOf: "now", snapshot: "SNAPSHOT TEXT" })) }));

import { briefText, buildBrief, visitSince } from "../brief";

const SINCE = "2026-11-19T12:00:00.000Z";
const caps = { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 };

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({
    ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "launch", playbook: { sellsTo: "x", offers: [], voice: "y", offLimits: [], channels: [] }, playbook_confirmed_at: "2026-11-01T00:00:00Z", caps }],
    ai_agents: [
      { id: "a-tess", slug: "tess", name: "Tess", rank: "lead", paused: false },
      { id: "a-ft", slug: "follow-through", name: "Follow-through", rank: "desk", paused: false },
      { id: "a-fin", slug: "finance", name: "Finance", rank: "function", paused: true },
    ],
    ai_goals: [{ id: "g1", business_id: "biz-1", metric: "qualified_leads", target: 10, period_start: "2026-11-01", period_end: "2099-12-31" }],
    ai_runs: [{ id: "run-1", agent_id: "a-ft", business_id: "biz-1", trigger: "shift", status: "running", started_at: "2026-11-20T09:00:00.000Z", cost_micro_usd: 0 }],
    ai_steps: [
      { id: "s0", run_id: "run-0", agent_id: "a-ft", kind: "act", tool: "send_lead_email", summary: "sent an old follow-up", created_at: "2026-11-18T09:00:00.000Z" },
      { id: "s1", run_id: "run-1", agent_id: "a-ft", kind: "read", tool: "read_lead", summary: "read Reyes Roofing", created_at: "2026-11-20T09:00:01.000Z" },
      { id: "s2", run_id: "run-1", agent_id: "a-ft", kind: "act", tool: "send_lead_email", summary: "sent the follow-up to Reyes Roofing", created_at: "2026-11-20T09:00:05.000Z" },
    ],
    ai_actions: [
      { id: "act-1", title: "Refund ROMAR $49", status: "proposed", proposed_by: "ai", created_at: "2026-11-20T08:00:00Z" },
      { id: "act-2", title: "Old approved thing", status: "approved", proposed_by: "ai", created_at: "2026-11-10T08:00:00Z" },
    ],
    ai_rules: [{ id: "r1", text: "No hype.", scope: "all", active: true }, { id: "r2", text: "Old.", scope: "all", active: false }],
    ai_crew_state: [{ id: true, paused: false }],
    leads: [
      { id: "l1", lead_status: "Qualified", created_at: "2026-11-05T00:00:00Z" },
      { id: "l2", lead_status: "New", created_at: "2026-11-06T00:00:00Z" },
      { id: "l3", lead_status: "Won", created_at: "2026-10-06T00:00:00Z" },
    ],
    ai_visits: [],
    ...over,
  });
}

describe("buildBrief", () => {
  it("lists only what the crew did after John's last visit, and leaves out look-ups", async () => {
    const { db } = setup();
    const brief = await buildBrief(db, SINCE);

    expect(brief.didWhileOut.map((d) => d.summary)).toEqual(["sent the follow-up to Reyes Roofing"]);
    expect(brief.didWhileOut[0]).toMatchObject({ agent: "Follow-through", kind: "act" });
    expect(brief.since).toBe(SINCE);
  });

  it("says setup is needed while the business is in setup", async () => {
    const { db } = setup({ ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "setup", playbook: null, playbook_confirmed_at: null, caps }] });
    expect((await buildBrief(db, SINCE)).setupNeeded).toBe(true);
    expect((await buildBrief(setup().db, SINCE)).setupNeeded).toBe(false);
  });

  it("lists what is waiting on John: proposed items only", async () => {
    const brief = await buildBrief(setup().db, SINCE);
    expect(brief.needsJohn).toEqual([{ id: "act-1", title: "Refund ROMAR $49" }]);
  });

  it("counts progress toward a target from this period only, and admits what it cannot measure", async () => {
    const { db } = setup({
      ai_goals: [
        { id: "g1", business_id: "biz-1", metric: "qualified_leads", target: 10, period_start: "2026-11-01", period_end: "2099-12-31" },
        { id: "g2", business_id: "biz-1", metric: "site_visitors", target: 500, period_start: "2026-11-01", period_end: "2099-12-31" },
      ],
    });
    const brief = await buildBrief(db, SINCE);
    expect(brief.targets).toEqual([
      { metric: "qualified_leads", current: 1, target: 10 },
      { metric: "site_visitors", current: null, target: 500 },
    ]);
  });

  it("shows which bots are working and what on", async () => {
    const brief = await buildBrief(setup().db, SINCE);
    const ft = brief.crew.find((c) => c.slug === "follow-through");
    expect(ft).toMatchObject({ working: true, doing: "sent the follow-up to Reyes Roofing", paused: false });
    expect(brief.crew.find((c) => c.slug === "finance")).toMatchObject({ working: false, doing: null, paused: true });
    expect(brief.crew.some((c) => c.slug === "tess")).toBe(false);
  });

  it("carries the spend, the cap, the rule count and the business snapshot", async () => {
    const brief = await buildBrief(setup().db, SINCE);
    expect(brief).toMatchObject({ capCents: 500, spendCentsToday: 0, rulesCount: 1, snapshot: "SNAPSHOT TEXT", crewPaused: false });
  });

  it("reads as plain text for Tess, with the setup instruction first when setup is needed", async () => {
    const launched = briefText(await buildBrief(setup().db, SINCE));
    expect(launched).toContain("sent the follow-up to Reyes Roofing");
    expect(launched).toContain("Refund ROMAR $49");
    expect(launched).toContain("SNAPSHOT TEXT");

    const { db } = setup({ ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "setup", playbook: null, playbook_confirmed_at: null, caps }] });
    expect(briefText(await buildBrief(db, SINCE))).toMatch(/no confirmed playbook/i);
  });
});

describe("visitSince", () => {
  const NOW = Date.parse("2026-11-20T14:00:00.000Z");

  it("a first visit looks back one day", async () => {
    const { db, tables } = setup();
    expect(await visitSince(db, "user-1", NOW)).toBe("2026-11-19T14:00:00.000Z");
    expect(tables.ai_visits[0]).toMatchObject({ user_id: "user-1", last_seen: "2026-11-20T14:00:00.000Z" });
  });

  it("a new visit hours later looks back to the previous one", async () => {
    const { db, tables } = setup({ ai_visits: [{ user_id: "user-1", last_seen: "2026-11-19T22:00:00.000Z", previous_seen: null }] });
    expect(await visitSince(db, "user-1", NOW)).toBe("2026-11-19T22:00:00.000Z");
    expect(tables.ai_visits[0]).toMatchObject({ last_seen: "2026-11-20T14:00:00.000Z", previous_seen: "2026-11-19T22:00:00.000Z" });
  });

  it("refreshing the page a few minutes later does not move the mark", async () => {
    const { db, tables } = setup({ ai_visits: [{ user_id: "user-1", last_seen: "2026-11-20T13:50:00.000Z", previous_seen: "2026-11-19T22:00:00.000Z" }] });
    expect(await visitSince(db, "user-1", NOW)).toBe("2026-11-19T22:00:00.000Z");
    expect(tables.ai_visits[0].last_seen).toBe("2026-11-20T13:50:00.000Z");
  });
});
