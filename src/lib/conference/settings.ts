import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BUSINESS_TZ } from "@/lib/time/chicago";

/**
 * conference_settings — one row per installation (scope 'default').
 *
 * Read with the service role because the Zoom provider runs inside server
 * actions and webhooks that may not carry a session. Falls back to the same
 * defaults the migration seeds, so a missing row never takes scheduling down;
 * `persisted` says whether the values came from the database.
 */

export type ConferenceSettings = {
  brand_name: string;
  default_timezone: string;
  default_duration_minutes: number;
  instant_duration_minutes: number;
  buffer_minutes: number;
  block_conflicts: boolean;
  zoom_waiting_room: boolean;
  zoom_join_before_host: boolean;
  zoom_mute_upon_entry: boolean;
  zoom_host_video: boolean;
  zoom_participant_video: boolean;
  zoom_auto_recording: "none" | "local" | "cloud";
  send_invites_by_email: boolean;
  updated_at: string | null;
  updated_by: string | null;
  persisted: boolean;
};

export const DEFAULT_CONFERENCE_SETTINGS: ConferenceSettings = {
  brand_name: "Tomorrow's Tech AI",
  default_timezone: BUSINESS_TZ,
  default_duration_minutes: 30,
  instant_duration_minutes: 60,
  buffer_minutes: 0,
  block_conflicts: true,
  zoom_waiting_room: true,
  zoom_join_before_host: false,
  zoom_mute_upon_entry: true,
  zoom_host_video: true,
  zoom_participant_video: false,
  zoom_auto_recording: "none",
  send_invites_by_email: true,
  updated_at: null,
  updated_by: null,
  persisted: false,
};

export const CONFERENCE_SCOPE = process.env.CONFERENCE_SCOPE || "default";

export async function getConferenceSettings(): Promise<ConferenceSettings> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("conference_settings")
      .select("*")
      .eq("scope", CONFERENCE_SCOPE)
      .maybeSingle();
    if (error || !data) return DEFAULT_CONFERENCE_SETTINGS;
    return { ...DEFAULT_CONFERENCE_SETTINGS, ...(data as Partial<ConferenceSettings>), persisted: true };
  } catch {
    return DEFAULT_CONFERENCE_SETTINGS;
  }
}
