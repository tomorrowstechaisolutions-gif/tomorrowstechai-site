import crypto from "node:crypto";

/**
 * Signed tokens for the Academy. No student accounts or passwords: a student
 * proves they bought a course with a signed cookie, and gets that cookie back
 * on a new device through a signed link emailed to the address they paid with.
 *
 * Two kinds, kept apart by `p` (purpose) so one can never stand in for the other:
 *   access — the cookie: { e: email, c: course slugs }. Long-lived.
 *   login  — the emailed link: { e: email }. Short-lived.
 *
 * Format: base64url(JSON) + "." + base64url(HMAC-SHA256). The key is
 * ACADEMY_ACCESS_SECRET, or the Supabase service-role key (already required
 * and server-only, the same choice the unsubscribe links make). Rotating the
 * key signs everyone out, which is the safe failure: they request a new link.
 */

export type AccessPayload = { p: "access"; e: string; c: string[]; iat: number };
export type LoginPayload = { p: "login"; e: string; exp: number };
type Payload = AccessPayload | LoginPayload;

export const ACCESS_COOKIE = "ttai_academy";
export const ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function secret(): string | null {
  return process.env.ACADEMY_ACCESS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload: Payload): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string | undefined | null): Payload | null {
  const key = secret();
  if (!key || !token || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", key).update(body).digest("base64url");
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    return parsed && typeof parsed === "object" && typeof parsed.e === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function signAccess(email: string, courses: string[], now = Date.now()): string | null {
  const unique = Array.from(new Set(courses)).sort();
  return sign({ p: "access", e: normalizeEmail(email), c: unique, iat: Math.floor(now / 1000) });
}

export function readAccess(token: string | undefined | null): { email: string; courses: string[] } | null {
  const payload = verify(token);
  if (!payload || payload.p !== "access" || !Array.isArray(payload.c)) return null;
  return { email: payload.e, courses: payload.c.filter((c) => typeof c === "string") };
}

export function signLogin(email: string, ttlSeconds: number, now = Date.now()): string | null {
  return sign({ p: "login", e: normalizeEmail(email), exp: Math.floor(now / 1000) + ttlSeconds });
}

export function readLogin(token: string | undefined | null, now = Date.now()): string | null {
  const payload = verify(token);
  if (!payload || payload.p !== "login") return null;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(now / 1000)) return null;
  return payload.e;
}
