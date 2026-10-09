import "server-only";
import { ZOOM_API, ZoomAuthError, clearZoomError, zoomAccessToken } from "./oauth";

/**
 * The Zoom Meetings API, the four calls the Conference Center needs.
 *
 * Every call goes through `zoomFetch`, which retries exactly once with a
 * forced token refresh on a 401 (a token revoked early, or a clock skew) and
 * turns every other failure into a sentence a person can act on. Nothing in
 * here ever returns a made-up meeting: if Zoom did not confirm it, the caller
 * gets an error, not an object.
 */

export class ZoomApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly needsReconnect: boolean;
  constructor(message: string, status: number, code: number | null, needsReconnect = false) {
    super(message);
    this.name = "ZoomApiError";
    this.status = status;
    this.code = code;
    this.needsReconnect = needsReconnect;
  }
}

async function zoomFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  let token: string;
  try {
    token = await zoomAccessToken(retried);
  } catch (error) {
    if (error instanceof ZoomAuthError) {
      throw new ZoomApiError(error.message, 401, null, error.needsReconnect);
    }
    throw error;
  }

  let res: Response;
  try {
    res = await fetch(`${ZOOM_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new ZoomApiError("Could not reach Zoom. Check the connection and try again.", 0, null);
  }

  if (res.status === 401 && !retried) return zoomFetch(path, init, true);
  return res;
}

async function failFrom(res: Response, fallback: string): Promise<never> {
  let code: number | null = null;
  let message = fallback;
  try {
    const body = (await res.json()) as { code?: number; message?: string };
    code = typeof body.code === "number" ? body.code : null;
    if (body.message) message = body.message;
  } catch {
    /* keep fallback */
  }
  if (res.status === 429) {
    message = "Zoom's rate limit was reached. Wait a minute and try again.";
  }
  const reconnect = res.status === 401
    || (res.status === 403 && /scope|token|authoriz/i.test(message))
    || code === 124;
  if (reconnect) message = `${message} — reconnect Zoom in Conference Center → Zoom settings.`;
  throw new ZoomApiError(message, res.status, code, reconnect);
}

export type ZoomMeetingSettings = {
  waiting_room: boolean;
  join_before_host: boolean;
  mute_upon_entry: boolean;
  host_video: boolean;
  participant_video: boolean;
  auto_recording: "none" | "local" | "cloud";
};

export type ZoomMeetingInput = {
  /** 1 = instant, 2 = scheduled. */
  type: 1 | 2;
  topic: string;
  agenda?: string | null;
  /** ISO instant. Ignored by Zoom for instant meetings. */
  startAt?: string | null;
  durationMinutes: number;
  timezone: string;
  invitees?: string[];
  settings: ZoomMeetingSettings;
};

/** What Zoom hands back. `start_url` is HOST-ONLY and is never persisted. */
export type ZoomMeeting = {
  id: number;
  uuid: string;
  host_id?: string;
  host_email?: string;
  topic: string;
  type: number;
  status?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  join_url: string;
  start_url: string;
  password?: string;
  h323_password?: string;
  pstn_password?: string;
  encrypted_password?: string;
};

function utcStart(iso: string): string {
  // Zoom reads `yyyy-MM-ddTHH:mm:ssZ` as GMT regardless of `timezone`, which
  // then only controls how Zoom displays it. No wall-clock guessing here.
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function payload(input: ZoomMeetingInput) {
  return {
    topic: input.topic.slice(0, 200),
    // On PATCH this also converts an instant meeting into a scheduled one
    // when it is moved — the id and join link stay the same.
    type: input.type,
    ...(input.type === 2 && input.startAt ? { start_time: utcStart(input.startAt) } : {}),
    duration: Math.max(1, Math.round(input.durationMinutes)),
    timezone: input.timezone,
    ...(input.agenda ? { agenda: input.agenda.slice(0, 2000) } : {}),
    settings: {
      ...input.settings,
      // Zoom's own email to invitees is unreliable and unbranded; ours goes
      // out through Resend instead. These only add guests to the calendar
      // attachment Zoom generates.
      ...(input.invitees && input.invitees.length > 0
        ? { meeting_invitees: input.invitees.map((email) => ({ email })) }
        : {}),
      email_notification: false,
    },
  };
}

export async function createZoomMeeting(input: ZoomMeetingInput): Promise<ZoomMeeting> {
  const res = await zoomFetch("/users/me/meetings", {
    method: "POST",
    body: JSON.stringify(payload(input)),
  });
  if (res.status !== 201 && !res.ok) await failFrom(res, "Zoom refused to create the meeting.");

  const meeting = (await res.json()) as ZoomMeeting;
  if (!meeting?.id || !meeting.join_url) {
    throw new ZoomApiError("Zoom answered without a meeting id or join link, so nothing was saved as created.", res.status, null);
  }
  await clearZoomError();
  return meeting;
}

export async function getZoomMeeting(meetingId: string): Promise<ZoomMeeting> {
  const res = await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`);
  if (!res.ok) await failFrom(res, "Zoom could not find that meeting.");
  return (await res.json()) as ZoomMeeting;
}

/** PATCH keeps the meeting id and join link — rescheduling never mints a second room. */
export async function updateZoomMeeting(meetingId: string, input: ZoomMeetingInput): Promise<void> {
  const res = await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload(input)),
  });
  if (res.status !== 204 && !res.ok) await failFrom(res, "Zoom refused to update the meeting.");
}

/** 404 / code 3001 means it is already gone, which is what was asked for. */
export async function deleteZoomMeeting(meetingId: string): Promise<void> {
  const res = await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`, { method: "DELETE" });
  if (res.status === 204 || res.ok || res.status === 404) return;
  await failFrom(res, "Zoom refused to delete the meeting.");
}
