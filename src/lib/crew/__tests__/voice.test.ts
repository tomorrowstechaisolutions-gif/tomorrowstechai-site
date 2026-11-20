import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getAdminUser: mocks.getAdminUser }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true, retryAfterSeconds: 0 }) }));

import { POST } from "@/app/api/admin/tess/speak/route";
import { speak, speakable, TESS_VOICE_ID, voiceConfigured } from "../voice";

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response("mp3-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  mocks.getAdminUser.mockReset();
  mocks.getAdminUser.mockResolvedValue({ user: { id: "user-1" }, admin: { email: "john@example.test" } });
  vi.stubEnv("ELEVENLABS_API_KEY", "");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "");
  vi.stubEnv("ELEVENLABS_MODEL_ID", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const post = (body: unknown) => POST(new Request("http://localhost/api/admin/tess/speak", { method: "POST", body: JSON.stringify(body) }));

describe("voiceConfigured", () => {
  it("is false without a key and true with one", () => {
    expect(voiceConfigured()).toBe(false);
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    expect(voiceConfigured()).toBe(true);
  });
});

describe("speakable", () => {
  it("leaves short text alone", () => {
    expect(speakable("Morning, John. Two things today.")).toBe("Morning, John. Two things today.");
  });

  it("cuts long text at the end of a sentence, under the limit", () => {
    const sentence = "This is one sentence of the answer. ";
    const out = speakable(sentence.repeat(100));
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out.endsWith("answer.")).toBe(true);
  });

  it("cuts at a word when there is no sentence end to cut at", () => {
    const out = speakable("word ".repeat(1000));
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out.endsWith("word")).toBe(true);
  });

  it("drops markup that would be read out loud", () => {
    expect(speakable("**Two** things:\n- `first`\n- second # not a heading")).toBe("Two things: first second not a heading");
  });
});

describe("speak", () => {
  it("asks ElevenLabs for Tess's own voice, with the key in the header", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "secret-key");
    await speak("Hello John.");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`https://api.elevenlabs.io/v1/text-to-speech/${TESS_VOICE_ID}/stream`);
    expect(TESS_VOICE_ID).toBe("9KRLT4aSiXTpK4rEdU3F");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("secret-key");
    expect(JSON.parse(String(init.body))).toMatchObject({ text: "Hello John.", model_id: "eleven_flash_v2_5" });
    expect(url).not.toContain("secret-key");
  });

  it("uses another voice or model when the settings name one", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "other-voice");
    vi.stubEnv("ELEVENLABS_MODEL_ID", "eleven_v3");
    await speak("Hi.");

    expect(fetchMock.mock.calls[0][0]).toContain("/text-to-speech/other-voice/stream");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).model_id).toBe("eleven_v3");
  });
});

describe("POST /api/admin/tess/speak", () => {
  it("refuses a caller who is not a signed-in admin", async () => {
    mocks.getAdminUser.mockResolvedValue(null);
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    const res = await post({ text: "Hello" });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 204 when no voice is configured, so the page falls back to text", async () => {
    const res = await post({ text: "Hello" });
    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the audio", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    const res = await post({ text: "Hello John." });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(await res.text()).toBe("mp3-bytes");
  });

  it("answers 204 for nothing to say", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    expect((await post({ text: "   " })).status).toBe(204);
    expect((await post({})).status).toBe(204);
  });

  it("reports a voice service failure without passing its body through", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    fetchMock.mockResolvedValueOnce(new Response("quota exceeded for key k", { status: 401 }));
    const res = await post({ text: "Hello" });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("quota");
  });
});
