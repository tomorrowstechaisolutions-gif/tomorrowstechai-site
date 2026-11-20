import { NextResponse } from "next/server";
import { speak, speakable, voiceConfigured } from "@/lib/crew/voice";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Tess speaking. POST { text } returns MP3 audio, streamed.
 *
 * 204 means there is nothing to play: no voice is configured, or there was
 * nothing to say. The page treats that as "show the words, stay quiet".
 */
export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!voiceConfigured()) return new Response(null, { status: 204 });

  // This spends ElevenLabs credit and the caller is known.
  const limit = rateLimit(`tess-voice:${session.user.id}`, { max: 240, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ error: "Voice is resting for a few minutes." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? speakable(body.text) : "";
  if (!text) return new Response(null, { status: 204 });

  try {
    const upstream = await speak(text);
    if (!upstream.ok || !upstream.body) {
      console.error("[tess] voice service answered", upstream.status);
      return NextResponse.json({ error: "The voice service did not answer." }, { status: 502 });
    }
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[tess] voice failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The voice service did not answer." }, { status: 502 });
  }
}
