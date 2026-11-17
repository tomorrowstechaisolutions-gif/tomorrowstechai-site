"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { getPortalMember } from "@/lib/portal/session";
import { sendPortalRequestAlert } from "@/lib/portal/emails";
import type { FormState } from "./actions";

/**
 * Writes a signed-in member can make. The customer id always comes from the
 * verified session, never from the form, so a member can only ever change
 * their own record. Only the listed fields are writable.
 */

function str(fd: FormData, key: string, max: number): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function updateMemberProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await getPortalMember();
  if (!member) return { error: "Your session ended. Sign in again." };
  const name = str(fd, "name", 120);
  const businessName = str(fd, "business_name", 160);
  const phone = str(fd, "phone", 40);
  const city = str(fd, "city", 80);
  const state = str(fd, "state", 40);
  if (!name && !businessName) return { error: "Add your name or your business name." };
  if (phone && !/^[0-9+().\-\s]{7,40}$/.test(phone)) return { error: "That phone number doesn't look right." };

  const { error } = await supabaseAdmin()
    .from("customers")
    .update({ name: name || null, business_name: businessName || null, phone: phone || null, city: city || null, state: state || null, updated_at: new Date().toISOString() })
    .eq("id", member.customerId);
  if (error) return { error: "Your changes couldn't be saved. Try again, or email us." };
  revalidatePath("/account", "layout");
  return { notice: "Saved." };
}

const CATEGORIES = ["question", "change", "problem", "billing", "cancel"] as const;

export async function submitMemberRequestAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await getPortalMember();
  if (!member) return { error: "Your session ended. Sign in again." };
  if (!rateLimit(`portal-request:${member.id}`, { max: 6, windowMs: 60 * 60 * 1000 }).ok) {
    return { error: "You've sent several requests in the last hour. We'll get to them; for anything urgent, call (254) 563-2130." };
  }
  const raw = str(fd, "category", 20);
  const category = (CATEGORIES as readonly string[]).includes(raw) ? raw : "question";
  const subject = str(fd, "subject", 160);
  const message = str(fd, "message", 5000);
  if (!subject || message.length < 5) return { error: "Add a short subject and a few words about what you need." };

  const { error } = await supabaseAdmin().from("portal_requests").insert({
    customer_id: member.customerId,
    member_id: member.id,
    category,
    subject,
    message,
  });
  if (error) return { error: "Your request couldn't be sent. Email info@tomorrowstechai.com instead." };

  await sendPortalRequestAlert({ businessName: member.businessName, from: member.email, category, subject, message, customerId: member.customerId });
  revalidatePath("/account/help");
  return { notice: "Sent. We'll reply by email, usually within one business day." };
}
