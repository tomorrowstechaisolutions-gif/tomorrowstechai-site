import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { chatHistory, openChatTurn } from "../chat";
import { addNote, contextBlocks, loadTessProfile, removeNote, saveTessAbout, saveTessSettings } from "../profile";
import { aboutJohnText, cleanSettings, DEFAULT_SETTINGS, howToAnswerText, LIMITS, MODE_IDS, MODES } from "../tess-modes";
import { parkIdea, rememberAboutJohn } from "../tools/profile";
import { toolsFor } from "../tools";

const NOW = Date.parse("2026-11-20T14:00:00.000Z");

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({
    ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "launch" }],
    ai_agents: [{ id: "a-tess", slug: "tess", name: "Tess", model: "claude-opus-5-5" }],
    ai_runs: [],
    ai_steps: [],
    ai_tess_profile: [],
    ...over,
  });
}

type Msg = { role: string; content: { type: string; text?: string }[] | string };
const texts = (m: Msg) => (typeof m.content === "string" ? [m.content] : m.content.map((b) => b.text ?? ""));

describe("Tess's modes and dials", () => {
  it("has the five modes John asked for, each with its own instructions", () => {
    expect([...MODE_IDS]).toEqual(["brief", "chat", "lift", "focus", "create"]);
    const seen = new Set(MODE_IDS.map((id) => MODES[id].instructions));
    expect(seen.size).toBe(5);
  });

  it("falls back to the defaults for anything it does not recognise", () => {
    expect(cleanSettings({ mode: "party", length: 7, bluntness: null })).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ mode: "focus", length: "short", bluntness: "blunt", pushback: "hard" })).toEqual({ mode: "focus", length: "short", bluntness: "blunt", pushback: "hard" });
  });

  it("tells Tess how to answer in the chosen mode and dials", () => {
    const text = howToAnswerText({ mode: "focus", length: "short", bluntness: "blunt", pushback: "hard" });
    expect(text.startsWith("<how_to_answer>")).toBe(true);
    expect(text).toContain(MODES.focus.instructions);
    expect(text).not.toContain(MODES.chat.instructions);
    expect(text).not.toBe(howToAnswerText({ mode: "focus", length: "long", bluntness: "blunt", pushback: "hard" }));
  });

  it("the lift mode never tells John to rest or cheers him on", () => {
    expect(MODES.lift.instructions).toMatch(/do not cheer/i);
  });
});

describe("what Tess knows about John", () => {
  it("is nothing when he has written nothing and she has learned nothing", () => {
    expect(aboutJohnText("", [])).toBeNull();
  });

  it("carries his own words and what she has learned", () => {
    const text = aboutJohnText("Autistic and ADHD, high work drive.", [{ id: "n1", text: "Prefers mornings.", at: "2026-11-20T10:00:00Z" }]);
    expect(text?.startsWith("<about_john>")).toBe(true);
    expect(text).toContain("Autistic and ADHD, high work drive.");
    expect(text).toContain("Prefers mornings.");
  });
});

describe("the saved profile", () => {
  it("is the defaults before John has saved anything", async () => {
    const { db } = setup();
    const p = await loadTessProfile(db, "user-1");
    expect(p).toMatchObject({ ...DEFAULT_SETTINGS, about: "", learned: [], parked: [], ready: true });
  });

  it("is the defaults, marked not ready, when the table has not been created", async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "relation does not exist" } }) }) }) }) };
    const p = await loadTessProfile(db as never, "user-1");
    expect(p).toMatchObject({ ...DEFAULT_SETTINGS, ready: false });
  });

  it("saves the mode and dials, and keeps what was written about John", async () => {
    const { db, tables } = setup();
    await saveTessAbout(db, "user-1", "Systems thinker.");
    await saveTessSettings(db, "user-1", { mode: "create", length: "long", bluntness: "gentle", pushback: "light" });
    expect(tables.ai_tess_profile).toHaveLength(1);
    expect(tables.ai_tess_profile[0]).toMatchObject({ user_id: "user-1", mode: "create", length: "long", about: "Systems thinker." });
  });

  it("cuts an over-long profile at the limit", async () => {
    const { db, tables } = setup();
    await saveTessAbout(db, "user-1", "x".repeat(LIMITS.about + 50));
    expect(String(tables.ai_tess_profile[0].about)).toHaveLength(LIMITS.about);
  });

  it("adds a note, does not add the same note twice, and removes one by id", async () => {
    const { db } = setup();
    await addNote(db, "user-1", "learned", "Prefers mornings.", NOW);
    await addNote(db, "user-1", "learned", "prefers mornings.", NOW);
    await addNote(db, "user-1", "parked", "A fish tank monitor.", NOW);
    let p = await loadTessProfile(db, "user-1");
    expect(p.learned.map((n) => n.text)).toEqual(["Prefers mornings."]);
    expect(p.parked.map((n) => n.text)).toEqual(["A fish tank monitor."]);
    await removeNote(db, "user-1", "learned", p.learned[0].id);
    p = await loadTessProfile(db, "user-1");
    expect(p.learned).toEqual([]);
    expect(p.parked).toHaveLength(1);
  });

  it("keeps only the newest notes once the list is full", async () => {
    const { db } = setup();
    for (let i = 0; i < LIMITS.notes + 3; i++) await addNote(db, "user-1", "learned", `fact ${i}`, NOW + i);
    const p = await loadTessProfile(db, "user-1");
    expect(p.learned).toHaveLength(LIMITS.notes);
    expect(p.learned[p.learned.length - 1].text).toBe(`fact ${LIMITS.notes + 2}`);
    expect(p.learned[0].text).toBe("fact 3");
  });
});

describe("the profile in the conversation", () => {
  const brief = async () => "BRIEF TEXT";

  it("goes in ahead of John's first message, and stays off the page", async () => {
    const { db, tables } = setup();
    await saveTessAbout(db, "user-1", "Autistic and ADHD.");
    const context = contextBlocks(await loadTessProfile(db, "user-1"));
    await openChatTurn(db, { userId: "user-1", message: "Morning", brief, context, now: NOW });

    const first = texts((tables.ai_runs[0].transcript as Msg[])[0]);
    expect(first.some((t) => t.startsWith("<about_john>") && t.includes("Autistic and ADHD."))).toBe(true);
    expect(first.some((t) => t.startsWith("<how_to_answer>"))).toBe(true);
    expect(first[first.length - 1]).toBe("Morning");

    expect(await chatHistory(db, "user-1", NOW)).toEqual([{ role: "john", text: "Morning" }]);
  });

  it("is not repeated on the next message when nothing changed", async () => {
    const { db, tables } = setup();
    const context = contextBlocks(await loadTessProfile(db, "user-1"));
    await openChatTurn(db, { userId: "user-1", message: "One", brief, context, now: NOW });
    await db.from("ai_runs").update({ status: "done" }).eq("id", tables.ai_runs[0].id);
    await openChatTurn(db, { userId: "user-1", message: "Two", brief, context, now: NOW + 1000 });
    const second = texts((tables.ai_runs[0].transcript as Msg[])[1]);
    expect(second).toEqual(["Two"]);
  });

  it("tells Tess the new mode with the next message after John switches", async () => {
    const { db, tables } = setup();
    await openChatTurn(db, { userId: "user-1", message: "One", brief, context: contextBlocks(await loadTessProfile(db, "user-1")), now: NOW });
    await db.from("ai_runs").update({ status: "done" }).eq("id", tables.ai_runs[0].id);
    await saveTessSettings(db, "user-1", { ...DEFAULT_SETTINGS, mode: "focus" });
    await openChatTurn(db, { userId: "user-1", message: "Two", brief, context: contextBlocks(await loadTessProfile(db, "user-1")), now: NOW + 1000 });

    const second = texts((tables.ai_runs[0].transcript as Msg[])[1]);
    expect(second).toHaveLength(2);
    expect(second[0]).toContain(MODES.focus.instructions);
    expect(second[1]).toBe("Two");
  });
});

describe("Tess's own notes", () => {
  const withRun = () => setup({ ai_runs: [{ id: "run-1", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "running", started_by: "user-1", steps_taken: 0 }] });
  const ctx = (db: unknown, startedBy: string | null = "user-1") =>
    ({ sb: db, run: { id: "run-1", agent_id: "a-tess", business_id: "biz-1", started_by: startedBy }, toolUseId: "tu-1", business: { id: "biz-1" } }) as never;

  it("are tools only Tess has", () => {
    expect(toolsFor("tess").map((t) => t.name)).toEqual(expect.arrayContaining(["remember_about_john", "park_idea"]));
    expect(toolsFor("follow-through").map((t) => t.name)).not.toContain("remember_about_john");
  });

  it("saves what she learned about John to his profile", async () => {
    const { db } = withRun();
    const result = await rememberAboutJohn.run(ctx(db), { note: "Gets energy from long build sessions." });
    expect(result.ok).toBe(true);
    expect((await loadTessProfile(db, "user-1")).learned.map((n) => n.text)).toEqual(["Gets energy from long build sessions."]);
  });

  it("parks an idea instead of chasing it", async () => {
    const { db } = withRun();
    const result = await parkIdea.run(ctx(db), { idea: "Pool chemistry tracker." });
    expect(result.ok).toBe(true);
    expect((await loadTessProfile(db, "user-1")).parked.map((n) => n.text)).toEqual(["Pool chemistry tracker."]);
  });

  it("saves nothing outside a conversation with John", async () => {
    const { db, tables } = withRun();
    const result = await rememberAboutJohn.run(ctx(db, null), { note: "Something." });
    expect(result.ok).toBe(false);
    expect(tables.ai_tess_profile).toHaveLength(0);
  });
});
