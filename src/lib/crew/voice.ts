import "server-only";

/**
 * Tess's voice: ElevenLabs text to speech, streamed.
 *
 * The API key stays on the server (`ELEVENLABS_API_KEY`) and is only ever
 * sent in a header. The voice id is not a secret: it names the voice John
 * made for Tess in his ElevenLabs account. `ELEVENLABS_VOICE_ID` and
 * `ELEVENLABS_MODEL_ID` override the defaults without a code change.
 *
 * With no key set, nothing here is called and the page shows Tess's words as
 * text only.
 */

/** The "Tess ai" voice in John's ElevenLabs account. */
export const TESS_VOICE_ID = "9KRLT4aSiXTpK4rEdU3F";
/** ElevenLabs' low-latency model, the one they recommend for conversation. */
const DEFAULT_MODEL = "eleven_flash_v2_5";
const MAX_SPOKEN = 2000;

export function voiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

/**
 * Text as it should be said: markup that would be read aloud is dropped, and
 * anything over the limit is cut at the end of a sentence (or failing that,
 * a word) so Tess never stops mid-word.
 */
export function speakable(text: string, max: number = MAX_SPOKEN): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, "")
    .replace(/[*_`#>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;

  const head = plain.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  if (sentenceEnd > max / 2) return head.slice(0, sentenceEnd + 1);
  const wordEnd = head.lastIndexOf(" ");
  return (wordEnd > 0 ? head.slice(0, wordEnd) : head).trim();
}

/** Ask ElevenLabs to say `text` in Tess's voice. The response body is MP3. */
export async function speak(text: string): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("No voice is configured.");
  const voice = process.env.ELEVENLABS_VOICE_ID?.trim() || TESS_VOICE_ID;
  const model = process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL;

  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: speakable(text), model_id: model }),
    signal: AbortSignal.timeout(30_000),
  });
}
