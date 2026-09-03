import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { getRequestByToken, saveProgress } from "@/lib/requests/service";

export const runtime = "nodejs";

/**
 * Autosave from the client's action page.
 *
 * The token is the only credential, so everything it can reach is checked
 * here: the request must exist, be live, and not already be finished. What
 * gets written is filtered against the template in saveProgress — a token
 * identifies a client, it does not entitle them to set arbitrary keys.
 */
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`action-save:${ip}`, { max: 120, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many saves. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.token !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const loaded = await getRequestByToken(body.token);
  if (loaded === "not_found" || loaded === "unknown_template") {
    return NextResponse.json({ error: "That link is not valid." }, { status: 404 });
  }
  if (loaded === "expired") {
    return NextResponse.json({ error: "That link has expired." }, { status: 410 });
  }
  if (loaded === "canceled") {
    return NextResponse.json({ error: "This request was cancelled." }, { status: 409 });
  }
  if (loaded.request.status === "completed") {
    return NextResponse.json({ error: "This one is already finished." }, { status: 409 });
  }

  try {
    const request = await saveProgress(loaded, {
      payload: (body.payload ?? {}) as Record<string, unknown>,
      steps: body.steps,
    });
    return NextResponse.json({ ok: true, steps: request.steps_done });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save." },
      { status: 500 }
    );
  }
}
