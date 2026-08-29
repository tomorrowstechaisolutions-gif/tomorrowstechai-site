import "server-only";
import crypto from "node:crypto";

/**
 * One-click unsubscribe links for the automated follow-up emails.
 *
 * The token is an HMAC of the lead id, so a link can't be guessed and can't be
 * edited to unsubscribe someone else. The key is the Supabase service-role key
 * — already required, already server-only, so this adds no new secret to
 * manage. Rotating that key invalidates old links, which is the safe failure.
 */
function key(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function unsubscribeToken(leadId: string): string | null {
  const k = key();
  if (!k) return null;
  return crypto.createHmac("sha256", k).update(leadId).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(leadId: string): string | null {
  const token = unsubscribeToken(leadId);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://tomorrowstechai.com";
  return `${base}/api/unsubscribe?id=${encodeURIComponent(leadId)}&t=${token}`;
}

export function verifyUnsubscribe(leadId: string, token: string): boolean {
  const expected = unsubscribeToken(leadId);
  if (!expected || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
