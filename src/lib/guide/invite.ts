/** When Tess opens on her own, and how often. Shared by the mascot and its tests. */

/** How long a visitor is left alone before she offers to help. */
export const INVITE_AFTER_MS = 13_000;

/** Where the browser remembers she has already offered. */
export const INVITE_KEY = "tess-guide-invited";

/** She does not offer again for this long after the last time. */
export const INVITE_REST_MS = 7 * 24 * 60 * 60 * 1000;

/** True when she should offer to help: never offered, or long enough ago. `seen` is what the browser stored. */
export function inviteDue(seen: string | null, now: number = Date.now()): boolean {
  const at = Number(seen);
  if (!seen || !Number.isFinite(at) || at <= 0) return true;
  return now - at >= INVITE_REST_MS;
}

/** Pages she stays off: the ad pages built around one button, the admin, the member area, and her own page. */
const OFF = ["/business-launch", "/starter-website", "/professional-website", "/ecommerce-website", "/admin", "/account", "/guide", "/intake", "/action", "/proposal", "/invoice"];

export function mascotShows(pathname: string): boolean {
  return !OFF.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
