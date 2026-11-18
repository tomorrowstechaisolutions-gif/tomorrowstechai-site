import "server-only";
import { Resend } from "resend";
import { BUSINESS_LAUNCH_OFFER, type Offer } from "./offers";
import { unsubscribeUrl } from "./unsubscribe";
import { notifyOwner } from "@/lib/notifications/owner";
import { emailCopy } from "@/lib/system-emails/store";
import {
  CAMPAIGN_BOOKING, CAMPAIGN_SITE,
  buildAdminLeadEmail, buildFollowupEmail, buildLeadConfirmationEmail,
  type AdminLeadInfo, type FollowupStep,
} from "./email-content";

/**
 * Sending only. What each email says lives in email-content.ts (pure, so the
 * System emails page can preview it), with any wording John has edited on
 * that page read here right before sending.
 */

const LINKS = { site: CAMPAIGN_SITE, booking: CAMPAIGN_BOOKING };

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromEmail() {
  return (
    process.env.CONTACT_FROM_EMAIL ||
    "Tomorrow's Tech AI <hello@tomorrowstechai.com>"
  );
}

function adminEmail() {
  return process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
}

/**
 * Every email here is about ONE package, and the packages disagree on the
 * things a lead actually asks about: the price, how long the build takes, and
 * what the $29 covers. Starter's $29 buys hosting only; from $399 up it
 * includes management. Saying the wrong one in writing to a paying customer is
 * the mistake this parameter exists to prevent, so it defaults to Business
 * Launch -- where every historical lead came from -- and is passed explicitly
 * everywhere else.
 */

/** Transactional confirmation. Goes out regardless of marketing consent —
 *  it's the receipt for something they just asked for. */
export async function sendLeadConfirmation(
  lead: {
    firstName: string;
    email: string;
  },
  offer: Offer = BUSINESS_LAUNCH_OFFER
): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  try {
    const built = buildLeadConfirmationEmail(lead, offer, LINKS, await emailCopy("campaign.lead_confirmation"));
    const res = await client.emails.send({
      from: fromEmail(),
      to: lead.email,
      subject: built.subject,
      text: built.text,
    });
    return !res.error;
  } catch (err) {
    console.error("Confirmation email failed:", err);
    return false;
  }
}

/** Internal notification. Everything needed to decide whether to call now. */
async function sendAdminNotificationNow(lead: AdminLeadInfo, offer: Offer = BUSINESS_LAUNCH_OFFER): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  try {
    const built = buildAdminLeadEmail(lead, offer, LINKS, await emailCopy("campaign.owner_new_lead"));
    const res = await client.emails.send({
      from: fromEmail(),
      to: adminEmail(),
      replyTo: lead.email,
      subject: built.subject,
      text: built.text,
    });
    return !res.error;
  } catch (err) {
    console.error("Admin notification failed:", err);
    return false;
  }
}

/**
 * The 24-hour and 72-hour nudges. Short, useful, and easy to stop — a lead
 * who replies, books, buys, opts out or gets closed never reaches these,
 * because the queue row is cancelled before it comes due.
 */
export async function sendFollowupEmail(
  step: FollowupStep,
  lead: {
    id: string;
    firstName: string;
    email: string;
    businessName?: string | null;
  },
  offer: Offer = BUSINESS_LAUNCH_OFFER
): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  const unsub = unsubscribeUrl(lead.id);

  try {
    const built = buildFollowupEmail(step, lead, offer, { ...LINKS, unsubscribe: unsub }, await emailCopy(`campaign.${step}`));
    const res = await client.emails.send({
      from: fromEmail(),
      to: lead.email,
      replyTo: adminEmail(),
      subject: built.subject,
      text: built.text,
      headers: unsub
        ? {
            // Gmail and Outlook surface this as an Unsubscribe button.
            "List-Unsubscribe": `<${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    });
    return !res.error;
  } catch (err) {
    console.error("Follow-up email failed:", err);
    return false;
  }
}

/** Owner email, gated by its Notifications switch and logged. */
export async function sendAdminNotification(...args: Parameters<typeof sendAdminNotificationNow>): Promise<boolean> {
  return notifyOwner("lead.new", [args[0].firstName, args[0].lastName].filter(Boolean).join(" ") || args[0].email, () => Promise.resolve(sendAdminNotificationNow(...args)));
}
