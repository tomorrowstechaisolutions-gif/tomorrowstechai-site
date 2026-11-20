import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { chatArchive } from "../chat";

const run = (id: string, startedAt: string, lines: [string, string][], over: Record<string, unknown> = {}) => ({
  id, agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "done", started_by: "user-1", steps_taken: 1, cost_micro_usd: 0,
  started_at: startedAt, finished_at: startedAt,
  transcript: [
    { role: "user", content: [{ type: "text", text: "<brief>\nBRIEF\n</brief>" }, { type: "text", text: "<how_to_answer>\nmode\n</how_to_answer>" }, { type: "text", text: lines[0][1] }] },
    ...lines.slice(1).map(([role, text]) => ({ role: role === "tess" ? "assistant" : "user", content: [{ type: "text", text }] })),
  ],
  ...over,
});

describe("the archive of John's chats with Tess", () => {
  it("groups conversations by the Chicago day they started, newest day first", async () => {
    const { db } = fakeSupabase({
      ai_runs: [
        run("r1", "2026-11-19T15:00:00.000Z", [["john", "Morning"], ["tess", "Morning, John."]]),
        // 03:30 UTC on the 21st is still the evening of the 20th in Chicago.
        run("r2", "2026-11-21T03:30:00.000Z", [["john", "Late one"], ["tess", "Still here."]]),
        run("r3", "2026-11-20T15:00:00.000Z", [["john", "Where are we?"], ["tess", "Two leads."]]),
      ],
    });
    const days = await chatArchive(db, "user-1");
    expect(days.map((d) => d.date)).toEqual(["2026-11-20", "2026-11-19"]);
    expect(days[0].lines.map((l) => l.text)).toEqual(["Where are we?", "Two leads.", "Late one", "Still here."]);
  });

  it("leaves out the brief and her settings, which John never said", async () => {
    const { db } = fakeSupabase({ ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", [["john", "Morning"], ["tess", "Hi."]])] });
    const days = await chatArchive(db, "user-1");
    expect(days[0].lines).toEqual([{ role: "john", text: "Morning" }, { role: "tess", text: "Hi." }]);
  });

  it("shows only this admin's chats, and no crew shifts", async () => {
    const { db } = fakeSupabase({
      ai_runs: [
        run("r1", "2026-11-19T15:00:00.000Z", [["john", "Mine"], ["tess", "Yes."]]),
        run("r2", "2026-11-19T16:00:00.000Z", [["john", "Someone else"], ["tess", "No."]], { started_by: "user-2" }),
        run("r3", "2026-11-19T17:00:00.000Z", [["john", "Start your shift."], ["tess", "Done."]], { trigger: "shift", started_by: null }),
      ],
    });
    const days = await chatArchive(db, "user-1");
    expect(days).toHaveLength(1);
    expect(days[0].lines.map((l) => l.text)).toEqual(["Mine", "Yes."]);
  });

  it("skips a day where nothing was actually said", async () => {
    const { db } = fakeSupabase({ ai_runs: [run("r1", "2026-11-19T15:00:00.000Z", [["john", "John has just opened the Tess tab."]])] });
    expect(await chatArchive(db, "user-1")).toEqual([]);
  });
});
