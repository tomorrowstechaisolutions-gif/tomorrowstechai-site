import "server-only";
import { googleAccessToken } from "@/lib/google/oauth";

/**
 * Google Calendar events: read for the Calendar page, and the writes that
 * keep it two-way. Plain fetch, server-only, like the rest of the Google code.
 *
 * Events this site puts on Google carry `ttai_event_id` in their private
 * extended properties, so the Calendar can recognise its own events coming
 * back and not show them twice.
 */

const BASE = "https://www.googleapis.com/calendar/v3/calendars";

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  recurringEventId?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email?: string; displayName?: string; responseStatus?: string; self?: boolean }[];
  organizer?: { email?: string; self?: boolean };
  extendedProperties?: { private?: Record<string, string> };
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token, calendarId } = await googleAccessToken();
  const res = await fetch(`${BASE}/${encodeURIComponent(calendarId)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `Google Calendar returned ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = `Google Calendar: ${body.error.message}`;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Every event in a window, recurring series expanded into single events. */
export async function listGoogleEvents(fromIso: string, toIso: string): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let pageToken = "";
  for (let page = 0; page < 4; page++) {
    const params = new URLSearchParams({
      timeMin: fromIso,
      timeMax: toIso,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(`/events?${params.toString()}`);
    out.push(...(data.items ?? []).filter((e) => e.status !== "cancelled"));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

export async function getGoogleEvent(id: string): Promise<GoogleEvent> {
  return call(`/events/${encodeURIComponent(id)}`);
}

export type GoogleEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startIso: string;
  endIso: string | null;
  allDay: boolean;
  /** Chicago date for an all-day event (YYYY-MM-DD). */
  day?: string;
  recurrence?: string | null;
  ttaiEventId?: string;
};

const TZ = "America/Chicago";

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function times(input: Pick<GoogleEventInput, "startIso" | "endIso" | "allDay" | "day">) {
  if (input.allDay) {
    const day = input.day ?? input.startIso.slice(0, 10);
    return { start: { date: day }, end: { date: nextDay(day) } };
  }
  const end = input.endIso ?? new Date(new Date(input.startIso).getTime() + 3600_000).toISOString();
  return {
    start: { dateTime: input.startIso, timeZone: TZ },
    end: { dateTime: end, timeZone: TZ },
  };
}

export async function createGoogleEvent(input: GoogleEventInput): Promise<GoogleEvent> {
  return call("/events", {
    method: "POST",
    body: JSON.stringify({
      summary: input.title,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      ...times(input),
      ...(input.recurrence ? { recurrence: [`RRULE:${input.recurrence.replace(/^RRULE:/, "")}`] } : {}),
      ...(input.ttaiEventId ? { extendedProperties: { private: { ttai_event_id: input.ttaiEventId } } } : {}),
    }),
  });
}

export async function updateGoogleEvent(id: string, input: Partial<GoogleEventInput> & Pick<GoogleEventInput, "startIso" | "endIso" | "allDay">): Promise<GoogleEvent> {
  return call(`/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(input.title !== undefined ? { summary: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description ?? "" } : {}),
      ...(input.location !== undefined ? { location: input.location ?? "" } : {}),
      ...times(input),
    }),
  });
}

/** Removes the event from Google. Already-gone counts as done. */
export async function deleteGoogleEvent(id: string): Promise<void> {
  try {
    await call(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof Error && /\b(404|410)\b|not found|deleted/i.test(err.message)) return;
    throw err;
  }
}
