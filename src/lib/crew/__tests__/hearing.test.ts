import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getAdminUser: mocks.getAdminUser }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true, retryAfterSeconds: 0 }) }));

import { POST } from "@/app/api/admin/tess/hear/route";
import { HEAR_LIMITS, heardText, listenStep, newListen } from "@/components/admin/cc/tess/hearingLogic";
import { transcribe } from "../hearing";

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ language_code: "en", text: "  Where are we on leads?  " }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  mocks.getAdminUser.mockReset();
  mocks.getAdminUser.mockResolvedValue({ user: { id: "user-1" }, admin: { email: "john@example.test" } });
  vi.stubEnv("ELEVENLABS_API_KEY", "");
  vi.stubEnv("ELEVENLABS_STT_MODEL_ID", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const audio = (bytes = 2000) => new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
const post = (body: Blob | null) => POST(new Request("http://localhost/api/admin/tess/hear", { method: "POST", body, headers: { "Content-Type": "audio/webm" } }));

describe("reading back what was heard", () => {
  it("takes the text and tidies the spacing", () => {
    expect(heardText({ text: "  Where   are we\non leads? " })).toBe("Where are we on leads?");
  });

  it("is empty for anything that is not a transcript", () => {
    expect(heardText(null)).toBe("");
    expect(heardText({ text: 5 })).toBe("");
    expect(heardText({})).toBe("");
  });
});

describe("knowing when John has finished talking", () => {
  const LOUD = HEAR_LIMITS.speechLevel + 0.05;
  const QUIET = HEAR_LIMITS.speechLevel / 4;

  it("keeps listening while he is speaking", () => {
    let s = newListen(0);
    let r = listenStep(s, LOUD, 500, "tap");
    s = r.state;
    r = listenStep(s, LOUD, 5000, "tap");
    expect(r.stop).toBe(false);
    expect(r.state.spoke).toBe(true);
  });

  it("stops once he has been quiet for a moment after speaking", () => {
    let s = listenStep(newListen(0), LOUD, 500, "tap").state;
    const early = listenStep(s, QUIET, 600, "tap");
    expect(early.stop).toBe(false);
    s = early.state;
    expect(listenStep(s, QUIET, 600 + HEAR_LIMITS.quietMs - 1, "tap").stop).toBe(false);
    expect(listenStep(s, QUIET, 600 + HEAR_LIMITS.quietMs, "tap").stop).toBe(true);
  });

  it("a short pause in the middle does not cut him off", () => {
    let s = listenStep(newListen(0), LOUD, 500, "tap").state;
    s = listenStep(s, QUIET, 600, "tap").state;
    s = listenStep(s, LOUD, 1200, "tap").state;
    expect(listenStep(s, QUIET, 1300 + HEAR_LIMITS.quietMs - 200, "tap").stop).toBe(false);
  });

  it("gives up when he taps and says nothing", () => {
    const s = newListen(0);
    expect(listenStep(s, QUIET, HEAR_LIMITS.waitForSpeechMs - 1, "tap").stop).toBe(false);
    const r = listenStep(s, QUIET, HEAR_LIMITS.waitForSpeechMs, "tap");
    expect(r.stop).toBe(true);
    expect(r.state.spoke).toBe(false);
  });

  it("while the space bar is held, only the length limit stops it", () => {
    let s = listenStep(newListen(0), LOUD, 500, "hold").state;
    s = listenStep(s, QUIET, 600, "hold").state;
    expect(listenStep(s, QUIET, 600 + HEAR_LIMITS.quietMs * 5, "hold").stop).toBe(false);
    expect(listenStep(s, QUIET, HEAR_LIMITS.maxMs, "hold").stop).toBe(true);
  });
});

describe("sending the recording to be transcribed", () => {
  it("posts the audio to ElevenLabs with the key in a header only", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const text = await transcribe(audio());
    expect(text).toBe("Where are we on leads?");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    const form = init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("uses another model when one is set", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_STT_MODEL_ID", "scribe_v1");
    await transcribe(audio());
    expect((fetchMock.mock.calls[0][1].body as FormData).get("model_id")).toBe("scribe_v1");
  });

  it("says so when the service refuses", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    await expect(transcribe(audio())).rejects.toThrow(/401/);
  });
});

describe("POST /api/admin/tess/hear", () => {
  it("turns away anyone who is not a signed-in admin", async () => {
    mocks.getAdminUser.mockResolvedValue(null);
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const res = await post(audio());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 204 when no key is set, so the page falls back to the browser", async () => {
    const res = await post(audio());
    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns what was heard", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const res = await post(audio());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Where are we on leads?" });
  });

  it("refuses an empty or oversized recording without calling the service", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    expect((await post(audio(10))).status).toBe(400);
    expect((await post(audio(HEAR_LIMITS.maxBytes + 1))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tells the page to fall back when ElevenLabs refuses the key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    fetchMock.mockResolvedValueOnce(Response.json({ detail: { status: "missing_permissions", message: "The API key is missing the permission speech_to_text" } }, { status: 401 }));
    const res = await post(audio());
    expect(res.status).toBe(424);
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(JSON.stringify(body)).not.toContain("test-key");
  });

  it("answers 502 with a plain message when the service fails", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const res = await post(audio());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/could not/i);
  });
});
