/**
 * The places on the floor a bot can go. Each one is a real system the crew
 * reads from or acts on; a tool names the station it works at, and the floor
 * shows a station only when some registered tool maps to it.
 *
 * "prospecting" is not here yet: nothing in this slice finds new prospects,
 * and a station with nothing behind it would be a prop.
 */
export const STATION_IDS = ["inbox", "crm", "social", "bank", "stripe", "analytics", "library"] as const;

export type StationId = (typeof STATION_IDS)[number];

export const STATION_LABEL: Record<StationId, string> = {
  inbox: "Inbox",
  crm: "CRM",
  social: "Social studio",
  bank: "Bank",
  stripe: "Stripe",
  analytics: "Analytics",
  library: "Library",
};
