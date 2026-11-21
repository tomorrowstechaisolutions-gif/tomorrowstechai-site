import "server-only";
import { speak } from "@/lib/crew/voice";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { clipName, GUIDE_STEPS } from "./script";

/**
 * The guide's recordings: one MP3 per line, made once in Tess's voice and
 * kept in a public storage bucket. Visitors only ever download the files, so
 * a visit uses no speech credit. Recording is the one step that does, and
 * only an admin can start it.
 */
export const GUIDE_BUCKET = "site-guide";

/** The address of each recorded line, by step id. A line with no recording is left out and shows as words only. */
export async function clipUrls(): Promise<Record<string, string>> {
  if (!supabaseConfigured()) return {};
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.storage.from(GUIDE_BUCKET).list("", { limit: 1000 });
    if (error || !data) return {};
    const have = new Set(data.map((f) => f.name));
    const urls: Record<string, string> = {};
    for (const step of GUIDE_STEPS) {
      const name = clipName(step);
      if (have.has(name)) urls[step.id] = db.storage.from(GUIDE_BUCKET).getPublicUrl(name).data.publicUrl;
    }
    return urls;
  } catch {
    return {};
  }
}

export type RecordResult = { recorded: string[]; failed: { id: string; why: string }[]; already: number };

/** Record every line that has no recording for its current words. Lines already recorded are left alone. */
export async function recordMissingClips(): Promise<RecordResult> {
  const db = supabaseAdmin();
  const made = await db.storage.createBucket(GUIDE_BUCKET, { public: true, allowedMimeTypes: ["audio/mpeg"], fileSizeLimit: 2_000_000 });
  if (made.error && !/exist/i.test(made.error.message)) throw new Error(`Could not set up storage for the recordings: ${made.error.message}`);

  const have = await clipUrls();
  const result: RecordResult = { recorded: [], failed: [], already: 0 };
  for (const step of GUIDE_STEPS) {
    if (have[step.id]) {
      result.already += 1;
      continue;
    }
    try {
      const res = await speak(step.say);
      if (!res.ok) throw new Error(`The voice service answered ${res.status}.`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 500) throw new Error("The recording came back empty.");
      const { error } = await db.storage.from(GUIDE_BUCKET).upload(clipName(step), bytes, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
      result.recorded.push(step.id);
    } catch (err) {
      result.failed.push({ id: step.id, why: err instanceof Error ? err.message : "Unknown error" });
    }
  }
  return result;
}
