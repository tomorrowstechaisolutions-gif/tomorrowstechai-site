"use client";

import { trackConversion } from "@/lib/analytics";
import { sendServerEvent } from "@/lib/campaign/track-client";

/**
 * A phone or email link that reports a Contact conversion when tapped.
 * Fires browser + server halves with a shared event_id.
 */
export function ContactAction({
  href,
  children,
  className,
  method,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  method: "phone" | "email";
}) {
  function onClick() {
    const eventId = trackConversion({
      meta: "Contact",
      ga: "business_launch_contact",
      params: { method, content_name: "$399 Business Launch" },
    });
    void sendServerEvent({
      event: "Contact",
      eventId,
      customData: { method, content_name: "$399 Business Launch" },
    });
  }

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
