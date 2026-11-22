import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { chatHistory, openChatTurn } from "../chat";
import { addNote, contextBlocks, currentStateBlock, loadTessProfile, removeNote, saveTessAbout, saveTessSettings } from "../profile";
import { ROLE } from "../roles";
import { aboutJohnText, businessesText, cleanSettings, DEFAULT_SETTINGS, howToAnswerText, LIMITS, MODE_IDS, MODES, openTopics, TOPICS } from "../tess-modes";
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
  it("has the six modes John asked for, each with its own instructions", () => {
    expect([...MODE_IDS]).toEqual(["brief", "chat", "lift", "focus", "create", "funny"]);
    const seen = new Set(MODE_IDS.map((id) => MODES[id].instructions));
    expect(seen.size).toBe(6);
  });

  it("the funny mode roasts John and still answers the question", () => {
    expect(MODES.funny.label).toBe("Funny");
    expect(MODES.funny.instructions).toMatch(/roast/i);
    expect(MODES.funny.instructions).toMatch(/answer/i);
  });

  it("the funny mode keeps private details out, since it may be recorded", () => {
    // John films this for YouTube. A lead's name or a real dollar figure said
    // out loud for a laugh would be public.
    expect(MODES.funny.instructions).toMatch(/recorded/i);
    expect(MODES.funny.instructions).toMatch(/never say .*name/i);
    expect(MODES.funny.instructions).toMatch(/dollar/i);
  });

  it("the funny mode does not ask get-to-know-you questions", () => {
    expect(MODES.funny.questions).toMatch(/do not ask/i);
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
  it("is only the list of what she still wants to learn, before anything is known", () => {
    const text = aboutJohnText("", []);
    expect(text).toContain(TOPICS[0].label);
    expect(text).not.toContain("In his own words");
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

describe("John's businesses, kept apart from who he is", () => {
  const brief = async () => "BRIEF TEXT";

  it("is nothing when he has written nothing", () => {
    expect(businessesText("  ")).toBeNull();
  });

  it("is marked as reference that may be out of date", () => {
    const text = businessesText("SplicePoint: fiber splicing software.");
    expect(text?.startsWith("<john_businesses>")).toBe(true);
    expect(text).toContain("SplicePoint: fiber splicing software.");
    expect(text).toMatch(/may be out of date/i);
  });

  it("is saved beside what he wrote about himself, and cut at its own limit", async () => {
    const { db, tables } = setup();
    await saveTessAbout(db, "user-1", "Systems thinker.", "y".repeat(LIMITS.businesses + 10));
    expect(tables.ai_tess_profile[0]).toMatchObject({ about: "Systems thinker." });
    expect(String(tables.ai_tess_profile[0].businesses)).toHaveLength(LIMITS.businesses);
  });

  it("is left alone when only the part about him is saved", async () => {
    const { db } = setup();
    await saveTessAbout(db, "user-1", "One.", "Held: family calendar.");
    await saveTessAbout(db, "user-1", "Two.");
    expect(await loadTessProfile(db, "user-1")).toMatchObject({ about: "Two.", businesses: "Held: family calendar." });
  });

  it("reaches Tess with the first message and stays off the page", async () => {
    const { db, tables } = setup();
    await saveTessAbout(db, "user-1", "", "Held: family calendar.");
    await openChatTurn(db, { userId: "user-1", message: "Morning", brief, context: contextBlocks(await loadTessProfile(db, "user-1")), now: NOW });
    const first = texts((tables.ai_runs[0].transcript as Msg[])[0]);
    expect(first.some((t) => t.startsWith("<john_businesses>") && t.includes("Held: family calendar."))).toBe(true);
    expect(await chatHistory(db, "user-1", NOW)).toEqual([{ role: "john", text: "Morning" }]);
  });
});

describe("how Tess works with John, in her standing instructions", () => {
  it("troubleshoots one step at a time", () => {
    expect(ROLE.tess.prompt).toMatch(/one step at a time/i);
  });

  it("never passes off old or unverified figures as current", () => {
    expect(ROLE.tess.prompt).toMatch(/never invent/i);
  });

  it("leads a decision with her recommendation", () => {
    expect(ROLE.tess.prompt).toMatch(/recommendation first/i);
  });
});

describe("Tess getting to know John over time", () => {
  const note = (text: string, topic?: string) => ({ id: text, text, at: "2026-11-20T10:00:00Z", ...(topic ? { topic } : {}) });

  it("starts with every topic open", () => {
    expect(openTopics([]).map((t) => t.id)).toEqual(TOPICS.map((t) => t.id));
    expect(TOPICS.length).toBeGreaterThanOrEqual(10);
  });

  it("closes a topic once she has saved something under it", () => {
    const open = openTopics([note("Best hours are 5am to noon.", "rhythm"), note("Likes Porsches.")]);
    expect(open.map((t) => t.id)).not.toContain("rhythm");
    expect(open).toHaveLength(TOPICS.length - 1);
  });

  it("tells her which topics are still open, and stops listing one that is covered", () => {
    const text = aboutJohnText("Systems thinker.", [note("Best hours are 5am to noon.", "rhythm")]) ?? "";
    const rhythm = TOPICS.find((t) => t.id === "rhythm")!;
    const other = TOPICS.find((t) => t.id !== "rhythm")!;
    expect(text).toContain(`${other.id}: ${other.label}`);
    expect(text).not.toContain(`${rhythm.id}: ${rhythm.label}`);
  });

  it("asks freely in Chat, sparingly in Brief and Create, and never in Focus or Lift", () => {
    expect(MODES.chat.questions).toMatch(/one at a time/i);
    expect(MODES.brief.questions).toMatch(/at most one/i);
    expect(MODES.create.questions).toMatch(/at most one/i);
    expect(MODES.focus.questions).toMatch(/do not ask/i);
    expect(MODES.lift.questions).toMatch(/do not ask/i);
    expect(howToAnswerText({ ...DEFAULT_SETTINGS, mode: "focus" })).toContain(MODES.focus.questions);
  });

  it("saves an answer under its topic", async () => {
    const { db } = setup({ ai_runs: [{ id: "run-1", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "running", started_by: "user-1", steps_taken: 0 }] });
    const ctx = { sb: db, run: { id: "run-1", agent_id: "a-tess", business_id: "biz-1", started_by: "user-1" }, toolUseId: "tu-9", business: { id: "biz-1" } } as never;
    const result = await rememberAboutJohn.run(ctx, { note: "Best hours are 5am to noon.", topic: "rhythm" });
    expect(result.ok).toBe(true);
    const p = await loadTessProfile(db, "user-1");
    expect(p.learned[0]).toMatchObject({ text: "Best hours are 5am to noon.", topic: "rhythm" });
    expect(openTopics(p.learned).map((t) => t.id)).not.toContain("rhythm");
  });

  it("only offers her the topics that exist", () => {
    const props = rememberAboutJohn.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(props.topic.enum).toEqual(TOPICS.map((t) => t.id));
  });
});

describe("what changed in the business mid-conversation", () => {
  const brief = async () => "BRIEF TEXT";
  const withBusiness = () =>
    setup({
      ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "setup", playbook: null }],
      ai_goals: [],
      ai_rules: [],
    });

  it("reaches Tess as a message when John confirms the playbook or a rule is saved", async () => {
    const { db, tables } = withBusiness();
    await openChatTurn(db, { userId: "user-1", message: "One", brief, context: [(await currentStateBlock(db))!], now: NOW });
    await db.from("ai_runs").update({ status: "done" }).eq("id", tables.ai_runs[0].id);

    tables.ai_businesses[0].mode = "launch";
    tables.ai_rules.push({ id: "r1", text: "Never email on Sundays.", scope: "all", active: true });
    await openChatTurn(db, { userId: "user-1", message: "Two", brief, context: [(await currentStateBlock(db))!], now: NOW + 1000 });

    const second = texts((tables.ai_runs[0].transcript as Msg[])[1]);
    expect(second).toHaveLength(2);
    expect(second[0].startsWith("<current_state>")).toBe(true);
    expect(second[0]).toContain("Mode: launch");
    expect(second[0]).toContain("Never email on Sundays.");
  });

  it("is not repeated when nothing changed, and never shows on the page", async () => {
    const { db, tables } = withBusiness();
    await openChatTurn(db, { userId: "user-1", message: "One", brief, context: [(await currentStateBlock(db))!], now: NOW });
    await db.from("ai_runs").update({ status: "done" }).eq("id", tables.ai_runs[0].id);
    await openChatTurn(db, { userId: "user-1", message: "Two", brief, context: [(await currentStateBlock(db))!], now: NOW + 1000 });
    expect(texts((tables.ai_runs[0].transcript as Msg[])[1])).toEqual(["Two"]);
    expect((await chatHistory(db, "user-1", NOW + 2000)).map((l) => l.text)).toEqual(["One", "Two"]);
  });
});
