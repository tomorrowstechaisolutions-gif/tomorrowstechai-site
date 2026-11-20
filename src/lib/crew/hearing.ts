import "server-only";
import { heardText } from "@/components/admin/cc/tess/hearingLogic";

/**
 * Tess's hearing: ElevenLabs speech to text.
 *
 * The browser records what John says and sends the audio here; this passes
 * it to ElevenLabs and returns the words. It replaces the browser's own
 * speech recognition, which is free but often scrambles what was said.
 *
 * Uses the same key as her voice (`ELEVENLABS_API_KEY`), sent in a header
 * only. `ELEVENLABS_STT_MODEL_ID` overrides the model without a code change.
 * The audio is not stored anywhere on our side.
 */

const DEFAULT_MODEL = "scribe_v2";

/** The service refused the request. `refusedKey` means the key itself is not allowed to transcribe. */
export class HearingError extends Error {
  constructor(
    public status: number,
    /** ElevenLabs' own short reason, such as "missing_permissions" or "quota_exceeded". Never the key. */
    public reason: string
  ) {
    super(`The transcription service answered ${status}${reason ? ` (${reason})` : ""}.`);
  }
  get refusedKey(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Send a recording to be transcribed. Returns the words, or "" when none were heard. */
export async function transcribe(audio: Blob): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("No transcription service is configured.");

  const form = new FormData();
  form.set("model_id", process.env.ELEVENLABS_STT_MODEL_ID?.trim() || DEFAULT_MODEL);
  form.set("file", audio, "speech.webm");
  form.set("tag_audio_events", "false");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: { status?: unknown } | string } | null;
    const detail = body?.detail;
    const reason = typeof detail === "string" ? detail : typeof detail?.status === "string" ? detail.status : "";
    throw new HearingError(res.status, reason.slice(0, 80));
  }
  return heardText(await res.json().catch(() => null));
}
