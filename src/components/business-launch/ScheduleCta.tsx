"use client";

import { trackConversion } from "@/lib/analytics";
import { BUSINESS_LAUNCH_OFFER, type Offer } from "@/lib/campaign/offers";
import { sendServerEvent } from "@/lib/campaign/track-client";

/** Booking link on the thank-you page. Reports a Schedule conversion. */
export function ScheduleCta({
  href,
  children,
  className,
  offer = BUSINESS_LAUNCH_OFFER,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  offer?: Offer;
}) {
  function onClick() {
    const eventId = trackConversion({
      meta: "Schedule",
      ga: `${offer.id.replace(/-/g, "_")}_booking`,
      params: { content_name: `${offer.name} consultation` },
    });
    void sendServerEvent({
      event: "Schedule",
      eventId,
      customData: { content_name: `${offer.name} consultation` },
    });
  }

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
