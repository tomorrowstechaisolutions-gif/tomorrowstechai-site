"use client";

import { trackConversion } from "@/lib/analytics";
import { sendServerEvent } from "@/lib/campaign/track-client";
import { BUSINESS_LAUNCH_OFFER, type Offer } from "@/lib/campaign/offers";

/**
 * A phone or email link that reports a Contact conversion when tapped.
 * Fires browser + server halves with a shared event_id.
 */
export function ContactAction({
  href,
  children,
  className,
  method,
  offer = BUSINESS_LAUNCH_OFFER,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  method: "phone" | "email";
  offer?: Offer;
}) {
  function onClick() {
    const eventId = trackConversion({
      meta: "Contact",
      ga: offer.gaContactEvent,
      params: { method, content_name: offer.name },
    });
    void sendServerEvent({
      event: "Contact",
      eventId,
      customData: { method, content_name: offer.name },
    });
  }

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
