import "server-only";
import crypto from "node:crypto";

/**
 * Meta Conversions API — the server half of every conversion.
 *
 * The browser pixel and this call send the SAME event_name + event_id, which
 * is how Meta deduplicates them. Browser-only tracking loses roughly a third
 * of conversions to ad blockers and iOS; server-only loses the browser
 * signals. Sending both, deduplicated, is the correct setup.
 *
 * The access token is server-side only and is never sent to the browser.
 */

const GRAPH_VERSION = "v21.0";

export type CapiEventName =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "Contact"
  | "Schedule"
  | "InitiateCheckout"
  | "Purchase";

export type CapiUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
};

export type CapiEvent = {
  eventName: CapiEventName;
  eventId: string;
  eventSourceUrl?: string | null;
  eventTime?: number;
  actionSource?: "website" | "system_generated" | "phone_call" | "email";
  user: CapiUserData;
  customData?: Record<string, unknown>;
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Meta requires lowercase, trimmed, then SHA-256 for every PII field. */
function hash(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256(normalized);
}

/** Phones hash as digits only, with country code. Assumes US when 10 digits. */
function hashPhone(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let digits = value.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.length === 10) digits = `1${digits}`;
  return sha256(digits);
}

export function metaCapiConfigured(): boolean {
  return Boolean(
    (process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID) &&
      process.env.META_CAPI_ACCESS_TOKEN
  );
}

export async function sendCapiEvent(
  event: CapiEvent
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const pixelId =
    process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;

  // Not configured is not an error — the site must keep working before the
  // pixel exists. The admin settings page reports what's missing.
  if (!pixelId || !token) return { ok: false, skipped: true };

  const u = event.user;
  const userData: Record<string, unknown> = {
    em: hash(u.email),
    ph: hashPhone(u.phone),
    fn: hash(u.firstName),
    ln: hash(u.lastName),
    ct: hash(u.city),
    st: hash(u.state),
    country: hash(u.country ?? "us"),
    external_id: u.externalId ? sha256(u.externalId) : undefined,
    fbp: u.fbp ?? undefined,
    fbc: u.fbc ?? undefined,
    client_ip_address: u.clientIp ?? undefined,
    client_user_agent: u.userAgent ?? undefined,
  };

  for (const key of Object.keys(userData)) {
    if (userData[key] === undefined) delete userData[key];
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        event_source_url: event.eventSourceUrl ?? undefined,
        action_source: event.actionSource ?? "website",
        user_data: userData,
        custom_data: event.customData ?? undefined,
      },
    ],
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Never log the token or the hashed PII payload.
      console.error("Meta CAPI error:", res.status, text.slice(0, 500));
      return { ok: false, error: `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    console.error("Meta CAPI exception:", err);
    return { ok: false, error: "network" };
  }
}
