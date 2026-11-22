/**
 * Tomorrow's Tech AI's own social accounts, matched by display name or handle.
 *
 * Many accounts are connected in Social Center (Held, Dark Tides and others).
 * Anything that posts for the brand automatically picks its accounts from
 * this list, so a post can never land on another brand's page.
 */
export type BrandDestination = { platform: "linkedin" | "facebook" | "instagram" | "x"; match: RegExp; needsImage?: boolean };

export const DESTINATIONS: BrandDestination[] = [
  { platform: "linkedin", match: /^john c\.? hockinson/i },
  { platform: "facebook", match: /^tomorrows tech ai solutions$/i },
  { platform: "instagram", match: /^@?tomorrowstechai$/i, needsImage: true },
  // John's personal X account; the publisher fits the caption to 280 characters.
  { platform: "x", match: /hockinson/i },
];
