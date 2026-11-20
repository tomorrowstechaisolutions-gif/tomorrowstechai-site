import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { cleanScreenChange, screenChangeFromMessage } from "@/components/admin/cc/tess/screenSettings";
import { chatHistory, frameOutdated, openChatTurn } from "../chat";
import { loadTessProfile, saveTessSettings } from "../profile";
import { ROLE } from "../roles";
import { MODES } from "../tess-modes";
import { changeSettings } from "../tools/settings";

const NOW = Date.parse("2026-11-20T14:00:00.000Z");

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({
    ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "launch" }],
    ai_agents: [{ id: "a-tess", slug: "tess", name: "Tess", model: "claude-opus-5-5" }],
    ai_runs: [{ id: "run-1", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "running", started_by: "user-1", steps_taken: 0, started_at: "2026-11-20T13:00:00.000Z", transcript: [] }],
    ai_steps: [],
    ai_tess_profile: [],
    ...over,
  });
}
const ctx = (db: unknown, toolUseId = "tu-1", startedBy: string | null = "user-1") =>
  ({ sb: db, run: { id: "run-1", agent_id: "a-tess", business_id: "biz-1", started_by: startedBy }, toolUseId, business: { id: "biz-1" } }) as never;

describe("Tess changing her own mode and how she answers", () => {
  it("switches mode when John asks, and is told how to behave from now on", async () => {
    const { db } = setup();
    const result = await changeSettings.run(ctx(db), { mode: "focus" });
    expect(result.ok).toBe(true);
    expect(result.text).toContain(MODES.focus.instructions);
    expect((await loadTessProfile(db, "user-1")).mode).toBe("focus");
  });

  it("changes only what was asked and leaves the rest alone", async () => {
    const { db } = setup();
    await saveTessSettings(db, "user-1", { mode: "create", length: "long", bluntness: "gentle", pushback: "light" });
    await changeSettings.run(ctx(db), { bluntness: "blunt" });
    expect(await loadTessProfile(db, "user-1")).toMatchObject({ mode: "create", length: "long", bluntness: "blunt", pushback: "light" });
  });

  it("only offers the values that exist", () => {
    const props = changeSettings.input_schema.properties as Record<string, { enum?: unknown[] }>;
    expect(props.mode.enum).toEqual(["brief", "chat", "lift", "focus", "create"]);
    expect(props.background.enum).toEqual(["ambient", "gamma40", "beta15", "off"]);
    expect(props.text_style.enum).toEqual(["classic", "comic", "tech", "hidden"]);
    expect(props.sound.enum).toEqual(["on", "off"]);
  });

  it("refuses a call that changes nothing", async () => {
    const { db, tables } = setup();
    const result = await changeSettings.run(ctx(db), {});
    expect(result.ok).toBe(false);
    expect(tables.ai_tess_profile).toHaveLength(0);
  });

  it("does nothing outside a conversation with John", async () => {
    const { db, tables } = setup();
    const result = await changeSettings.run(ctx(db, "tu-1", null), { mode: "focus" });
    expect(result.ok).toBe(false);
    expect(tables.ai_tess_profile).toHaveLength(0);
  });

  it("a screen-only change saves nothing on the server and says it is done on his screen", async () => {
    const { db, tables } = setup();
    const result = await changeSettings.run(ctx(db), { background: "gamma40" });
    expect(result.ok).toBe(true);
    expect(result.text).toMatch(/screen/i);
    expect(tables.ai_tess_profile).toHaveLength(0);
  });
});

describe("changes that happen on John's screen", () => {
  it("keeps only values that exist", () => {
    expect(cleanScreenChange({ background: "beta15", text_style: "comic", text_fade_seconds: 60, sound: "off" })).toEqual({ background: "beta15", textStyle: "comic", fadeSeconds: 60, sound: false });
    expect(cleanScreenChange({ background: "whale", text_style: "papyrus", text_fade_seconds: 7, sound: "maybe" })).toBeNull();
    expect(cleanScreenChange({ mode: "focus" })).toBeNull();
  });

  it("is read from the tool call in her reply, so the page can apply it", () => {
    const content = [
      { type: "thinking", thinking: "…" },
      { type: "tool_use", id: "tu-1", name: "change_settings", input: { mode: "focus", background: "gamma40" } },
      { type: "tool_use", id: "tu-2", name: "park_idea", input: { idea: "x" } },
    ];
    expect(screenChangeFromMessage(content)).toEqual({ background: "gamma40" });
  });

  it("is nothing when she changed no screen setting", () => {
    expect(screenChangeFromMessage([{ type: "text", text: "Done." }])).toBeNull();
    expect(screenChangeFromMessage([{ type: "tool_use", id: "t", name: "change_settings", input: { mode: "chat" } }])).toBeNull();
  });
});

describe("a conversation started before Tess was updated", () => {
  const current = { prompt: ROLE.tess.prompt, toolNames: ["read_lead", "change_settings"] };
  const frame = (prompt: string, names: string[]) => ({ system: [{ type: "text", text: prompt }, { type: "text", text: "state" }], tools: names.map((name) => ({ name })) });
  const brief = async () => "BRIEF";

  it("is out of date when her instructions or her tools have changed", () => {
    expect(frameOutdated(frame(ROLE.tess.prompt, ["read_lead", "change_settings"]), current)).toBe(false);
    expect(frameOutdated(frame(ROLE.tess.prompt, ["read_lead"]), current)).toBe(true);
    expect(frameOutdated(frame("An older prompt.", ["read_lead", "change_settings"]), current)).toBe(true);
  });

  it("is not out of date when it has not started yet", () => {
    expect(frameOutdated(null, current)).toBe(false);
    expect(frameOutdated(undefined, current)).toBe(false);
  });

  it("is left behind: John's next message starts a new conversation with the new tools", async () => {
    const old = { id: "run-old", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "done", started_by: "user-1", steps_taken: 2, started_at: "2026-11-20T13:00:00.000Z", finished_at: "2026-11-20T13:01:00.000Z", frame: frame("An older prompt.", ["read_lead"]), transcript: [{ role: "user", content: [{ type: "text", text: "Earlier" }] }, { role: "assistant", content: [{ type: "text", text: "Yes." }] }] };
    const { db, tables } = setup({ ai_runs: [old] });
    const runId = await openChatTurn(db, { userId: "user-1", message: "Change to focus", brief, current, now: NOW });
    expect(runId).not.toBe("run-old");
    expect(tables.ai_runs).toHaveLength(2);
    expect(await chatHistory(db, "user-1", NOW, current)).toEqual([{ role: "john", text: "Change to focus" }]);
  });

  it("carries on when nothing about her has changed", async () => {
    const same = { id: "run-old", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "done", started_by: "user-1", steps_taken: 2, started_at: "2026-11-20T13:00:00.000Z", finished_at: "2026-11-20T13:01:00.000Z", frame: frame(ROLE.tess.prompt, ["read_lead", "change_settings"]), transcript: [{ role: "user", content: [{ type: "text", text: "Earlier" }] }, { role: "assistant", content: [{ type: "text", text: "Yes." }] }] };
    const { db } = setup({ ai_runs: [same] });
    expect(await openChatTurn(db, { userId: "user-1", message: "Next", brief, current, now: NOW })).toBe("run-old");
  });
});
