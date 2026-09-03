/**
 * The provider contract.
 *
 * Everything above this line in the meetings module — the service, the
 * actions, every screen — talks to a meeting through these four methods and
 * never mentions Google. Adding Zoom means writing one more file that
 * satisfies this interface and adding it to the registry. Nothing else moves.
 *
 * The shape is deliberately the lowest common denominator of "a scheduled
 * conversation somewhere else": an id we can update, a link a human can
 * click, and a bag of provider-shaped detail nothing above here reads.
 */

import type { MeetingProviderKey } from "../config";

/** What a provider needs to know to put a meeting somewhere. */
export type ProviderMeetingInput = {
  title: string;
  description: string | null;
  /** ISO instants. */
  startAt: string;
  endAt: string;
  timezone: string;
  location: string | null;
  /** The one required guest, plus anyone else. May be empty. */
  attendees: { email: string; name?: string | null }[];
  /** Whether the provider should email the guests. */
  notifyAttendees: boolean;
};

/** What comes back, and gets written onto the meeting row verbatim. */
export type ProviderResult = {
  eventId: string | null;
  calendarId: string | null;
  /** The URL "Start meeting" opens. Null for phone and in-person. */
  joinUrl: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Whether the provider can be used right now, and if not, why — in words a
 * person can act on. The scheduling form reads this before it lets anyone
 * pick a provider, so nobody discovers a missing credential after typing out
 * an agenda.
 */
export type ProviderStatus = {
  key: MeetingProviderKey;
  label: string;
  ready: boolean;
  /** One sentence. Shown under the option when `ready` is false. */
  reason?: string;
  /** Which account is connected, when one is. */
  account?: string | null;
  /** True for "we have not built this yet" rather than "not configured". */
  comingSoon?: boolean;
};

export interface MeetingProvider {
  key: MeetingProviderKey;
  label: string;
  status(): Promise<ProviderStatus>;
  create(input: ProviderMeetingInput): Promise<ProviderResult>;
  update(eventId: string, calendarId: string | null, input: ProviderMeetingInput): Promise<ProviderResult>;
  cancel(eventId: string, calendarId: string | null, notify: boolean): Promise<void>;
}

/**
 * Every failure a provider can hand back, as one error type, so the actions
 * can tell a person what to do instead of printing a stack trace.
 */
export class ProviderError extends Error {
  readonly provider: MeetingProviderKey;
  /** True when reconnecting the account is the fix. */
  readonly needsReconnect: boolean;

  constructor(
    provider: MeetingProviderKey,
    message: string,
    options?: { needsReconnect?: boolean; cause?: unknown }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "ProviderError";
    this.provider = provider;
    this.needsReconnect = options?.needsReconnect ?? false;
  }
}
