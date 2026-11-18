import "server-only";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import type { EmailCopy } from "./copy";

/**
 * Saved wording overrides, read by the senders right before an email goes
 * out. Cached for 30 seconds per server instance; a save clears the cache.
 *
 * Fails safe: if the overrides can't be read, the email still sends with its
 * shipped wording. A system email must never fail because of the editor.
 */

let cache: { at: number; rows: Map<string, Partial<EmailCopy>> } | null = null;

async function all(): Promise<Map<string, Partial<EmailCopy>>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.rows;
  const rows = new Map<string, Partial<EmailCopy>>();
  if (!supabaseConfigured()) return rows;
  try {
    const { data } = await supabaseAdmin().from("system_email_copy").select("key, copy");
    for (const r of data ?? []) rows.set(r.key as string, (r.copy ?? {}) as Partial<EmailCopy>);
    cache = { at: Date.now(), rows };
  } catch {
    /* shipped wording */
  }
  return rows;
}

/** The edited slots for one email (empty when it uses shipped wording). */
export async function emailCopy(key: string): Promise<Partial<EmailCopy>> {
  return (await all()).get(key) ?? {};
}

/** Every email that has edits, for the list page. */
export async function editedEmailKeys(): Promise<Map<string, { slots: number }>> {
  const out = new Map<string, { slots: number }>();
  for (const [k, v] of await all()) out.set(k, { slots: Object.keys(v).length });
  return out;
}

export function forgetEmailCopy() {
  cache = null;
}
