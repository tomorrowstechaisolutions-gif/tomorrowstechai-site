import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { applyBrandProfile } from "@/lib/email/brand";
import { BUILT_IN_PROFILE, profileView, resolveProfile, type BusinessProfile, type ProfileView } from "./profile";

/**
 * Reads and writes the business profile (one row in business_settings).
 *
 * Public pages read it through a tagged cache, so they stay fast and static
 * and still change the moment the profile is saved (the save clears the tag).
 *
 * Fails safe: if the row can't be read, callers get the built-in profile, so
 * a page or an email never fails because of Settings.
 */

const KEY = "business_profile";
export const BUSINESS_PROFILE_TAG = "business-profile";

type Row = { value: unknown; updated_at: string | null; updated_by: string | null } | null;

async function readRow(): Promise<{ row: Row; error: string | null }> {
  if (!supabaseConfigured()) return { row: null, error: "The database is not configured." };
  try {
    const { data, error } = await supabaseAdmin().from("business_settings").select("value, updated_at, updated_by").eq("key", KEY).maybeSingle();
    if (error) return { row: null, error: error.message };
    return { row: (data as Row) ?? null, error: null };
  } catch (cause) {
    return { row: null, error: cause instanceof Error ? cause.message : "The profile could not be read." };
  }
}

const cachedValue = unstable_cache(
  async (): Promise<unknown> => (await readRow()).row?.value ?? null,
  ["business-profile-value"],
  { tags: [BUSINESS_PROFILE_TAG], revalidate: 300 },
);

/** The profile in force right now, with the spellings pages need. Never throws. */
export async function businessProfile(): Promise<ProfileView> {
  try {
    return profileView(resolveProfile(await cachedValue()));
  } catch {
    return profileView(BUILT_IN_PROFILE);
  }
}

/**
 * Puts the current profile into the email brand block. Email builders are
 * plain synchronous functions, so the sender calls this just before building.
 */
export async function primeBrand(): Promise<void> {
  applyBrandProfile(await businessProfile());
}

export type StoredProfile = { value: BusinessProfile; saved: boolean; updatedAt: string | null; updatedBy: string | null; readError: string | null };

/** The profile plus who last saved it, read fresh. Used by the Settings page. */
export async function loadBusinessProfile(): Promise<StoredProfile> {
  const { row, error } = await readRow();
  return {
    value: resolveProfile(row?.value),
    saved: Boolean(row),
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
    readError: error,
  };
}

/** Saves the whole profile. Returns an error message, or null when it saved. */
export async function saveBusinessProfile(value: BusinessProfile, by: string): Promise<string | null> {
  const { error } = await supabaseAdmin().from("business_settings").upsert(
    { key: KEY, value, updated_at: new Date().toISOString(), updated_by: by },
    { onConflict: "key" },
  );
  return error ? error.message : null;
}

/** Deletes the saved row, so every field goes back to its built-in value. */
export async function resetBusinessProfile(): Promise<string | null> {
  const { error } = await supabaseAdmin().from("business_settings").delete().eq("key", KEY);
  return error ? error.message : null;
}
