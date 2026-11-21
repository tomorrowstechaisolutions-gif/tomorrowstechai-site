import "server-only";
import { pushToOwner } from "@/lib/push/send";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import type { NotificationKey } from "./names";

/**
 * Emails to John (the owner), with an on/off switch per kind and a log.
 *
 * Every owner email in the site goes through notifyOwner(): it checks the
 * switch, runs the send, and records sent / skipped / failed. A skipped
 * notification reports success to its caller, so turning one off never
 * looks like an email failure anywhere else.
 *
 * Fail-open by design: if the preferences can't be read, the email goes out.
 * Missing a real lead because a settings lookup hiccupped is the worse error.
 */

export { NOTIFICATIONS, type NotificationDef, type NotificationKey } from "./names";

let cache: { at: number; off: Set<string> } | null = null;

async function disabledKeys(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.off;
  if (!supabaseConfigured()) return new Set();
  try {
    const { data } = await supabaseAdmin().from("notification_preferences").select("key").eq("email_enabled", false);
    cache = { at: Date.now(), off: new Set((data ?? []).map((r) => r.key as string)) };
    return cache.off;
  } catch {
    return new Set();
  }
}

/** Called after a preference changes so the next send sees it immediately. */
export function forgetNotificationPreferences() {
  cache = null;
}

function record(key: NotificationKey, status: "sent" | "skipped" | "failed", summary: string | null) {
  if (!supabaseConfigured()) return;
  void Promise.resolve(
    supabaseAdmin().from("notification_log").insert({ key, status, summary: summary?.slice(0, 300) ?? null })
  ).catch((err: unknown) => console.error("notification_log insert failed:", err));
}

/**
 * Sends an owner email unless that kind is switched off, and logs the result.
 * `link` is the admin page a phone alert opens when tapped.
 * `send` returns true when the email went out. Returns true for sent AND for
 * skipped (so callers treat "off" as fine), false only when sending failed.
 */
export async function notifyOwner(key: NotificationKey, summary: string | null, send: () => Promise<boolean | void>, link?: string | null): Promise<boolean> {
  if ((await disabledKeys()).has(key)) {
    record(key, "skipped", summary);
    return true;
  }
  // The same alert also goes to John's phone, if a device has signed up. It
  // follows the same switch as the email, and never holds up or fails the email.
  void pushToOwner(key, summary, link).catch((err: unknown) => console.error("[push] alert failed:", err instanceof Error ? err.message : err));
  try {
    const ok = (await send()) !== false;
    record(key, ok ? "sent" : "failed", summary);
    return ok;
  } catch (err) {
    record(key, "failed", summary);
    throw err;
  }
}
