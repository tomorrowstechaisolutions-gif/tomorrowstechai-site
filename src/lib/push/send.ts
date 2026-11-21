import "server-only";
import webpush from "web-push";
import type { NotificationKey } from "@/lib/notifications/names";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { pushMessage, type PushMessage, type PushSubscriptionRow } from "./message";

/**
 * Sending alerts to John's phone.
 *
 * This is Web Push: the site sends a small encrypted message to Apple's or
 * Google's push service, which delivers it to the device, where it shows on
 * the lock screen like a text. There is no monthly fee and no per-message
 * charge. It is not SMS: it does not arrive in the Messages app.
 *
 * It needs two keys of the site's own (a "VAPID" pair), set as environment
 * variables. Without them nothing is sent and nothing breaks.
 */

/** The public half of the key pair, which the browser needs in order to sign up. Safe to show. */
export function pushPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
}

export function pushConfigured(): boolean {
  return Boolean(pushPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());
}

let ready = false;
function setUp() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:hello@tomorrowstechai.com", pushPublicKey(), process.env.VAPID_PRIVATE_KEY!.trim());
  ready = true;
}

export type PushResult = { sent: number; failed: number; removed: number };

/** Send one message to every device that has signed up. A device that has gone away is forgotten. */
export async function pushToAll(message: PushMessage): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, removed: 0 };
  if (!pushConfigured() || !supabaseConfigured()) return result;
  setUp();
  const db = supabaseAdmin();
  const { data, error } = await db.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (error || !data?.length) return result;

  await Promise.all(
    (data as PushSubscriptionRow[]).map(async (device) => {
      try {
        await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(message), { TTL: 60 * 60 * 12, urgency: "high" });
        result.sent += 1;
        await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("endpoint", device.endpoint);
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404 and 410 mean the device unsubscribed or the app was removed.
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("endpoint", device.endpoint);
          result.removed += 1;
        } else {
          result.failed += 1;
          console.error("[push] a device refused the alert:", status ?? (err instanceof Error ? err.message : err));
        }
      }
    })
  );
  return result;
}

/** The phone alert that goes with one of John's notifications. */
export function pushToOwner(key: NotificationKey, summary: string | null, link?: string | null): Promise<PushResult> {
  return pushToAll(pushMessage(key, summary, link));
}
