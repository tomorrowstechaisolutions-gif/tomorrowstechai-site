import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend delivery events.
 *
 * Two things make this route safe, and both are non-negotiable:
 *
 *   1. THE SIGNATURE IS VERIFIED. Without it this endpoint is a public API
 *      for writing into the campaign metrics — anybody could POST a hundred
 *      "opened" events and the dashboard would believe them. Resend signs
 *      with the Svix scheme, and the check below is the standard one:
 *      HMAC-SHA256 over "id.timestamp.body", constant-time compared.
 *
 *   2. IT IS IDEMPOTENT. Resend retries, and a retried "opened" event that
 *      counted twice would inflate the open rate permanently. Every event
 *      carries a deterministic idempotency_key and the unique index on it
 *      turns a replay into a no-op. The database trigger that updates the
 *      recipient row therefore also runs exactly once.
 *
 * The route does almost nothing else on purpose. Recipient state, suppression
 * and sequence exits are all driven by the AFTER INSERT trigger on
 * email_events, so this handler cannot forget one of them, and neither can
 * any other future writer of that table.
 */

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    to?: string[] | string;
    subject?: string;
    click?: { link?: string; timestamp?: string };
    bounce?: { type?: string; subType?: string; message?: string };
    reason?: string;
  };
};

/** Resend's event names → ours. Anything unrecognised is ignored, not guessed. */
const EVENT_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

/**
 * Svix signature verification.
 *
 * The secret is "whsec_" + base64. The signature header holds one or more
 * space-separated "v1,<base64>" values — more than one during a secret
 * rotation — and any match is a pass.
 */
function verifySignature(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signature = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  // Reject anything older than five minutes, so a captured request cannot be
  // replayed back at us days later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  const expectedBuf = Buffer.from(expected);
  return signature.split(" ").some((part) => {
    const value = part.startsWith("v1,") ? part.slice(3) : part;
    const candidate = Buffer.from(value);
    return (
      candidate.length === expectedBuf.length && crypto.timingSafeEqual(candidate, expectedBuf)
    );
  });
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await request.text();

  // No secret means the endpoint is not configured, and an unconfigured
  // webhook must REFUSE rather than accept unsigned writes into the metrics.
  if (!secret) {
    console.error("[webhook:resend] RESEND_WEBHOOK_SECRET is not set; the event was rejected.");
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }
  if (!verifySignature(secret, request.headers, body)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  let payload: ResendEvent;
  try {
    payload = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Body was not JSON." }, { status: 400 });
  }

  const eventType = EVENT_MAP[payload.type ?? ""];
  const messageId = payload.data?.email_id;

  // A 200 for an event we do not model, so Resend stops retrying it.
  if (!eventType || !messageId) {
    return NextResponse.json({ ok: true, ignored: payload.type ?? "unknown" });
  }

  const db = supabaseAdmin();
  const occurredAt = payload.data?.created_at ?? payload.created_at ?? new Date().toISOString();

  // Marketing sends only. A transactional message id is not in this table,
  // and its event is acknowledged and dropped — §1: transactional delivery
  // must never appear inside campaign metrics.
  const { data: recipient } = await db
    .from("email_campaign_recipients")
    .select("id, campaign_id")
    .eq("provider_message_id", messageId)
    .maybeSingle();

  if (!recipient) {
    return NextResponse.json({ ok: true, ignored: "not a marketing send" });
  }

  const url = payload.data?.click?.link ?? null;
  const bounceType = normalizeBounce(payload.data?.bounce);

  // The key is deterministic, so the same event delivered five times inserts
  // once. A click includes the URL because two clicks on two links at the
  // same second are two real events.
  const idempotencyKey = [
    "resend", eventType, messageId, occurredAt, url ?? "",
  ].join(":");

  const { error } = await db.from("email_events").insert({
    campaign_id: recipient.campaign_id,
    recipient_id: recipient.id,
    provider: "resend",
    provider_message_id: messageId,
    idempotency_key: idempotencyKey,
    event_type: eventType,
    occurred_at: occurredAt,
    url,
    metadata: {
      ...(bounceType ? { bounce_type: bounceType } : {}),
      ...(payload.data?.bounce?.message ? { reason: payload.data.bounce.message } : {}),
      ...(payload.data?.reason ? { reason: payload.data.reason } : {}),
    },
  });

  // 23505 is the unique index doing its job on a redelivery. That is a
  // success, not an error — returning 500 would make Resend retry forever.
  if (error && error.code !== "23505") {
    console.error("[webhook:resend]", error.message);
    return NextResponse.json({ error: "Could not record the event." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, duplicate: error?.code === "23505", type: eventType });
}

/**
 * Hard versus soft, and never a guess.
 *
 * This distinction decides whether somebody is permanently suppressed. A
 * mailbox that was full on Tuesday is not consent withdrawn, and treating it
 * as permanent quietly destroys a list — so anything not explicitly
 * permanent comes back as "unknown", which does not suppress.
 */
function normalizeBounce(
  bounce: { type?: string; subType?: string; message?: string } | undefined
): string | null {
  if (!bounce || typeof bounce !== "object") return null;
  const value = `${bounce.type ?? ""} ${bounce.subType ?? ""}`.toLowerCase();
  if (value.includes("permanent") || value.includes("hard")) return "hard";
  if (value.includes("transient") || value.includes("soft") || value.includes("undetermined")) return "soft";
  return "unknown";
}
