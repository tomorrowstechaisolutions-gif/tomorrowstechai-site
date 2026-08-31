import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { getIntakeByToken, submitIntake } from "@/lib/intake/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`intake-submit:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.token !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const loaded = await getIntakeByToken(body.token);
  if (loaded === "not_found") {
    return NextResponse.json({ error: "That link is not valid." }, { status: 404 });
  }
  if (loaded === "expired") {
    return NextResponse.json({ error: "That link has expired." }, { status: 410 });
  }
  if (loaded.intake.status === "submitted") {
    return NextResponse.json({ ok: true, alreadySubmitted: true });
  }

  try {
    const result = await submitIntake(loaded.intake);
    if (!result.ok) {
      // 422, not 400: the request was well formed, the intake simply is not
      // finished. The wizard reopens the earliest step still missing something.
      return NextResponse.json({ error: "Still missing some things.", missing: result.missing }, { status: 422 });
    }
    return NextResponse.json({ ok: true, intake: result.intake });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not submit." },
      { status: 500 }
    );
  }
}
