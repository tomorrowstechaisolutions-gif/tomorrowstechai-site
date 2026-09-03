import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { getRequestByToken, submitRequest } from "@/lib/requests/service";
import { notifyAdminOfRequest, sendCompletionReceipt } from "@/lib/requests/emails";

export const runtime = "nodejs";

/**
 * The client pressing "I'm done".
 *
 * Two emails follow: their receipt, so they know it arrived, and John's copy,
 * so the ball visibly moves back to us. Both are non-fatal — the completion
 * is already recorded, and a mail failure must not tell a client who just
 * finished that they did not.
 */
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`action-submit:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Give it a minute." },
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
    return NextResponse.json({ ok: true, missing: [] });
  }

  try {
    const { request, missing } = await submitRequest(loaded, {
      payload: (body.payload ?? {}) as Record<string, unknown>,
      steps: body.steps,
    });

    if (missing.length) {
      return NextResponse.json({ ok: false, missing }, { status: 200 });
    }

    const finished = { request, template: loaded.template };
    await Promise.allSettled([
      sendCompletionReceipt(finished),
      notifyAdminOfRequest("completed", finished),
    ]);

    return NextResponse.json({ ok: true, missing: [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not finish that." },
      { status: 500 }
    );
  }
}
