import "server-only";
import { Resend } from "resend";
import { emailCopy } from "@/lib/system-emails/store";
import { buildReviewRequestEmail, DEFAULT_REVIEW_URL } from "./email-content";

/** The Google review link clients are sent to. */
export function reviewUrl(): string {
  return (process.env.GOOGLE_REVIEW_URL || DEFAULT_REVIEW_URL).trim();
}

/**
 * Sends one review request through the site's Resend account. Replies go to
 * John's inbox, because the email invites the client to write back.
 * Returns whether the provider accepted it; never throws.
 */
export async function sendReviewRequest(opts: { to: string; name: string | null; businessName: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.to) return false;
  const { subject, html, text } = buildReviewRequestEmail({ ...opts, url: reviewUrl() }, await emailCopy("reviews.request"));
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
