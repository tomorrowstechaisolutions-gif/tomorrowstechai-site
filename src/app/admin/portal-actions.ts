"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { VIEW_AS_COOKIE } from "@/lib/portal/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { issuePortalLink } from "@/lib/portal/links";
import { sendPortalInvite } from "@/lib/portal/emails";

/**
 * Inviting a client to the member portal. Their username is the email on
 * their client record; the email lets them choose a password. Re-sending is
 * safe: it issues a fresh one-time link.
 */

function str(fd: FormData, key: string, max = 200): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function back(customerId: string, params: Record<string, string>): never {
  revalidatePath(`/admin/clients/${customerId}`);
  redirect(`/admin/clients/${customerId}?${new URLSearchParams(params)}`);
}

/**
 * "View as this client": open their member portal the way they see it.
 *
 * Sets a short-lived cookie naming the client, readable only under /account.
 * The portal honours it only for an admin login and only to draw pages (see
 * getPortalViewer). It is not a sign-in as the client: no session of theirs
 * is created, their last-sign-in time does not move, and nothing can be
 * written from the view.
 */
export async function viewAsClientAction(fd: FormData) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const customerId = str(fd, "customer_id", 40);
  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase.from("customers").select("id").eq("id", customerId).maybeSingle();
  if (!c) back(customerId, { portal_error: "Client not found." });

  (await cookies()).set(VIEW_AS_COOKIE, c.id, {
    path: "/account",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60,
  });
  redirect("/account");
}

/** Leave the client's view and go back to their page in the admin. */
export async function exitViewAsClientAction(fd: FormData) {
  const customerId = str(fd, "customer_id", 40);
  (await cookies()).set(VIEW_AS_COOKIE, "", { path: "/account", maxAge: 0 });
  redirect(/^[0-9a-f-]{36}$/i.test(customerId) ? `/admin/clients/${customerId}` : "/admin/clients");
}

export async function invitePortalMemberAction(fd: FormData) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const customerId = str(fd, "customer_id", 40);
  const supabase = await createSupabaseServerClient();

  const { data: c } = await supabase.from("customers").select("id, email, name, business_name").eq("id", customerId).maybeSingle();
  if (!c) back(customerId, { portal_error: "Client not found." });
  const email = (c.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) back(customerId, { portal_error: "Add an email to this client first. It becomes their username." });

  const db = supabaseAdmin();
  // Never turn an admin login into a client login.
  const { data: admins } = await db.from("admin_users").select("email");
  if ((admins ?? []).some((a) => (a.email ?? "").toLowerCase() === email)) {
    back(customerId, { portal_error: "That email is an admin login. Use the client's own email." });
  }
  const { data: other } = await db.from("portal_members").select("id, customer_id").ilike("email", email).maybeSingle();
  if (other && other.customer_id !== customerId) back(customerId, { portal_error: "That email already has a member account for another client." });

  let link;
  try {
    link = await issuePortalLink(email, other ? "recovery" : "invite");
  } catch (err) {
    back(customerId, { portal_error: `Could not create the invite link: ${err instanceof Error ? err.message : "unknown error"}` });
  }

  const now = new Date().toISOString();
  const { data: existing } = await db.from("portal_members").select("id, invite_count, status").eq("customer_id", customerId).ilike("email", email).maybeSingle();
  const row = {
    customer_id: customerId,
    user_id: link.userId,
    email,
    full_name: c.name ?? null,
    invited_at: now,
    invited_by: session.admin.email,
    updated_at: now,
  };
  const save = existing
    ? await db.from("portal_members").update({ ...row, invite_count: (existing.invite_count ?? 0) + 1, status: existing.status === "disabled" ? "invited" : existing.status }).eq("id", existing.id)
    : await db.from("portal_members").insert({ ...row, invite_count: 1, status: "invited" });
  if (save.error) back(customerId, { portal_error: save.error.message });

  const sent = await sendPortalInvite({ to: email, name: c.name ?? null, businessName: c.business_name || c.name || "your business", url: link.url });
  back(customerId, sent ? { portal_notice: `Invite sent to ${email}.` } : { portal_error: "The member account is ready but the email didn't send. Try Resend invite." });
}

export async function setPortalMemberStatusAction(fd: FormData) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const customerId = str(fd, "customer_id", 40);
  const memberId = str(fd, "member_id", 40);
  const disable = str(fd, "disable", 5) === "1";
  const supabase = await createSupabaseServerClient();
  const { data: m } = await supabase.from("portal_members").select("id, activated_at").eq("id", memberId).eq("customer_id", customerId).maybeSingle();
  if (!m) back(customerId, { portal_error: "Member account not found." });
  const { error } = await supabase
    .from("portal_members")
    .update({ status: disable ? "disabled" : m.activated_at ? "active" : "invited", updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (error) back(customerId, { portal_error: error.message });
  back(customerId, { portal_notice: disable ? "Member access turned off. They can no longer sign in." : "Member access turned back on." });
}

export async function closePortalRequestAction(fd: FormData) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const customerId = str(fd, "customer_id", 40);
  const requestId = str(fd, "request_id", 40);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("portal_requests")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: session.admin.email })
    .eq("id", requestId)
    .eq("customer_id", customerId);
  back(customerId, error ? { portal_error: error.message } : { portal_notice: "Request closed." });
}
