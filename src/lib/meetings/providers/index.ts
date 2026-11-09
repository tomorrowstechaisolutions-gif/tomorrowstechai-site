import "server-only";
import type { MeetingProviderKey } from "../config";
import { PROVIDER_LABELS } from "../config";
import { googleMeetProvider } from "./google";
import { zoomProvider } from "./zoom";
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
 * provider. Zoom arrived exactly as planned: providers/zoom.ts against the
 * interface, one line in this map.
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

const REGISTRY: Record<MeetingProviderKey, MeetingProvider> = {
  google_meet: googleMeetProvider,
  zoom: zoomProvider,
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
