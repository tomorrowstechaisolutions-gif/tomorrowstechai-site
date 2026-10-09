import "server-only";
import {
  createZoomMeeting, deleteZoomMeeting, updateZoomMeeting, ZoomApiError,
} from "@/lib/zoom/api";
import type { ZoomMeetingInput } from "@/lib/zoom/api";
import { zoomConnection } from "@/lib/zoom/oauth";
import { getConferenceSettings } from "@/lib/conference/settings";
import { ProviderError } from "./types";
import type {
  MeetingProvider, ProviderMeetingInput, ProviderResult, ProviderStatus,
} from "./types";

/**
 * Zoom, through the official OAuth app and the Meetings API.
 *
 * What is stored on the meeting row:
 *   provider_event_id → the Zoom meeting id (so update/cancel hit the same room)
 *   meeting_url       → the PARTICIPANT join_url — the only link a guest gets
 *   provider_metadata → meeting id, uuid, passcode, host email, plan warning
 *
 * What is NEVER stored: `start_url`. It carries the host's ZAK token, it
 * expires, and anyone holding it starts the meeting as the host. The Start
 * button asks Zoom for a fresh one at click time (/api/conference/[id]/start)
 * and redirects; it never lands in the database, an email, or the browser's
 * page source.
 */

const BASIC_PLAN_LIMIT_MINUTES = 40;

function minutesBetween(startAt: string, endAt: string): number {
  return Math.max(1, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000));
}

function fail(error: unknown, fallback: string): never {
  if (error instanceof ProviderError) throw error;
  if (error instanceof ZoomApiError) {
    throw new ProviderError("zoom", error.message, { needsReconnect: error.needsReconnect, cause: error });
  }
  const message = error instanceof Error ? error.message : fallback;
  throw new ProviderError("zoom", message, { cause: error });
}

async function zoomInput(input: ProviderMeetingInput): Promise<ZoomMeetingInput> {
  const settings = await getConferenceSettings();
  return {
    type: input.instant ? 1 : 2,
    topic: input.title,
    agenda: input.description,
    startAt: input.startAt,
    durationMinutes: minutesBetween(input.startAt, input.endAt),
    timezone: input.timezone,
    invitees: input.attendees.map((a) => a.email).filter(Boolean),
    settings: {
      waiting_room: settings.zoom_waiting_room,
      join_before_host: settings.zoom_join_before_host,
      mute_upon_entry: settings.zoom_mute_upon_entry,
      host_video: settings.zoom_host_video,
      participant_video: settings.zoom_participant_video,
      auto_recording: settings.zoom_auto_recording,
    },
  };
}

export const zoomProvider: MeetingProvider = {
  key: "zoom",
  label: "Zoom",

  async status(): Promise<ProviderStatus> {
    const connection = await zoomConnection();
    if (!connection.configured) {
      return {
        key: "zoom",
        label: "Zoom",
        ready: false,
        reason: `Zoom is not configured on the server. Missing: ${connection.missing.join(", ")}.`,
      };
    }
    if (!connection.connected) {
      return {
        key: "zoom",
        label: "Zoom",
        ready: false,
        reason: "Zoom is not connected yet. Connect it in Conference Center → Zoom settings.",
      };
    }
    const basic = connection.planType === 1
      ? `Basic plan: group meetings end after ${BASIC_PLAN_LIMIT_MINUTES} minutes.`
      : null;
    return {
      key: "zoom",
      label: "Zoom",
      ready: true,
      account: connection.account,
      reason: [connection.lastError, basic].filter(Boolean).join(" ") || undefined,
    };
  },

  async create(input: ProviderMeetingInput): Promise<ProviderResult> {
    try {
      const connection = await zoomConnection();
      const meeting = await createZoomMeeting(await zoomInput(input));
      const minutes = minutesBetween(input.startAt, input.endAt);
      return {
        eventId: String(meeting.id),
        calendarId: null,
        joinUrl: meeting.join_url,
        metadata: {
          zoom_meeting_id: String(meeting.id),
          zoom_uuid: meeting.uuid,
          zoom_type: meeting.type,
          passcode: meeting.password ?? null,
          host_email: meeting.host_email ?? connection.account ?? null,
          plan_warning:
            connection.planType === 1 && minutes > BASIC_PLAN_LIMIT_MINUTES
              ? `This Zoom account is on the Basic plan; meetings with other people end after ${BASIC_PLAN_LIMIT_MINUTES} minutes.`
              : null,
        },
      };
    } catch (error) {
      fail(error, "Zoom refused to create the meeting.");
    }
  },

  async update(eventId, _calendarId, input): Promise<ProviderResult> {
    try {
      // Instant meetings cannot be given a start time; treat a move as a
      // scheduled meeting from here on.
      await updateZoomMeeting(eventId, await zoomInput({ ...input, instant: false }));
      // PATCH returns 204 with no body; the join link does not change, so
      // the caller keeps the one it already has.
      return { eventId, calendarId: null, joinUrl: null, metadata: {} };
    } catch (error) {
      fail(error, "Zoom refused to update the meeting.");
    }
  },

  async cancel(eventId): Promise<void> {
    try {
      await deleteZoomMeeting(eventId);
    } catch (error) {
      fail(error, "Zoom refused to delete the meeting.");
    }
  },
};
