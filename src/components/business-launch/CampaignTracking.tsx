"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/campaign/attribution";
import { gaEvent, metaEvent, newEventId } from "@/lib/analytics";

/**
 * Fires once per landing-page visit: stores the ad attribution for the
 * session, then reports the visit to GA4 and the Meta Pixel.
 *
 * ViewContent is browser-only on purpose. Sending a server-side copy of every
 * ad click would double the request volume for the one event where the
 * browser signal is already good enough. Lead and everything downstream of it
 * go through the Conversions API as well.
 */
export function CampaignTracking() {
  useEffect(() => {
    const attribution = captureAttribution();
    const eventId = newEventId();

    metaEvent(
      "ViewContent",
      {
        content_name: "$399 Business Launch",
        content_category: "campaign_landing",
        value: 399,
        currency: "USD",
      },
      eventId
    );

    gaEvent("business_launch_view", {
      event_id: eventId,
      campaign: attribution.utm_campaign ?? attribution.campaign ?? "(not set)",
      source: attribution.utm_source ?? attribution.source,
      medium: attribution.utm_medium ?? "(not set)",
      ad: attribution.ad ?? "(not set)",
      placement: attribution.placement ?? "(not set)",
    });
  }, []);

  return null;
}
