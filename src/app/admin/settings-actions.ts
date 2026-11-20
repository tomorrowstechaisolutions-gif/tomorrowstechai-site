"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  accessChangeAllowed, isAdminRole, parseDefaultsForm, ROLE_LABELS,
  type AdminRole, type DefaultKey,
} from "@/lib/settings/defaults";
import { resetBusinessDefaults, saveBusinessDefaults } from "@/lib/settings/store";
import { parseProfileForm, type ProfileKey } from "@/lib/settings/profile";
import { BUSINESS_PROFILE_TAG, resetBusinessProfile, saveBusinessProfile } from "@/lib/settings/profile-store";
import { saveTessAbout } from "@/lib/crew/profile";

const PAGE = "/admin/settings";
const PASSWORD_MIN = 10;

type Section = "profile" | "defaults" | "account" | "team" | "me";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return session;
}

/** Back to Settings with a message, scrolled to the section it is about. */
function back(section: Section, message: string, error = false): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?${new URLSearchParams({ [error ? "error" : "notice"]: message, at: section })}#${section}`);
}

const canEdit = (role: string) => role === "owner" || role === "admin";

/* ── Business profile ──────────────────────────────────────────────── */

/**
 * Public pages hold the profile in a tagged cache, and most of them are
 * built ahead of time. Clearing the tag and the page cache is what makes a
 * saved phone number show on the live site straight away.
 */
function profileChanged() {
  updateTag(BUSINESS_PROFILE_TAG);
  revalidatePath("/", "layout");
}

export async function saveBusinessProfileAction(fd: FormData) {
  const session = await requireAdmin();
  if (!canEdit(session.admin.role)) back("profile", "Your role can look at settings but not change them.", true);

  const parsed = parseProfileForm((name: ProfileKey) => String(fd.get(name) ?? ""));
  if (!parsed.ok) back("profile", parsed.error, true);

  const error = await saveBusinessProfile(parsed.value, session.admin.email);
  if (error) back("profile", `Not saved: ${error}`, true);
  profileChanged();
  back("profile", "Business profile saved. The site, documents and emails use it from now on.");
}

export async function resetBusinessProfileAction() {
  const session = await requireAdmin();
  if (!canEdit(session.admin.role)) back("profile", "Your role can look at settings but not change them.", true);
  const error = await resetBusinessProfile();
  if (error) back("profile", `Not reset: ${error}`, true);
  profileChanged();
  back("profile", "Profile is back to the built-in values.");
}

/* ── My profile for Tess ───────────────────────────────────────────── */

/** What the signed-in admin wrote about himself, for Tess. Personal: stored only in his own profile row. */
export async function saveMyTessProfileAction(fd: FormData) {
  const session = await requireAdmin();
  const about = String(fd.get("about") ?? "");
  try {
    await saveTessAbout(supabaseAdmin(), session.user.id, about);
  } catch (err) {
    back("me", `Not saved: ${err instanceof Error ? err.message : "unknown error"}. If the Tess profile table has not been created yet, run 20261120020000_tess_profile.sql in Supabase.`, true);
  }
  revalidatePath("/admin/ai");
  back("me", "Saved. Tess reads it from your next conversation, or your next message if you are mid-conversation.");
}

/* ── Business defaults ─────────────────────────────────────────────── */

export async function saveBusinessDefaultsAction(fd: FormData) {
  const session = await requireAdmin();
  if (!canEdit(session.admin.role)) back("defaults", "Your role can look at settings but not change them.", true);

  const parsed = parseDefaultsForm((name: DefaultKey) => String(fd.get(name) ?? ""));
  if (!parsed.ok) back("defaults", parsed.error, true);

  const error = await saveBusinessDefaults(parsed.value, session.admin.email);
  if (error) back("defaults", `Not saved: ${error}`, true);
  back("defaults", "Business defaults saved. New invoices, proposals, review asks and leads use them from now on.");
}

export async function resetBusinessDefaultsAction() {
  const session = await requireAdmin();
  if (!canEdit(session.admin.role)) back("defaults", "Your role can look at settings but not change them.", true);
  const error = await resetBusinessDefaults();
  if (error) back("defaults", `Not reset: ${error}`, true);
  back("defaults", "Back to the built-in values.");
}

/* ── Your account ──────────────────────────────────────────────────── */

export async function updateMyNameAction(fd: FormData) {
  const session = await requireAdmin();
  const name = String(fd.get("full_name") ?? "").trim().slice(0, 80);
  if (!name) back("account", "Enter the name you want shown in the admin.", true);

  const { error } = await supabaseAdmin().from("admin_users").update({ full_name: name }).eq("id", session.admin.id);
  if (error) back("account", `Not saved: ${error.message}`, true);
  revalidatePath("/admin", "layout");
  back("account", "Name saved.");
}

/**
 * Changes the signed-in admin's own password. The current password is
 * checked first on a throwaway client, so an unlocked laptop is not enough
 * to take the account over; the values are never logged or echoed back.
 */
export async function changePasswordAction(fd: FormData) {
  const session = await requireAdmin();
  const current = String(fd.get("current_password") ?? "");
  const next = String(fd.get("new_password") ?? "");
  const again = String(fd.get("confirm_password") ?? "");

  if (!current) back("account", "Enter your current password.", true);
  if (next.length < PASSWORD_MIN) back("account", `The new password needs at least ${PASSWORD_MIN} characters.`, true);
  if (next !== again) back("account", "The two new passwords don't match.", true);
  if (next === current) back("account", "The new password is the same as the current one.", true);

  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await check.auth.signInWithPassword({ email: session.user.email ?? session.admin.email, password: current });
  if (verified.error) back("account", "The current password is not right, so nothing was changed.", true);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) back("account", `Password not changed: ${error.message}`, true);
  back("account", "Password changed. Use the new one next time you sign in.");
}

/* ── Team & access ─────────────────────────────────────────────────── */

type TeamRow = { id: string; email: string; role: string };

async function team(): Promise<TeamRow[]> {
  const { data, error } = await supabaseAdmin().from("admin_users").select("id, email, role");
  if (error) back("team", `Could not read the team: ${error.message}`, true);
  return (data ?? []) as TeamRow[];
}

export async function setAdminRoleAction(fd: FormData) {
  const session = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const role = String(fd.get("role") ?? "");
  if (!isAdminRole(role)) back("team", "Pick a role.", true);

  const all = await team();
  const target = all.find((a) => a.id === id);
  if (!target) back("team", "That person is no longer on the team.", true);

  const allowed = accessChangeAllowed({ id: session.admin.id, role: session.admin.role }, target, role as AdminRole, all);
  if (!allowed.ok) back("team", allowed.reason, true);
  if (target.role === role) back("team", `${target.email} is already ${ROLE_LABELS[role as AdminRole].label.toLowerCase()}.`);

  const { error } = await supabaseAdmin().from("admin_users").update({ role }).eq("id", id);
  if (error) back("team", `Not changed: ${error.message}`, true);
  revalidatePath("/admin", "layout");
  back("team", `${target.email} is now ${ROLE_LABELS[role as AdminRole].label.toLowerCase()}.`);
}

/**
 * Takes away someone's admin access. Their sign-in still exists in Supabase,
 * but without a row in admin_users it opens nothing: every table returns
 * empty and the admin sends them back to the login page.
 */
export async function removeAdminAction(fd: FormData) {
  const session = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const all = await team();
  const target = all.find((a) => a.id === id);
  if (!target) back("team", "That person is no longer on the team.", true);

  const allowed = accessChangeAllowed({ id: session.admin.id, role: session.admin.role }, target, null, all);
  if (!allowed.ok) back("team", allowed.reason, true);

  const { error } = await supabaseAdmin().from("admin_users").delete().eq("id", id);
  if (error) back("team", `Not removed: ${error.message}`, true);
  back("team", `${target.email} no longer has admin access.`);
}
