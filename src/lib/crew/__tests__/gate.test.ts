import { describe, expect, it } from "vitest";
import { checkAction, MIN_EMAIL_GAP_MS, type GateAction, type GateState } from "../gate";

const ok: GateState = {
  crewPaused: false,
  agentPaused: false,
  mode: "launch",
  caps: { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 },
  suppressed: new Set(),
  lastEmailAt: new Map(),
  firstEmailsToday: 0,
  postsToday: {},
  spendCentsToday: 0,
  now: 1_800_000_000_000,
};

const email: GateAction = {
  tool: "send_lead_email",
  agentSlug: "follow-through",
  goalId: "g1",
  expectation: "A reply inside 3 days",
  recipientEmail: "Ana@Example.com",
};

const post: GateAction = { tool: "publish_article_post", agentSlug: "content", goalId: "g1", expectation: "Views", channel: "linkedin" };

describe("checkAction", () => {
  it("allows a goal-backed email in launch mode", () => {
    expect(checkAction(email, ok)).toEqual({ allow: true });
  });

  it("refuses with no goal", () => {
    expect(checkAction({ ...email, goalId: null }, ok)).toMatchObject({ allow: false, reason: "no_goal" });
  });

  it("refuses a blank expectation", () => {
    expect(checkAction({ ...email, expectation: "  " }, ok)).toMatchObject({ allow: false, reason: "no_goal" });
  });

  it("refuses a suppressed address whatever its case", () => {
    expect(checkAction(email, { ...ok, suppressed: new Set(["ana@example.com"]) })).toMatchObject({ allow: false, reason: "suppressed" });
  });

  it("keeps the 48 hour gap as a constant", () => {
    expect(MIN_EMAIL_GAP_MS).toBe(48 * 3_600_000);
  });

  it("refuses a second email inside 48 hours", () => {
    const state = { ...ok, lastEmailAt: new Map([["ana@example.com", ok.now - 47 * 3_600_000]]) };
    expect(checkAction(email, state)).toMatchObject({ allow: false, reason: "too_soon" });
  });

  it("allows it after 48 hours", () => {
    const state = { ...ok, lastEmailAt: new Map([["ana@example.com", ok.now - 49 * 3_600_000]]) };
    expect(checkAction(email, state)).toEqual({ allow: true });
  });

  it("refuses the sixth first-contact email of the day", () => {
    expect(checkAction({ ...email, firstContact: true }, { ...ok, firstEmailsToday: 5 })).toMatchObject({ allow: false, reason: "cap_first_emails" });
  });

  it("does not count a follow-up against the first-contact cap", () => {
    expect(checkAction(email, { ...ok, firstEmailsToday: 5 })).toEqual({ allow: true });
  });

  it("refuses a third post on one channel", () => {
    expect(checkAction(post, { ...ok, postsToday: { linkedin: 2 } })).toMatchObject({ allow: false, reason: "cap_posts" });
  });

  it("allows a post on a channel that still has room", () => {
    expect(checkAction(post, { ...ok, postsToday: { facebook: 2 } })).toEqual({ allow: true });
  });

  it("refuses everything once the day's spend is used", () => {
    expect(checkAction(email, { ...ok, spendCentsToday: 500 })).toMatchObject({ allow: false, reason: "cap_spend" });
  });

  it("refuses while the business is still in setup", () => {
    expect(checkAction(email, { ...ok, mode: "setup" })).toMatchObject({ allow: false, reason: "not_launched" });
  });

  it("refuses in maintenance mode", () => {
    expect(checkAction(email, { ...ok, mode: "maintenance" })).toMatchObject({ allow: false, reason: "not_launched" });
  });

  it("never executes an always-John action", () => {
    expect(checkAction({ ...email, alwaysJohn: true }, ok)).toMatchObject({ allow: false, reason: "always_john" });
  });

  it("reports the crew pause before anything else", () => {
    expect(checkAction({ ...email, goalId: null }, { ...ok, crewPaused: true })).toMatchObject({ allow: false, reason: "crew_paused" });
  });

  it("reports a paused bot", () => {
    expect(checkAction(email, { ...ok, agentPaused: true })).toMatchObject({ allow: false, reason: "agent_paused" });
  });

  it("gives every refusal a sentence a person can read", () => {
    const d = checkAction(email, { ...ok, mode: "setup" });
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.message.length).toBeGreaterThan(20);
  });
});
