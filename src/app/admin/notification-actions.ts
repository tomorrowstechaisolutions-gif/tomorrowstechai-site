"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NOTIFICATIONS, forgetNotificationPreferences } from "@/lib/notifications/owner";

const PAGE = "/admin/system/notifications";

/** Turns one owner email on or off. */
export async function setNotificationAction(fd: FormData) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const key = String(fd.get("key") ?? "");
  const enabled = fd.get("enabled") === "true";
  const def = NOTIFICATIONS.find((n) => n.key === key);
  if (!def) redirect(`${PAGE}?error=${encodeURIComponent("Unknown notification.")}`);

  const { error } = await supabaseAdmin().from("notification_preferences").upsert(
    { key, email_enabled: enabled, updated_at: new Date().toISOString(), updated_by: session.admin.email },
    { onConflict: "key" }
  );
  forgetNotificationPreferences();
  revalidatePath(PAGE);
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(error.message)}`);
  redirect(`${PAGE}?notice=${encodeURIComponent(`${def!.label}: email ${enabled ? "on" : "off"}.`)}`);
}
