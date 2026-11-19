"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createMemberBillingSession, stripeConfigured } from "@/lib/stripe/client";
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

/**
 * The member says they have left a Google review. Recorded on their client
 * record so the review card disappears and John stops asking. Only ever sets
 * the date; it never clears one. An admin viewing the portal as this client
 * has no member session, so this does nothing for them.
 */
export async function markReviewLeftAction(): Promise<void> {
  const member = await getPortalMember();
  if (!member) return;
  await supabaseAdmin()
    .from("customers")
    .update({ review_received_at: new Date().toISOString() })
    .eq("id", member.customerId)
    .is("review_received_at", null);
  revalidatePath("/account", "layout");
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

/**
 * Opens the Stripe billing page for the signed-in member's own Stripe
 * customer: update the card, download receipts, cancel a subscription at the
 * end of the paid period. The Stripe id is read server-side from the
 * member's client record, never taken from the form.
 */
export async function openBillingPortalAction(fd: FormData) {
  const member = await getPortalMember();
  if (!member) redirect("/account/login");
  const back = str(fd, "back", 40);
  const returnPath = ["/account", "/account/services", "/account/invoices"].includes(back) ? back : "/account/services";

  if (!rateLimit(`portal-billing:${member.id}`, { max: 10, windowMs: 10 * 60 * 1000 }).ok) redirect(`${returnPath}?billing=busy`);

  const { data } = await supabaseAdmin().from("customers").select("stripe_customer_id").eq("id", member.customerId).maybeSingle();
  const stripeCustomerId = data?.stripe_customer_id ?? null;
  if (!stripeCustomerId || !stripeConfigured()) redirect(`${returnPath}?billing=unavailable`);

  let url: string;
  try {
    url = await createMemberBillingSession(stripeCustomerId, returnPath);
  } catch (err) {
    console.error("Billing portal session failed:", err);
    redirect(`${returnPath}?billing=unavailable`);
  }
  redirect(url);
}

/**
 * "I'm interested" on a catalog item. Opens a request for John (he follows up
 * with a proposal or an invoice); nothing is charged here. The item is looked
 * up server-side and must be public and active. A second click while the
 * first request is still open does nothing.
 */
export async function requestServiceAction(fd: FormData) {
  const member = await getPortalMember();
  if (!member) redirect("/account/login");
  const itemId = str(fd, "item_id", 40);
  const note = str(fd, "note", 1000);
  if (!rateLimit(`portal-request:${member.id}`, { max: 6, windowMs: 60 * 60 * 1000 }).ok) redirect("/account/more?requested=busy");

  const db = supabaseAdmin();
  const { data: item } = await db
    .from("catalog_items")
    .select("id, name, from_cents, billing_type, pricing_mode")
    .eq("id", itemId)
    .eq("public_enabled", true)
    .eq("active", true)
    .maybeSingle();
  if (!item) redirect("/account/more?requested=missing");

  const { data: open } = await db
    .from("portal_requests")
    .select("id")
    .eq("customer_id", member.customerId)
    .eq("catalog_item_id", item.id)
    .eq("status", "open")
    .limit(1);
  if (open?.length) redirect("/account/more?requested=already");

  const subject = `Interested in: ${item.name}`.slice(0, 160);
  const price =
    item.pricing_mode === "custom_quote" || !item.from_cents
      ? "custom quote"
      : `${item.pricing_mode === "starting_at" ? "from " : ""}$${(item.from_cents / 100).toFixed(0)}${item.billing_type === "recurring" ? "/mo" : ""}`;
  const message = `${member.businessName} would like ${item.name} (${price}).${note ? `\n\nTheir note: ${note}` : ""}`;

  const { error } = await db.from("portal_requests").insert({
    customer_id: member.customerId,
    member_id: member.id,
    category: "new_service",
    subject,
    message,
    catalog_item_id: item.id,
  });
  if (error) redirect("/account/more?requested=error");

  await sendPortalRequestAlert({ businessName: member.businessName, from: member.email, category: "new_service", subject, message, customerId: member.customerId });
  revalidatePath("/account/more");
  redirect("/account/more?requested=ok");
}
