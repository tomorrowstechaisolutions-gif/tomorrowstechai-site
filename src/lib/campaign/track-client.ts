"use client";

import { getAttribution } from "./attribution";

/**
 * Posts the server half of a conversion. The browser pixel has already sent
 * the same event_name + event_id, so Meta deduplicates the pair.
 *
 * Deliberately fire-and-forget: tracking must never block or break a click.
 */
export async function sendServerEvent(opts: {
  event: "Contact" | "Schedule" | "InitiateCheckout" | "Purchase" | "Lead" | "ViewContent";
  eventId: string;
  email?: string;
  phone?: string;
  customData?: Record<string, unknown>;
}) {
  try {
    const a = getAttribution();
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event: opts.event,
        event_id: opts.eventId,
        email: opts.email,
        phone: opts.phone,
        custom_data: opts.customData,
        source_url: typeof window !== "undefined" ? window.location.href : undefined,
        fbp: a.fbp,
        fbc: a.fbc,
      }),
    });
  } catch {
    // Tracking is best-effort. Never surface this to the visitor.
  }
}
