import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * The one check every cron route uses.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. The routes used to
 * carry three hand-written copies of this check that disagreed at the edges
 * (some took a lower-case "bearer", or the bare secret with no prefix). This
 * keeps the strictest reading the three had in common:
 *
 *   · no CRON_SECRET set          → nobody is authorised (fail closed)
 *   · header must start with exactly "Bearer " (that case, one space)
 *   · an empty token never matches
 *   · the token is compared to the secret in constant time, byte for byte
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const provided = header.slice(7);
  if (!provided) return false;

  // Lengths are compared in bytes, not characters: timingSafeEqual throws on
  // buffers of different sizes, and a multi-byte token must be a "no", not a 500.
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
