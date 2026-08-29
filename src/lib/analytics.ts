"use client";

/**
 * One place for every marketing event. Sends the same conversion to GA4 and
 * to the Meta Pixel, and returns the event_id so the server-side Conversions
 * API call can be deduplicated against the browser one.
 *
 * Nothing here creates a tag. GA4 is loaded once in the root layout via
 * @next/third-parties; the Meta Pixel is loaded once in MetaPixel.tsx.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export type MetaEvent =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "Contact"
  | "Schedule"
  | "InitiateCheckout"
  | "Purchase";

export function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function gaEvent(name: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

export function metaEvent(
  name: MetaEvent,
  params: Record<string, unknown> = {},
  eventId?: string
) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", name, params, eventId ? { eventID: eventId } : undefined);
}

/**
 * Fire a campaign conversion to both platforms at once.
 * Returns the event_id used, so the caller can hand it to the server.
 */
export function trackConversion(opts: {
  meta: MetaEvent;
  ga: string;
  params?: Record<string, unknown>;
  metaParams?: Record<string, unknown>;
  eventId?: string;
}): string {
  const eventId = opts.eventId ?? newEventId();
  gaEvent(opts.ga, { ...opts.params, event_id: eventId });
  metaEvent(opts.meta, { ...opts.params, ...opts.metaParams }, eventId);
  return eventId;
}
