import { describe, expect, it } from "vitest";
import { floorFeed, lastShift, planMoves, replayDelays, type FloorStep } from "../replay";

const step = (over: Partial<FloorStep>): FloorStep => ({
  id: "s", run_id: "run-1", agent_id: "a-ft", seq: 1, kind: "act", tool: "send_lead_email", station: "inbox", summary: "sent the follow-up", created_at: "2026-11-20T09:00:00.000Z", payload: {},
  ...over,
});

describe("planMoves", () => {
  it("an empty log yields no moves", () => {
    expect(planMoves([])).toEqual([]);
  });

  it("yields one move per step, oldest first", () => {
    const moves = planMoves([
      step({ id: "b", seq: 2, station: "inbox", summary: "sent", created_at: "2026-11-20T09:00:05.000Z" }),
      step({ id: "a", seq: 1, station: "crm", kind: "read", summary: "read the lead", created_at: "2026-11-20T09:00:01.000Z" }),
    ]);
    expect(moves.map((m) => [m.station, m.summary, m.kind])).toEqual([["crm", "read the lead", "read"], ["inbox", "sent", "act"]]);
    expect(moves[0]).toMatchObject({ agentId: "a-ft", at: Date.parse("2026-11-20T09:00:01.000Z") });
  });

  it("skips steps that happened nowhere on the floor", () => {
    const moves = planMoves([step({ id: "a", station: null, kind: "report", summary: "shift over" }), step({ id: "b", station: "bank" })]);
    expect(moves).toHaveLength(1);
    expect(moves[0].station).toBe("bank");
  });

  it("keeps the order the bot worked in when two steps share a timestamp", () => {
    const at = "2026-11-20T09:00:00.000Z";
    const moves = planMoves([step({ id: "b", seq: 2, summary: "second", created_at: at }), step({ id: "a", seq: 1, summary: "first", created_at: at })]);
    expect(moves.map((m) => m.summary)).toEqual(["first", "second"]);
  });

  it("carries a refusal with its reason", () => {
    const [move] = planMoves([step({ kind: "refused", summary: "did not email Ana: too soon", payload: { reason: "too_soon" } })]);
    expect(move).toMatchObject({ kind: "refused", summary: "did not email Ana: too soon" });
  });
});

describe("lastShift", () => {
  it("is empty for an empty log", () => {
    expect(lastShift([])).toEqual([]);
  });

  it("returns only the steps of the most recent run that finished with a report", () => {
    const steps = [
      step({ id: "1", run_id: "run-old", created_at: "2026-11-19T09:00:00.000Z" }),
      step({ id: "2", run_id: "run-old", kind: "report", station: null, created_at: "2026-11-19T09:01:00.000Z" }),
      step({ id: "3", run_id: "run-new", created_at: "2026-11-20T09:00:00.000Z" }),
      step({ id: "4", run_id: "run-new", kind: "report", station: null, created_at: "2026-11-20T09:02:00.000Z" }),
      step({ id: "5", run_id: "run-open", created_at: "2026-11-20T10:00:00.000Z" }),
    ];
    expect(lastShift(steps).map((s) => s.id)).toEqual(["3", "4"]);
  });

  it("is empty when no run has finished", () => {
    expect(lastShift([step({ id: "1", run_id: "run-open" })])).toEqual([]);
  });
});

describe("replayDelays", () => {
  it("keeps the recorded spacing but never waits more than four seconds", () => {
    const moves = planMoves([
      step({ id: "a", seq: 1, created_at: "2026-11-20T09:00:00.000Z" }),
      step({ id: "b", seq: 2, created_at: "2026-11-20T09:00:01.500Z" }),
      step({ id: "c", seq: 3, created_at: "2026-11-20T09:05:00.000Z" }),
    ]);
    expect(replayDelays(moves)).toEqual([0, 1500, 4000]);
  });

  it("gives every move at least a moment on screen", () => {
    const at = "2026-11-20T09:00:00.000Z";
    const moves = planMoves([step({ id: "a", seq: 1, created_at: at }), step({ id: "b", seq: 2, created_at: at })]);
    expect(replayDelays(moves)).toEqual([0, 900]);
  });
});

describe("floorFeed", () => {
  it("is the moves plus each report, which goes to the lead rather than a station", () => {
    const feed = floorFeed([
      step({ id: "a", seq: 1, station: "crm", kind: "read", created_at: "2026-11-20T09:00:00.000Z" }),
      step({ id: "b", seq: 2, station: null, kind: "report", summary: "two follow-ups sent", created_at: "2026-11-20T09:00:09.000Z" }),
      step({ id: "c", seq: 3, station: null, kind: "read", summary: "nowhere", created_at: "2026-11-20T09:00:10.000Z" }),
    ]);
    expect(feed.map((m) => [m.id, m.station, m.kind])).toEqual([["a", "crm", "read"], ["b", null, "report"]]);
  });
});
