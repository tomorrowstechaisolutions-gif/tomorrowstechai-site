"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/server";
import { pullAppReport } from "@/lib/apps/report";

/**
 * "Pull now" on an app's Business tab.
 *
 * Reading a product's report changes nothing in that product, so any signed-in
 * admin may ask for a fresh one. The admin is still re-checked here: a form
 * post is not a page view and the session may have gone.
 *
 * Returns a result instead of throwing so the button can say what went wrong
 * in place, next to the numbers, rather than swapping the page for an error.
 */
export async function pullAppReportNow(appId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getAdminUser();
  if (!session) return { ok: false, error: "Your session ended. Sign in again, then Pull now." };
  if (!/^[0-9a-f-]{36}$/i.test(appId)) return { ok: false, error: "That app could not be found." };

  const result = await pullAppReport(appId);

  revalidatePath("/admin/apps");
  revalidatePath(`/admin/apps/${appId}`);
  revalidatePath("/admin/system/integrations");

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
