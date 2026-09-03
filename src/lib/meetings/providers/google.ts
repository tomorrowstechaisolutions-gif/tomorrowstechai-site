import "server-only";
import { googleAccessToken, googleConfigured, googleConnection } from "@/lib/google/oauth";
import { ProviderError } from "./types";
import type {
  MeetingProvider, ProviderMeetingInput, ProviderResult, ProviderStatus,
} from "./types";

/**
 * Google Calendar + Google Meet.
 *
 * One event, created on the connected account's calendar, with conferencing
 * requested rather than invented: `conferenceData.createRequest` asks Google
 * to mint the Meet room, and Google hands back the join URL. There is no code
 * path anywhere in this module that writes a meet.google.com URL we made up.
 *
 * `conferenceDataVersion=1` is required or the conferencing request is
 * silently dropped and the event comes back with no link — one of those
 * defaults that fails quietly, so it is set on every write.
 *
 * `sendUpdates=all` is what actually delivers the invitation to the client.
 */

const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars";

function eventsUrl(calendarId: string, path = "", params: Record<string, string> = {}): string {
  const search = new URLSearchParams({ conferenceDataVersion: "1", ...params });
  return `${CAL_BASE}/${encodeURIComponent(calendarId)}/events${path}?${search.toString()}`;
}

type GoogleEvent = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  conferenceData?: {
    conferenceId?: string;
    entryPoints?: { entryPointType?: string; uri?: string; label?: string }[];
    conferenceSolution?: { name?: string };
  };
  error?: { message?: string; code?: number };
};

/** Google's own words when it refuses, rather than "request failed". */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}

function toResult(event: GoogleEvent, calendarId: string): ProviderResult {
  const entry = event.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video");
  return {
    eventId: event.id ?? null,
    calendarId,
    joinUrl: event.hangoutLink ?? entry?.uri ?? null,
    metadata: {
      htmlLink: event.htmlLink ?? null,
      conferenceId: event.conferenceData?.conferenceId ?? null,
      solution: event.conferenceData?.conferenceSolution?.name ?? null,
      entryPoints: event.conferenceData?.entryPoints ?? [],
    },
  };
}

function body(input: ProviderMeetingInput, withConference: boolean) {
  return {
    summary: input.title,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    start: { dateTime: new Date(input.startAt).toISOString(), timeZone: input.timezone },
    end: { dateTime: new Date(input.endAt).toISOString(), timeZone: input.timezone },
    attendees: input.attendees.map((a) => ({ email: a.email, displayName: a.name ?? undefined })),
    ...(withConference
      ? {
          conferenceData: {
            createRequest: {
              // Unique per attempt, so a retry is a retry and not a second room.
              requestId: `ttai-${crypto.randomUUID()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {}),
  };
}

/** Reconnect-worthy failures, so the UI can say the right thing. */
function fail(message: string, status?: number): never {
  const reconnect =
    status === 401 || status === 403
    || /expired|revoked|not connected|invalid_grant|insufficient/i.test(message);
  throw new ProviderError("google_meet", message, { needsReconnect: reconnect });
}

export const googleMeetProvider: MeetingProvider = {
  key: "google_meet",
  label: "Google Meet",

  async status(): Promise<ProviderStatus> {
    if (!googleConfigured()) {
      return {
        key: "google_meet",
        label: "Google Meet",
        ready: false,
        reason: "Google is not configured on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      };
    }
    const connection = await googleConnection();
    if (!connection.connected) {
      return {
        key: "google_meet",
        label: "Google Meet",
        ready: false,
        reason: "Google Calendar is not connected yet. Connect it in Settings.",
      };
    }
    return {
      key: "google_meet",
      label: "Google Meet",
      ready: true,
      account: connection.account,
      reason: connection.lastError ?? undefined,
    };
  },

  async create(input: ProviderMeetingInput): Promise<ProviderResult> {
    const { token, calendarId } = await googleAccessToken().catch((error: unknown) => {
      fail(error instanceof Error ? error.message : "Google is not available.");
    });

    const res = await fetch(
      eventsUrl(calendarId, "", { sendUpdates: input.notifyAttendees ? "all" : "none" }),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body(input, true)),
        cache: "no-store",
      }
    ).catch(() => {
      fail("Could not reach Google Calendar. Check the connection and try again.");
    });

    if (!res.ok) fail(await readError(res, "Google Calendar refused to create the event."), res.status);

    const event = (await res.json()) as GoogleEvent;
    const result = toResult(event, calendarId);

    if (!result.eventId) {
      fail("Google Calendar created something without an event id, so it cannot be updated later.");
    }
    if (!result.joinUrl) {
      // The event exists but has no room. Saying so beats saving a meeting
      // whose Start button goes nowhere.
      fail(
        "The calendar event was created but Google did not attach a Meet link. "
        + "Check that Google Meet is enabled for this Workspace account."
      );
    }
    return result;
  },

  async update(eventId, calendarId, input): Promise<ProviderResult> {
    const { token, calendarId: fallbackCalendar } = await googleAccessToken().catch((error: unknown) => {
      fail(error instanceof Error ? error.message : "Google is not available.");
    });
    const target = calendarId || fallbackCalendar;

    // PATCH, not PUT: the existing conference is left exactly as it is, so
    // rescheduling keeps the same Meet link and does not create a second one.
    const res = await fetch(
      eventsUrl(target, `/${encodeURIComponent(eventId)}`, {
        sendUpdates: input.notifyAttendees ? "all" : "none",
      }),
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body(input, false)),
        cache: "no-store",
      }
    ).catch(() => {
      fail("Could not reach Google Calendar to move the event.");
    });

    if (!res.ok) fail(await readError(res, "Google Calendar refused to update the event."), res.status);

    return toResult((await res.json()) as GoogleEvent, target);
  },

  async cancel(eventId, calendarId, notify): Promise<void> {
    const { token, calendarId: fallbackCalendar } = await googleAccessToken().catch((error: unknown) => {
      fail(error instanceof Error ? error.message : "Google is not available.");
    });
    const target = calendarId || fallbackCalendar;

    const res = await fetch(
      eventsUrl(target, `/${encodeURIComponent(eventId)}`, {
        sendUpdates: notify ? "all" : "none",
      }),
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    ).catch(() => {
      fail("Could not reach Google Calendar to cancel the event.");
    });

    // 410 means it is already gone, which is the state we were asking for.
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      fail(await readError(res, "Google Calendar refused to cancel the event."), res.status);
    }
  },
};
