import "server-only";
import crypto from "node:crypto";

/**
 * One-click unsubscribe links for marketing campaigns and sequences.
 *
 * Same scheme as lib/campaign/unsubscribe.ts, extended rather than replaced:
 * an HMAC over the row id, keyed with the Supabase service-role key. The
 * link cannot be guessed and cannot be edited to unsubscribe somebody else,
 * and no token table is needed — rotating that key invalidates old links,
 * which is the safe direction to fail in.
 *
 * The difference from the existing helper is WHAT is signed. That one signs
 * a lead id, which only works for people who are leads. A campaign goes to
 * leads, customers and imported addresses alike, so this signs the
 * RECIPIENT ROW id — which exists for every one of them and carries the
 * address, the campaign and the CRM link needed to record the opt-out
 * against the right record.
 */

function key(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function siteBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://tomorrowstechai.com";
}

type Scope = "c" | "s";

function sign(scope: Scope, id: string): string | null {
  const k = key();
  if (!k) return null;
  return crypto.createHmac("sha256", k).update(`${scope}:${id}`).digest("hex").slice(0, 32);
}

/** For a campaign recipient row. */
export function campaignUnsubscribeUrl(recipientId: string): string | null {
  const token = sign("c", recipientId);
  if (!token) return null;
  return `${siteBase()}/api/email/unsubscribe?r=${encodeURIComponent(recipientId)}&t=${token}`;
}

/** For a sequence enrollment row. */
export function sequenceUnsubscribeUrl(enrollmentId: string): string | null {
  const token = sign("s", enrollmentId);
  if (!token) return null;
  return `${siteBase()}/api/email/unsubscribe?e=${encodeURIComponent(enrollmentId)}&t=${token}`;
}

export function verifyUnsubscribe(scope: Scope, id: string, token: string): boolean {
  const expected = sign(scope, id);
  if (!expected || typeof token !== "string" || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/**
 * The headers that make the mail client's own unsubscribe button appear.
 *
 * Worth more than the link in the footer: Gmail and Outlook show this button
 * at the top of the message, and a person who can find it there does not
 * reach for "report spam" instead — which is the outcome that actually
 * damages a sending domain.
 */
export function listUnsubscribeHeaders(url: string | null): Record<string, string> {
  if (!url) return {};
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
