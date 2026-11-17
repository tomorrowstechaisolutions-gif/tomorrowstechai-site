"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { getPortalMember, passwordProblem } from "@/lib/portal/session";
import { issuePortalLink } from "@/lib/portal/links";
import { sendPortalReset } from "@/lib/portal/emails";

/**
 * Member portal auth. Every message a stranger can trigger is deliberately
 * vague ("if that email has an account...") so the forms can't be used to
 * find out who our clients are.
 */

export type FormState = { error?: string; notice?: string };

async function ipKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

function str(fd: FormData, key: string, max = 320): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function portalLoginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = typeof fd.get("password") === "string" ? (fd.get("password") as string).slice(0, 200) : "";
  if (!email || !password) return { error: "Enter your email and password." };

  const ip = await ipKey();
  const limit = rateLimit(`portal-login:${ip}:${email}`, { max: 8, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) return { error: "Too many attempts. Wait a few minutes and try again." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "That email and password don't match a member account." };

  // Same client, so the new session is what RLS sees.
  const { data: member } = await supabase
    .from("portal_members")
    .select("id, status")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!member || member.status === "disabled") {
    // A valid login that isn't a member (or was disabled): don't keep the session.
    await supabase.auth.signOut();
    return { error: "That email and password don't match a member account." };
  }
  await supabaseAdmin().from("portal_members").update({ last_login_at: new Date().toISOString() }).eq("id", member.id);

  const next = str(fd, "next", 200);
  redirect(next.startsWith("/account") && !next.startsWith("//") ? next : "/account");
}

export async function portalForgotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const done: FormState = { notice: "If that email has a member account, a reset link is on its way. It expires in 24 hours." };
  if (!email || !email.includes("@")) return { error: "Enter the email you sign in with." };

  const ip = await ipKey();
  if (!rateLimit(`portal-forgot:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 }).ok) return done;
  if (!rateLimit(`portal-forgot-email:${email}`, { max: 3, windowMs: 60 * 60 * 1000 }).ok) return done;

  const db = supabaseAdmin();
  const { data: m } = await db
    .from("portal_members")
    .select("id, email, full_name, status, user_id")
    .ilike("email", email)
    .maybeSingle();
  if (!m || m.status === "disabled" || !m.user_id) return done;

  try {
    const link = await issuePortalLink(m.email, "recovery");
    await sendPortalReset({ to: m.email, name: m.full_name, url: link.url });
  } catch (err) {
    console.error("[portal] reset link failed:", err);
  }
  return done;
}

export async function portalSetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await getPortalMember();
  if (!member) return { error: "Your link has expired. Use \"Forgot password\" to get a new one." };

  const pw = typeof fd.get("password") === "string" ? (fd.get("password") as string) : "";
  const confirm = typeof fd.get("confirm") === "string" ? (fd.get("confirm") as string) : "";
  const problem = passwordProblem(pw, confirm);
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: error.message.includes("same") ? "Choose a password you haven't used here before." : "That password couldn't be saved. Try a longer one." };

  const now = new Date().toISOString();
  await supabaseAdmin()
    .from("portal_members")
    .update({ status: "active", activated_at: member.status === "invited" ? now : undefined, last_login_at: now, updated_at: now })
    .eq("id", member.id);
  redirect("/account?welcome=1");
}

export async function portalSignOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/account/login?signedout=1");
}
