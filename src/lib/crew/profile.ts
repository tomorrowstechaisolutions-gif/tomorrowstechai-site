import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aboutJohnText, cleanSettings, DEFAULT_SETTINGS, howToAnswerText, LIMITS, type Note, type NoteList, type TessSettings } from "./tess-modes";

/**
 * Tess's profile for one admin: the mode and dials he picked, what he wrote
 * about himself, what she has learned about him, and the ideas she parked.
 * One row per admin in `ai_tess_profile`, written with the service role
 * (callers check the admin first).
 *
 * What John writes about himself is personal. It lives only in that row and
 * is never written into code, logs or the floor.
 */

export type TessProfile = TessSettings & {
  about: string;
  learned: Note[];
  parked: Note[];
  /** False when the table does not exist yet: the page still works, on defaults. */
  ready: boolean;
};

const TABLE = "ai_tess_profile";

function notes(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is Note => Boolean(n) && typeof n === "object" && typeof (n as Note).id === "string" && typeof (n as Note).text === "string");
}

export async function loadTessProfile(sb: SupabaseClient, userId: string): Promise<TessProfile> {
  const { data, error } = await sb.from(TABLE).select("*").eq("user_id", userId).maybeSingle();
  if (error) return { ...DEFAULT_SETTINGS, about: "", learned: [], parked: [], ready: false };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ...cleanSettings(row),
    about: typeof row.about === "string" ? row.about : "",
    learned: notes(row.learned),
    parked: notes(row.parked),
    ready: true,
  };
}

async function write(sb: SupabaseClient, userId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await sb.from(TABLE).upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not save the profile: ${error.message}`);
}

export async function saveTessSettings(sb: SupabaseClient, userId: string, settings: Record<string, unknown>): Promise<TessSettings> {
  const clean = cleanSettings(settings);
  await write(sb, userId, clean);
  return clean;
}

export async function saveTessAbout(sb: SupabaseClient, userId: string, about: string): Promise<void> {
  await write(sb, userId, { about: about.trim().slice(0, LIMITS.about) });
}

/** Add a note to a list. The same note twice is kept once; a full list drops its oldest. */
export async function addNote(sb: SupabaseClient, userId: string, list: NoteList, text: string, now: number = Date.now()): Promise<void> {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, LIMITS.note);
  if (!clean) return;
  const current = (await loadTessProfile(sb, userId))[list];
  if (current.some((n) => n.text.toLowerCase() === clean.toLowerCase())) return;
  const next = [...current, { id: randomUUID(), text: clean, at: new Date(now).toISOString() }].slice(-LIMITS.notes);
  await write(sb, userId, { [list]: next });
}

export async function removeNote(sb: SupabaseClient, userId: string, list: NoteList, id: string): Promise<void> {
  const current = (await loadTessProfile(sb, userId))[list];
  await write(sb, userId, { [list]: current.filter((n) => n.id !== id) });
}

/** What goes to Tess alongside John's message: who he is, then how to answer. */
export function contextBlocks(profile: TessProfile): string[] {
  const about = aboutJohnText(profile.about, profile.learned);
  return [...(about ? [about] : []), howToAnswerText(profile)];
}
