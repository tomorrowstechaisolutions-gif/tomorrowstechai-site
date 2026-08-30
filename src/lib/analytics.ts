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

/**
 * The pixel is loaded lazily and only after the visitor accepts advertising
 * cookies, so `fbq` usually does not exist yet when a page fires its first
 * event from a mount effect. Returning early there silently dropped every
 * ViewContent on the campaign landing page for the whole first launch.
 *
 * So: queue, and flush the moment the pixel is alive. The queue expires after
 * PIXEL_WAIT_MS — if consent is never granted the events are discarded, never
 * fired late behind the visitor's back.
 */
const PIXEL_WAIT_MS = 30_000;

type QueuedMetaEvent = {
  name: MetaEvent;
  params: Record<string, unknown>;
  eventId?: string;
};

const metaQueue: QueuedMetaEvent[] = [];
let watchingForPixel = false;

function pixelReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}

function sendToPixel(event: QueuedMetaEvent) {
  const fbq = typeof window === "undefined" ? undefined : window.fbq;
  if (typeof fbq !== "function") return;
  fbq(
    "track",
    event.name,
    event.params,
    event.eventId ? { eventID: event.eventId } : undefined
  );
}

function flushMetaQueue() {
  if (!pixelReady()) return;
  while (metaQueue.length) {
    const next = metaQueue.shift();
    if (next) sendToPixel(next);
  }
}

function watchForPixel() {
  if (watchingForPixel || typeof window === "undefined") return;
  watchingForPixel = true;
  const deadline = Date.now() + PIXEL_WAIT_MS;

  const tick = () => {
    if (pixelReady()) {
      flushMetaQueue();
      watchingForPixel = false;
      return;
    }
    if (Date.now() > deadline) {
      metaQueue.length = 0;
      watchingForPixel = false;
      return;
    }
    window.setTimeout(tick, 250);
  };

  window.setTimeout(tick, 250);
}

export function metaEvent(
  name: MetaEvent,
  params: Record<string, unknown> = {},
  eventId?: string
) {
  if (typeof window === "undefined") return;

  const event: QueuedMetaEvent = { name, params, eventId };

  if (pixelReady()) {
    flushMetaQueue();
    sendToPixel(event);
    return;
  }

  metaQueue.push(event);
  watchForPixel();
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
