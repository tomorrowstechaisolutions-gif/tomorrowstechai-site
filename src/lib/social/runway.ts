import "server-only";
import { Resend } from "resend";
import { notifyOwner } from "@/lib/notifications/owner";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DAILY_CAMPAIGN_PREFIX } from "./batch";
import { daysOfRunway, runwayAlert } from "./runway-core";

/**
 * Tells John before the daily social posts run out. Run once a day by
 * /api/cron/social-runway.
 *
 * Only posts loaded from a batch are counted (their campaign starts with
 * "Daily: "). A blog article's post or one John scheduled himself does not
 * make the queue look longer than it is.
 */

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || "Tomorrow’s Tech AI <hello@tomorrowstechai.com>";
const CALENDAR_LINK = "/admin/marketing/social?tab=calendar";

export async function checkSocialRunway(now = new Date()): Promise<{ daysLeft: number; lastDate: string | null; alerted: boolean }> {
  const { data, error } = await supabaseAdmin()
    .from("social_posts")
    .select("scheduled_at")
    .eq("status", "scheduled")
    .is("deleted_at", null)
    .like("campaign", `${DAILY_CAMPAIGN_PREFIX}%`)
    .gt("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const last = (data?.[0]?.scheduled_at as string | undefined) ?? null;
  const daysLeft = daysOfRunway(last ? [last] : [], now);

  // What has already been said, so each alert goes out once. "skipped" counts:
  // John switched this alert off, and that is not a reason to keep trying.
  const { data: log } = await supabaseAdmin()
    .from("notification_log")
    .select("summary, created_at")
    .eq("key", "social.runway")
    .in("status", ["sent", "skipped"])
    .gte("created_at", new Date(now.getTime() - 8 * 86_400_000).toISOString());

  const alert = runwayAlert(daysLeft, Boolean(last), (log ?? []) as { summary: string | null; created_at: string }[], now);
  if (!alert) return { daysLeft, lastDate: last, alerted: false };

  const ok = await notifyOwner("social.runway", alert.summary, async () => {
    if (!process.env.RESEND_API_KEY) return false;
    const res = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: alert.summary,
      text: `${alert.summary}\n\nSee what is scheduled: https://www.tomorrowstechai.com${CALENDAR_LINK}`,
    });
    return !res.error;
  }, CALENDAR_LINK);
  // A failed send is a failed run: it shows red in the cron log, and nothing
  // was logged as sent, so tomorrow's run tries again.
  if (!ok) throw new Error(`The runway alert was due (${daysLeft} days left) but could not be sent.`);
  return { daysLeft, lastDate: last, alerted: true };
}
