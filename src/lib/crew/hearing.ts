import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { heardText, hearingTerms } from "@/components/admin/cc/tess/hearingLogic";
import { TESS_PAGES } from "@/components/admin/cc/tess/pages";
import { loadTessProfile } from "./profile";
import { MODE_IDS } from "./tess-modes";

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
 *
 * There is no way to train the service on one person's voice. What it does
 * take is a list of words to listen for, sent with every recording: John's
 * own list, the admin's vocabulary and the names of his leads.
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

/** Words the admin itself uses, which a general listener gets wrong: "leads" heard as "leaves", "mode" as "mic". */
const APP_WORDS = ["Tess", ...TESS_PAGES.map((p) => p.label), ...MODE_IDS.map((id) => `${id} mode`), "leads", "lead", "hertz", "background sound", "Tomorrow's Tech AI", "Held", "Smartsheet"];

/**
 * What to listen for when this admin talks: the words he added himself
 * first, then the admin's own vocabulary, then the names on his newest
 * leads. A part that cannot be read is left out; hearing carries on.
 */
export async function hearingVocabulary(sb: SupabaseClient | null, userId: string): Promise<string[]> {
  let own: string[] = [];
  let names: string[] = [];
  if (sb) {
    try {
      own = (await loadTessProfile(sb, userId)).words;
    } catch {
      /* no word list: use the rest */
    }
    try {
      const { data } = await sb.from("leads").select("first_name, last_name, business_name, created_at").order("created_at", { ascending: false }).limit(60);
      for (const lead of (data ?? []) as { first_name: string | null; last_name: string | null; business_name: string | null }[]) {
        names.push(`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim(), lead.business_name ?? "");
      }
    } catch {
      names = [];
    }
  }
  return hearingTerms([own, APP_WORDS, names]);
}

/**
 * Send a recording to be transcribed. Returns the words, or "" when none
 * were heard. `terms` are words to listen for. If the service will not take
 * the request with them, it is sent once more without, so a bad word list
 * can never stop her hearing.
 */
export async function transcribe(audio: Blob, terms: string[] = []): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("No transcription service is configured.");

  const send = (withTerms: string[]) => {
    const form = new FormData();
    form.set("model_id", process.env.ELEVENLABS_STT_MODEL_ID?.trim() || DEFAULT_MODEL);
    form.set("file", audio, "speech.webm");
    form.set("tag_audio_events", "false");
    // John speaks English. Saying so stops the service guessing the language from a short clip.
    form.set("language_code", "en");
    for (const term of withTerms) form.append("keyterms", term);
    return fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(45_000) });
  };

  let res = await send(terms);
  if (!res.ok && terms.length && (res.status === 400 || res.status === 422)) {
    console.error(`[tess] the word list was refused (${res.status}); transcribing without it.`);
    res = await send([]);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: { status?: unknown } | string } | null;
    const detail = body?.detail;
    const reason = typeof detail === "string" ? detail : typeof detail?.status === "string" ? detail.status : "";
    throw new HearingError(res.status, reason.slice(0, 80));
  }
  return heardText(await res.json().catch(() => null));
}
