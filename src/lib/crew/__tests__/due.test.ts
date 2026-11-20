import { describe, expect, it } from "vitest";
import { dueAgents } from "../due";
import type { Agent } from "../types";

const NOW = 1_800_000_000_000;
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const bot = (over: Partial<Agent> = {}): Agent => ({
  id: "a1", slug: "follow-through", name: "Follow-through", rank: "desk", desk: "sales", business_id: "biz-1",
  model: "claude-sonnet-5-5", schedule_minutes: 120, paused: false, last_shift_at: ago(121), ...over,
});

describe("dueAgents", () => {
  it("is due once its interval has passed", () => {
    expect(dueAgents([bot()], [], NOW).map((a) => a.id)).toEqual(["a1"]);
  });

  it("is not due before its interval has passed", () => {
    expect(dueAgents([bot({ last_shift_at: ago(119) })], [], NOW)).toEqual([]);
  });

  it("is due when it has never run", () => {
    expect(dueAgents([bot({ last_shift_at: null })], [], NOW)).toHaveLength(1);
  });

  it("is not due while one of its runs is still going or waiting", () => {
    expect(dueAgents([bot()], [{ agent_id: "a1", status: "waiting" }], NOW)).toEqual([]);
    expect(dueAgents([bot()], [{ agent_id: "a1", status: "running" }], NOW)).toEqual([]);
    expect(dueAgents([bot()], [{ agent_id: "a1", status: "paused_budget" }], NOW)).toEqual([]);
  });

  it("is due again once its last run has finished", () => {
    expect(dueAgents([bot()], [{ agent_id: "a1", status: "done" }], NOW)).toHaveLength(1);
  });

  it("is never due while paused", () => {
    expect(dueAgents([bot({ paused: true })], [], NOW)).toEqual([]);
  });

  it("a bot with no schedule, like Tess, is never due", () => {
    expect(dueAgents([bot({ slug: "tess", schedule_minutes: null, last_shift_at: null })], [], NOW)).toEqual([]);
  });

  it("another bot's unfinished run does not hold this one back", () => {
    expect(dueAgents([bot()], [{ agent_id: "someone-else", status: "running" }], NOW)).toHaveLength(1);
  });
});
