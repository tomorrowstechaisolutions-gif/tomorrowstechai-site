import "server-only";
import { speak } from "@/lib/crew/voice";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { greetingClips, type Clip } from "./names";
import { clipName, GUIDE_STEPS } from "./script";

/**
 * The guide's recordings: one MP3 per line, made once in Tess's voice and
 * kept in a public storage bucket. Visitors only ever download the files, so
 * a visit uses no speech credit. Recording is the one step that does, and
 * only an admin can start it.
 */
export const GUIDE_BUCKET = "site-guide";

/** How many lines one press of the record button makes. Kept small so a press always finishes inside one request. */
export const RECORD_BATCH = 60;
const AT_ONCE = 3;

/** Every line she can say: the script, then the greetings for returning visitors. */
export function allClips(): Clip[] {
  return [...GUIDE_STEPS, ...greetingClips()];
}

/** Where the recordings are served from. A recording's address is this plus its file name. */
export function clipBase(): string {
  if (!supabaseConfigured()) return "";
  return supabaseAdmin().storage.from(GUIDE_BUCKET).getPublicUrl("").data.publicUrl.replace(/\/?$/, "/");
}

/** The ids of every line that has a recording for its current words. */
export async function recordedIds(): Promise<Set<string>> {
  if (!supabaseConfigured()) return new Set();
  try {
    const { data, error } = await supabaseAdmin().storage.from(GUIDE_BUCKET).list("", { limit: 2000 });
    if (error || !data) return new Set();
    const have = new Set(data.map((f) => f.name));
    return new Set(allClips().filter((c) => have.has(clipName(c))).map((c) => c.id));
  } catch {
    return new Set();
  }
}

/** The address of each recorded line, by id. A line with no recording is left out and shows as words only. */
export async function clipUrls(): Promise<Record<string, string>> {
  const [have, base] = [await recordedIds(), clipBase()];
  return Object.fromEntries(allClips().filter((c) => have.has(c.id)).map((c) => [c.id, `${base}${clipName(c)}`]));
}

export type RecordResult = { recorded: string[]; failed: { id: string; why: string }[]; already: number; left: number };

async function recordOne(clip: Clip): Promise<void> {
  const res = await speak(clip.say);
  if (!res.ok) throw new Error(`The voice service answered ${res.status}.`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 500) throw new Error("The recording came back empty.");
  const { error } = await supabaseAdmin().storage.from(GUIDE_BUCKET).upload(clipName(clip), bytes, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
}

/** Record the next batch of lines that have no recording for their current words. Lines already recorded are left alone. */
export async function recordMissingClips(batch: number = RECORD_BATCH): Promise<RecordResult> {
  const db = supabaseAdmin();
  const made = await db.storage.createBucket(GUIDE_BUCKET, { public: true, allowedMimeTypes: ["audio/mpeg"], fileSizeLimit: 2_000_000 });
  if (made.error && !/exist/i.test(made.error.message)) throw new Error(`Could not set up storage for the recordings: ${made.error.message}`);

  const have = await recordedIds();
  const missing = allClips().filter((c) => !have.has(c.id));
  const todo = missing.slice(0, batch);
  const result: RecordResult = { recorded: [], failed: [], already: have.size, left: missing.length - todo.length };
  // A few at a time: fast enough to finish, slow enough for the voice service.
  for (let i = 0; i < todo.length; i += AT_ONCE) {
    await Promise.all(
      todo.slice(i, i + AT_ONCE).map(async (clip) => {
        try {
          await recordOne(clip);
          result.recorded.push(clip.id);
        } catch (err) {
          result.failed.push({ id: clip.id, why: err instanceof Error ? err.message : "Unknown error" });
        }
      })
    );
  }
  return result;
}
