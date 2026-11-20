import { NextResponse } from "next/server";
import { HEAR_LIMITS } from "@/components/admin/cc/tess/hearingLogic";
import { transcribe } from "@/lib/crew/hearing";
import { voiceConfigured } from "@/lib/crew/voice";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Tess hearing John. POST the recorded audio as the body; the answer is
 * { text }.
 *
 * 204 means no transcription service is configured, and the page falls back
 * to the browser's own speech recognition. The audio is passed straight
 * through and not kept.
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
    return NextResponse.json({ text: await transcribe(audio) });
  } catch (err) {
    console.error("[tess] hearing failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "I could not make out the recording. Try again, or type it." }, { status: 502 });
  }
}
