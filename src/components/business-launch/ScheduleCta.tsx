"use client";

import { trackConversion } from "@/lib/analytics";
import { sendServerEvent } from "@/lib/campaign/track-client";

/** Booking link on the thank-you page. Reports a Schedule conversion. */
export function ScheduleCta({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  function onClick() {
    const eventId = trackConversion({
      meta: "Schedule",
      ga: "business_launch_booking",
      params: { content_name: "$399 Business Launch consultation" },
    });
    void sendServerEvent({
      event: "Schedule",
      eventId,
      customData: { content_name: "$399 Business Launch consultation" },
    });
  }

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
