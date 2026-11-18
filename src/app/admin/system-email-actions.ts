"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Resend } from "resend";
import { getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { systemEmail } from "@/lib/system-emails/registry";
import { emailCopy, forgetEmailCopy } from "@/lib/system-emails/store";

const BASE = "/admin/system/emails";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return session;
}

function back(key: string, message: string, error = false): never {
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${key}`);
  redirect(`${BASE}/${encodeURIComponent(key)}?${new URLSearchParams({ [error ? "error" : "notice"]: message })}`);
}

/** Saves the edited wording. Only slots that differ from the shipped text are stored. */
export async function saveEmailCopyAction(fd: FormData) {
  const session = await requireAdmin();
  const key = String(fd.get("key") ?? "");
  const def = systemEmail(key);
  if (!def) redirect(`${BASE}?error=${encodeURIComponent("Unknown email.")}`);

  const copy: Record<string, string> = {};
  for (const slot of def!.slots) {
    const v = fd.get(`slot:${slot.key}`);
    if (typeof v !== "string") continue;
    const value = v.replace(/\r\n/g, "\n").trim().slice(0, 4000);
    if (value && value !== slot.default) copy[slot.key] = value;
  }

  const db = supabaseAdmin();
  const { error } = Object.keys(copy).length
    ? await db.from("system_email_copy").upsert({ key, copy, updated_at: new Date().toISOString(), updated_by: session.admin.email }, { onConflict: "key" })
    : await db.from("system_email_copy").delete().eq("key", key);
  forgetEmailCopy();
  if (error) back(key, error.message, true);
  back(key, Object.keys(copy).length ? `Saved. ${Object.keys(copy).length} part${Object.keys(copy).length === 1 ? "" : "s"} changed from the original.` : "Saved. This email uses its original wording.");
}

/** Back to the shipped wording. */
export async function resetEmailCopyAction(fd: FormData) {
  await requireAdmin();
  const key = String(fd.get("key") ?? "");
  const { error } = await supabaseAdmin().from("system_email_copy").delete().eq("key", key);
  forgetEmailCopy();
  if (error) back(key, error.message, true);
  back(key, "Reset to the original wording.");
}

/** Sends the saved version, filled with sample data, to the owner's inbox. */
export async function sendTestEmailAction(fd: FormData) {
  await requireAdmin();
  const key = String(fd.get("key") ?? "");
  const def = systemEmail(key);
  if (!def) redirect(`${BASE}?error=${encodeURIComponent("Unknown email.")}`);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) back(key, "RESEND_API_KEY isn't set, so test emails can't be sent.", true);

  const to = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
  const built = def!.preview(await emailCopy(key));
  try {
    const res = await new Resend(apiKey).emails.send({
      from: process.env.CONTACT_FROM_EMAIL || "Tomorrow's Tech AI <hello@tomorrowstechai.com>",
      to,
      subject: `[Test] ${built.subject}`,
      html: built.html,
      text: built.text,
    });
    if (res.error) back(key, `Resend refused the test: ${res.error.message}`, true);
  } catch (err) {
    back(key, err instanceof Error ? err.message : "The test email failed.", true);
  }
  back(key, `Test sent to ${to} with sample data.`);
}
