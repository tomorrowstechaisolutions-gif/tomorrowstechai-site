"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canAskForReview } from "@/lib/reviews/email-content";
import { businessDefaults } from "@/lib/settings/store";
import { sendReviewRequest } from "@/lib/reviews/emails";

/**
 * Asking a client for a Google review, from their client page.
 *
 * Only ever sent because John pressed the button for that client. The server
 * enforces the same rules the panel shows: an email on file, not already
 * marked as reviewed, and not asked again inside the waiting period — so a
 * double click or a stale tab cannot send a second request.
 */

function str(fd: FormData, key: string, max = 200): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function back(customerId: string, params: Record<string, string>): never {
  revalidatePath(`/admin/clients/${customerId}`);
  redirect(`/admin/clients/${customerId}?${new URLSearchParams(params)}`);
}

export async function askForReviewAction(fd: FormData) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const customerId = str(fd, "customer_id", 40);
  const supabase = await createSupabaseServerClient();

  const { data: c } = await supabase
    .from("customers")
    .select("id, email, name, business_name, review_requested_at, review_request_count, review_received_at")
    .eq("id", customerId)
    .maybeSingle();
  if (!c) back(customerId, { review_error: "Client not found." });

  const email = (c.email ?? "").trim().toLowerCase();
  const check = canAskForReview(email || null, {
    requestedAt: c.review_requested_at ?? null,
    requestCount: c.review_request_count ?? 0,
    receivedAt: c.review_received_at ?? null,
  }, new Date(), (await businessDefaults()).reviewGapDays);
  if (!check.ok) back(customerId, { review_error: check.reason });

  const sent = await sendReviewRequest({ to: email, name: c.name ?? null, businessName: c.business_name || c.name || "your business" });
  if (!sent) back(customerId, { review_error: "The email didn't send. Nothing was recorded, so you can try again." });

  // Recorded only after the provider accepted the email.
  const { error } = await supabaseAdmin()
    .from("customers")
    .update({ review_requested_at: new Date().toISOString(), review_request_count: (c.review_request_count ?? 0) + 1 })
    .eq("id", customerId);
  if (error) back(customerId, { review_notice: `Sent to ${email}, but the date could not be saved: ${error.message}` });

  back(customerId, { review_notice: `Review request sent to ${email}.` });
}

/** John marks that the client left a review (or undoes it). Google does not tell us. */
export async function setReviewReceivedAction(fd: FormData) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const customerId = str(fd, "customer_id", 40);
  const received = str(fd, "received", 1) === "1";

  const { error } = await supabaseAdmin()
    .from("customers")
    .update({ review_received_at: received ? new Date().toISOString() : null })
    .eq("id", customerId);
  if (error) back(customerId, { review_error: error.message });
  back(customerId, { review_notice: received ? "Marked as reviewed. They won't be asked again." : "Unmarked. They can be asked again." });
}
