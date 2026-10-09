import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { forgetZoomConnection } from "@/lib/zoom/oauth";
import { OPEN_MEETING_STATUSES } from "@/lib/meetings/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zoom event webhook.
 *
 * Verified with the app's Secret Token (ZOOM_WEBHOOK_SECRET_TOKEN): Zoom
 * signs `v0:{timestamp}:{raw body}` with HMAC-SHA256 and sends it as
 * `x-zm-signature`. Anything unsigned, mis-signed or older than five minutes
 * is refused before the body is trusted.
 *
 * Events handled:
 *   endpoint.url_validation → the challenge Zoom sends when the URL is saved
 *   meeting.started         → open meeting moves to In Progress
 *   meeting.ended           → ended time noted; completing still needs an
 *                             outcome from a person, so status is not guessed
 *   meeting.deleted         → deleted in Zoom directly; an open meeting here
 *                             is marked cancelled so the calendar stops lying
 *   app_deauthorized        → the user removed the app; tokens are deleted
 *
 * Anything else is acknowledged and ignored. Never logs payload contents.
 */

const MAX_SKEW_MS = 5 * 60_000;

function secret(): string | null {
  return process.env.ZOOM_WEBHOOK_SECRET_TOKEN || null;
}

function hmac(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

function verified(raw: string, timestamp: string | null, signature: string | null, key: string): boolean {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  const ms = ts < 1e12 ? ts * 1000 : ts;
  if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > MAX_SKEW_MS) return false;
  const expected = `v0=${hmac(key, `v0:${timestamp}:${raw}`)}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

type ZoomEvent = {
  event?: string;
  event_ts?: number;
  payload?: {
    plainToken?: string;
    user_id?: string;
    object?: { id?: number | string; uuid?: string; start_time?: string; end_time?: string };
  };
};

export async function POST(request: Request) {
  const key = secret();
  if (!key) {
    return NextResponse.json({ error: "Zoom webhook is not configured." }, { status: 503 });
  }

  const raw = await request.text();
  const ok = verified(
    raw,
    request.headers.get("x-zm-request-timestamp"),
    request.headers.get("x-zm-signature"),
    key
  );
  if (!ok) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let event: ZoomEvent;
  try {
    event = JSON.parse(raw) as ZoomEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (event.event === "endpoint.url_validation") {
    const plainToken = event.payload?.plainToken ?? "";
    return NextResponse.json({ plainToken, encryptedToken: hmac(key, plainToken) });
  }

  try {
    if (event.event === "app_deauthorized") {
      await forgetZoomConnection(event.payload?.user_id ?? null);
      return NextResponse.json({ ok: true });
    }

    const zoomId = event.payload?.object?.id != null ? String(event.payload.object.id) : null;
    if (!zoomId) return NextResponse.json({ ok: true, ignored: true });

    const db = supabaseAdmin();
    const { data: row } = await db
      .from("meetings")
      .select("id, status, provider_metadata")
      .eq("provider", "zoom")
      .eq("provider_event_id", zoomId)
      .maybeSingle();
    if (!row) return NextResponse.json({ ok: true, ignored: true });

    const meeting = row as { id: string; status: string; provider_metadata: Record<string, unknown> | null };
    const meta = meeting.provider_metadata ?? {};
    const isOpen = (OPEN_MEETING_STATUSES as readonly string[]).includes(meeting.status);

    if (event.event === "meeting.started") {
      await db.from("meetings").update({
        ...(isOpen ? { status: "in_progress" } : {}),
        provider_metadata: { ...meta, started_at: event.payload?.object?.start_time ?? new Date().toISOString() },
      }).eq("id", meeting.id);
    } else if (event.event === "meeting.ended") {
      await db.from("meetings").update({
        provider_metadata: { ...meta, ended_at: event.payload?.object?.end_time ?? new Date().toISOString() },
      }).eq("id", meeting.id);
    } else if (event.event === "meeting.deleted") {
      if (isOpen) {
        await db.from("meetings").update({
          status: "cancelled",
          cancel_reason: "Deleted directly in Zoom.",
        }).eq("id", meeting.id);
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    // 500 makes Zoom retry, which is right for a transient database error.
    console.error("Zoom webhook processing failed for event", event.event);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
