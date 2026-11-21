import { NOTIFICATIONS, type NotificationKey } from "@/lib/notifications/names";

/**
 * Phone alerts: what one says, where it may lead, and what a device has to
 * send to sign up for them. No `server-only`: the tests read this.
 */

export type PushMessage = { title: string; body: string; url: string; tag: string };
export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

const BODY_LIMIT = 180;

/** Tapping an alert only ever opens a page inside this site's admin. Anything else goes to the admin's front page. */
export function safeLink(link: string | null | undefined): string {
  if (!link) return "/admin";
  let path = link;
  if (/^https?:\/\//i.test(link)) {
    try {
      const url = new URL(link);
      if (!/(^|\.)tomorrowstechai\.com$/i.test(url.hostname)) return "/admin";
      path = `${url.pathname}${url.search}`;
    } catch {
      return "/admin";
    }
  }
  return /^\/admin(\/|\?|$)/.test(path) ? path : "/admin";
}

/** The alert as it shows on a lock screen. */
export function pushMessage(key: NotificationKey, summary: string | null | undefined, link?: string | null): PushMessage {
  const def = NOTIFICATIONS.find((n) => n.key === key);
  const body = (summary ?? "").replace(/\s+/g, " ").trim();
  return {
    title: def?.label ?? "Tomorrow’s Tech AI",
    body: body ? (body.length > BODY_LIMIT ? `${body.slice(0, BODY_LIMIT - 1)}…` : body) : "Open your admin to see it.",
    url: safeLink(link),
    tag: key,
  };
}

const KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;

/** What a browser sends when it signs up. Null when it is not a usable push address and keys. */
export function readSubscription(body: unknown): PushSubscriptionRow | null {
  if (!body || typeof body !== "object") return null;
  const { endpoint, keys } = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys?.auth === "string" ? keys.auth : "";
  return KEY_RE.test(p256dh) && KEY_RE.test(auth) ? { endpoint, p256dh, auth } : null;
}
