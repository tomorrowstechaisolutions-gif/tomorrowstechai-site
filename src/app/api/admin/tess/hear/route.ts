import { NextResponse } from "next/server";
import { HEAR_LIMITS } from "@/components/admin/cc/tess/hearingLogic";
import { HearingError, hearingVocabulary, transcribe } from "@/lib/crew/hearing";
import { voiceConfigured } from "@/lib/crew/voice";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Tess hearing John. POST the recorded audio as the body; the answer is
 * { text }.
 *
 * 204 means no transcription service is configured, and the page falls back
 * to the browser's own speech recognition. 424 with `fallback: true` means
 * the service refused our key (it is not allowed to transcribe, or is out
 * of credit): the page switches to the browser's recognition too. The audio
 * is passed straight through and not kept.
 */
export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!voiceConfigured()) return new Response(null, { status: 204 });

  // This spends ElevenLabs credit and the caller is known.
  const limit = rateLimit(`tess-hear:${session.user.id}`, { max: 240, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ error: "That is a lot of talking in one hour. Type for a few minutes." }, { status: 429 });

  const audio = await req.blob().catch(() => null);
  if (!audio || audio.size < HEAR_LIMITS.minBytes) return NextResponse.json({ error: "That recording was too short to hear." }, { status: 400 });
  if (audio.size > HEAR_LIMITS.maxBytes) return NextResponse.json({ error: "That recording was too long. Keep it under two minutes." }, { status: 413 });

  try {
    // The words to listen for: his own list, the admin's vocabulary, his leads' names.
    let sb: ReturnType<typeof supabaseAdmin> | null = null;
    try {
      sb = supabaseAdmin();
    } catch {
      sb = null; // no database: she still hears, with the built-in words only
    }
    return NextResponse.json({ text: await transcribe(audio, await hearingVocabulary(sb, session.user.id)) });
  } catch (err) {
    console.error("[tess] hearing failed:", err instanceof Error ? err.message : err);
    if (err instanceof HearingError && err.refusedKey) {
      return NextResponse.json(
        { fallback: true, error: "ElevenLabs would not transcribe that with this key, so I have switched to the browser's hearing. Say it again." },
        { status: 424 }
      );
    }
    return NextResponse.json({ error: "I could not make out the recording. Try again, or type it." }, { status: 502 });
  }
}
