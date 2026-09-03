import "server-only";
import type { MeetingProviderKey } from "../config";
import { PROVIDER_LABELS } from "../config";
import { googleMeetProvider } from "./google";
import { ProviderError } from "./types";
import type {
  MeetingProvider, ProviderMeetingInput, ProviderResult, ProviderStatus,
} from "./types";

export { ProviderError };
export type { MeetingProvider, ProviderMeetingInput, ProviderResult, ProviderStatus };

/**
 * The registry.
 *
 * `providerFor(key)` is the only way the rest of the application reaches a
 * provider, so adding Zoom is: write providers/zoom.ts against the interface,
 * add it to this map, delete the placeholder below. No screen changes, no
 * service changes, no migration.
 */

/**
 * Phone and In Person.
 *
 * They are real providers, not an absence of one: the meeting is scheduled,
 * it appears on the calendar, it has an outcome and a follow-up. What they
 * have no concept of is a room to join, so they hold no external event and
 * produce no URL. Modelling them here rather than as `if (provider === ...)`
 * scattered through the service is what keeps that branching out of the UI.
 */
function manualProvider(key: MeetingProviderKey): MeetingProvider {
  const empty: ProviderResult = { eventId: null, calendarId: null, joinUrl: null, metadata: {} };
  return {
    key,
    label: PROVIDER_LABELS[key],
    async status() {
      return { key, label: PROVIDER_LABELS[key], ready: true };
    },
    async create() { return empty; },
    async update() { return empty; },
    async cancel() { /* nothing external to cancel */ },
  };
}

/**
 * Zoom, not yet built.
 *
 * Deliberately a real object that refuses rather than a missing key, so the
 * form can show the option, explain itself, and refuse at the one point where
 * refusing matters. When Zoom is built this whole constant is deleted.
 */
const zoomComingSoon: MeetingProvider = {
  key: "zoom",
  label: "Zoom",
  async status() {
    return {
      key: "zoom",
      label: "Zoom",
      ready: false,
      comingSoon: true,
      reason: "Zoom is not connected yet. Google Meet, phone and in-person all work today.",
    };
  },
  async create() {
    throw new ProviderError("zoom", "Zoom is not available yet. Pick Google Meet, phone or in person.");
  },
  async update() {
    throw new ProviderError("zoom", "Zoom is not available yet.");
  },
  async cancel() {
    // Nothing was ever created, so there is nothing to cancel and nothing to
    // fail — cancelling a Zoom meeting must not block cancelling the row.
  },
};

const REGISTRY: Record<MeetingProviderKey, MeetingProvider> = {
  google_meet: googleMeetProvider,
  zoom: zoomComingSoon,
  phone: manualProvider("phone"),
  in_person: manualProvider("in_person"),
};

export function providerFor(key: MeetingProviderKey): MeetingProvider {
  return REGISTRY[key] ?? REGISTRY.google_meet;
}

/**
 * Every provider's readiness, for the scheduling form.
 *
 * One that throws while reporting its own status reports as not ready rather
 * than taking the form down with it.
 */
export async function providerStatuses(): Promise<ProviderStatus[]> {
  const keys = Object.keys(REGISTRY) as MeetingProviderKey[];
  const settled = await Promise.allSettled(keys.map((key) => REGISTRY[key].status()));
  return settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          key: keys[index],
          label: PROVIDER_LABELS[keys[index]],
          ready: false,
          reason: "Could not check this provider just now.",
        }
  );
}
