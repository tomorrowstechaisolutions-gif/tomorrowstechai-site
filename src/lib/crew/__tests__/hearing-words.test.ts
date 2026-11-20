import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { cleanWord, HEAR_LIMITS, hearingTerms, listenStep, newListen, TERM_LIMIT } from "@/components/admin/cc/tess/hearingLogic";
import { hearingVocabulary, transcribe } from "../hearing";
import { addWord, loadTessProfile, removeWord } from "../profile";
import { ROLE } from "../roles";
import { toolsFor } from "../tools";
import { learnWord } from "../tools/profile";

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ text: "Open the leads page" }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  vi.stubEnv("ELEVENLABS_STT_MODEL_ID", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const audio = () => new Blob([new Uint8Array(2000)], { type: "audio/webm" });
const formOf = (call: number) => fetchMock.mock.calls[call][1].body as FormData;

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({
    ai_runs: [{ id: "run-1", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "running", started_by: "user-1" }],
    ai_steps: [],
    ai_tess_profile: [],
    leads: [
      { id: "l1", first_name: "Natosha", last_name: "White", business_name: null, created_at: "2026-08-01T00:00:00Z" },
      { id: "l2", first_name: "Christopher", last_name: "Chavez", business_name: "MasFajitas Mexican Restaurant", created_at: "2026-08-02T00:00:00Z" },
    ],
    ...over,
  });
}
const ctx = (db: unknown, toolUseId = "tu-1", startedBy: string | null = "user-1") =>
  ({ sb: db, run: { id: "run-1", agent_id: "a-tess", business_id: "biz-1", started_by: startedBy }, toolUseId, business: { id: "biz-1" } }) as never;

describe("the words Tess listens for", () => {
  it("tidies a word and refuses what the service cannot take", () => {
    expect(cleanWord("  Bronco  ")).toBe("Bronco");
    expect(cleanWord("Site   Build It!")).toBe("Site Build It!");
    expect(cleanWord("a")).toBe("");
    expect(cleanWord("one two three four five six")).toBe("");
    expect(cleanWord("x".repeat(51))).toBe("");
    expect(cleanWord("<b>Cora</b>")).toBe("bCora/b");
    expect(cleanWord(7)).toBe("");
  });

  it("keeps each word once, John's first, and stays under the limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => `Name${i}`);
    const terms = hearingTerms([["Bronco", "Cora"], ["Leads", "bronco"], many]);
    expect(terms.slice(0, 3)).toEqual(["Bronco", "Cora", "Leads"]);
    expect(terms).toHaveLength(TERM_LIMIT);
    expect(TERM_LIMIT).toBeLessThanOrEqual(100);
  });

  it("is built from his own words, the admin's own vocabulary and the names of his leads", async () => {
    const { db } = setup();
    await addWord(db, "user-1", "Bronco");
    const terms = await hearingVocabulary(db, "user-1");
    expect(terms[0]).toBe("Bronco");
    expect(terms).toEqual(expect.arrayContaining(["Leads", "Clients", "Tess", "focus mode", "Natosha White", "MasFajitas Mexican Restaurant"]));
  });

  it("still gives the built-in vocabulary when the database cannot be read", async () => {
    const broken = { from: () => { throw new Error("down"); } };
    const terms = await hearingVocabulary(broken as never, "user-1");
    expect(terms).toContain("Leads");
  });
});

describe("sending the recording with what to listen for", () => {
  it("says the speech is English and passes the words along", async () => {
    await transcribe(audio(), ["Bronco", "Leads"]);
    expect(formOf(0).get("language_code")).toBe("en");
    expect(formOf(0).getAll("keyterms")).toEqual(["Bronco", "Leads"]);
  });

  it("sends no word list when there is none", async () => {
    await transcribe(audio());
    expect(formOf(0).getAll("keyterms")).toEqual([]);
  });

  it("tries again without the words if the service will not take them, so hearing never breaks over a word list", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ detail: { status: "invalid_keyterms" } }, { status: 422 }));
    const text = await transcribe(audio(), ["Bronco"]);
    expect(text).toBe("Open the leads page");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(formOf(1).getAll("keyterms")).toEqual([]);
    expect(formOf(1).get("file")).toBeInstanceOf(Blob);
  });

  it("does not retry a refusal that is not about the request", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    await expect(transcribe(audio(), ["Bronco"])).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("John's own word list", () => {
  it("adds a word once, whatever the capitals, and removes it", async () => {
    const { db } = setup();
    await addWord(db, "user-1", "Bronco");
    await addWord(db, "user-1", "bronco");
    await addWord(db, "user-1", "Cora");
    expect((await loadTessProfile(db, "user-1")).words).toEqual(["Bronco", "Cora"]);
    await removeWord(db, "user-1", "BRONCO");
    expect((await loadTessProfile(db, "user-1")).words).toEqual(["Cora"]);
  });

  it("refuses a word the service cannot take", async () => {
    const { db } = setup();
    await expect(addWord(db, "user-1", "a")).rejects.toThrow();
  });

  it("is empty for a profile saved before the list existed", async () => {
    const { db } = setup({ ai_tess_profile: [{ user_id: "user-1", mode: "chat" }] });
    expect((await loadTessProfile(db, "user-1")).words).toEqual([]);
  });

  it("Tess adds a word herself when John corrects what she heard", async () => {
    const { db } = setup();
    expect(toolsFor("tess").map((t) => t.name)).toContain("learn_word");
    const result = await learnWord.run(ctx(db), { word: "Bronco" });
    expect(result.ok).toBe(true);
    expect((await loadTessProfile(db, "user-1")).words).toEqual(["Bronco"]);
    expect(ROLE.tess.prompt).toContain("learn_word");
  });

  it("she cannot add one outside a conversation with John", async () => {
    const { db } = setup();
    expect((await learnWord.run(ctx(db, "tu-1", null), { word: "Bronco" })).ok).toBe(false);
  });
});

describe("pausing to think", () => {
  it("does not send a tapped recording during a two-second pause", () => {
    const LOUD = HEAR_LIMITS.speechLevel + 0.05;
    const s = listenStep(newListen(0), LOUD, 500, "tap").state;
    const quiet = listenStep(s, 0, 600, "tap").state;
    expect(listenStep(quiet, 0, 600 + 2000, "tap").stop).toBe(false);
    expect(listenStep(quiet, 0, 600 + HEAR_LIMITS.quietMs, "tap").stop).toBe(true);
  });
});
