import "server-only";
import { Resend } from "resend";
import { emailCopy } from "@/lib/system-emails/store";
import { businessDefaults } from "@/lib/settings/store";
import { buildReviewRequestEmail } from "./email-content";

/**
 * The Google review link clients are sent to: the one saved on Settings,
 * else GOOGLE_REVIEW_URL, else the built-in link.
 */
export async function reviewUrl(): Promise<string> {
  return (await businessDefaults()).reviewUrl;
}

/**
 * Sends one review request through the site's Resend account. Replies go to
 * John's inbox, because the email invites the client to write back.
 * Returns whether the provider accepted it; never throws.
 */
export async function sendReviewRequest(opts: { to: string; name: string | null; businessName: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.to) return false;
  const { subject, html, text } = buildReviewRequestEmail({ ...opts, url: await reviewUrl() }, await emailCopy("reviews.request"));
  try {
    const res = await new Resend(key).emails.send({
      from: process.env.CONTACT_FROM_EMAIL || "Tomorrow's Tech AI <hello@tomorrowstechai.com>",
      to: opts.to,
      replyTo: process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com",
      subject, html, text,
    });
    return !res.error;
  } catch (err) {
    console.error("Review request email failed:", err);
    return false;
  }
}
