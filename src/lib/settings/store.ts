import "server-only";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { BUILT_IN, resolveDefaults, isHttpsUrl, type BusinessDefaults } from "./defaults";

/**
 * Reads and writes the business defaults (one row in business_settings).
 * Cached for 30 seconds per server instance; a save clears the cache.
 *
 * Fails safe: if the row can't be read, callers get the built-in values, so
 * raising an invoice or queueing a follow-up never fails because of Settings.
 */

const KEY = "business_defaults";

/**
 * What an unset field falls back to. The review link honours the older
 * GOOGLE_REVIEW_URL variable so a deployment that set it keeps working.
 */
export function baseDefaults(): BusinessDefaults {
  const fromEnv = (process.env.GOOGLE_REVIEW_URL ?? "").trim();
  return fromEnv && isHttpsUrl(fromEnv) ? { ...BUILT_IN, reviewUrl: fromEnv } : BUILT_IN;
}

export type StoredDefaults = {
  value: BusinessDefaults;
  /** True when a row has been saved (so "Reset" has something to remove). */
  saved: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  readError: string | null;
};

let cache: { at: number; row: StoredDefaults } | null = null;

const fallback = (readError: string): StoredDefaults => ({ value: baseDefaults(), saved: false, updatedAt: null, updatedBy: null, readError });

/** The defaults plus who last saved them. Used by the Settings page. */
export async function loadBusinessDefaults(): Promise<StoredDefaults> {
  if (cache && Date.now() - cache.at < 30_000) return cache.row;
  if (!supabaseConfigured()) return fallback("The database is not configured.");
  try {
    const { data, error } = await supabaseAdmin().from("business_settings").select("value, updated_at, updated_by").eq("key", KEY).maybeSingle();
    if (error) return fallback(error.message);
    const row: StoredDefaults = {
      value: resolveDefaults(data?.value, baseDefaults()),
      saved: Boolean(data),
      updatedAt: (data?.updated_at as string | undefined) ?? null,
      updatedBy: (data?.updated_by as string | undefined) ?? null,
      readError: null,
    };
    cache = { at: Date.now(), row };
    return row;
  } catch (cause) {
    return fallback(cause instanceof Error ? cause.message : "Settings could not be read.");
  }
}

/** The defaults in force right now. Never throws. */
export async function businessDefaults(): Promise<BusinessDefaults> {
  return (await loadBusinessDefaults()).value;
}

/** Saves the whole set. Returns an error message, or null when it saved. */
export async function saveBusinessDefaults(value: BusinessDefaults, by: string): Promise<string | null> {
  const { error } = await supabaseAdmin().from("business_settings").upsert(
    { key: KEY, value, updated_at: new Date().toISOString(), updated_by: by },
    { onConflict: "key" },
  );
  cache = null;
  return error ? error.message : null;
}

/** Deletes the saved row, so every field goes back to its built-in value. */
export async function resetBusinessDefaults(): Promise<string | null> {
  const { error } = await supabaseAdmin().from("business_settings").delete().eq("key", KEY);
  cache = null;
  return error ? error.message : null;
}
