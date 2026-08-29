import "server-only";
import { Resend } from "resend";
import { HOSTING_FROM, OFFER_PRICE } from "./config";
import { unsubscribeUrl } from "./unsubscribe";
import type { ScoreReason } from "@/lib/supabase/types";

const SITE = "https://tomorrowstechai.com";
const BOOKING = "https://cal.com/tomorrowstechai/discovery";

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

/** Transactional confirmation. Goes out regardless of marketing consent —
 *  it's the receipt for something they just asked for. */
export async function sendLeadConfirmation(lead: {
  firstName: string;
  email: string;
}): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  const greeting = lead.firstName ? `Hi ${lead.firstName},` : "Hi,";

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to: lead.email,
      subject: `Your $${OFFER_PRICE} Business Launch request · Tomorrow's Tech AI`,
      text: `${greeting}

Your request is in. We'll review your business and contact you shortly —
usually within one business day.

Here's what happens next:

1. We read through what you sent — your trade, what you need, how fast you
   want to move.
2. We reach out by email or phone, whichever suits you.
3. We confirm the plan, then we build it. Most sites go live 7-14 days after
   we have your content.

The price, plainly: $${OFFER_PRICE} one-time for the build. After you're live,
hosting and management is $${HOSTING_FROM}/month and covers hosting, SSL,
backups, security updates and small content changes. Nothing is charged before
you approve the plan.

Want to skip the wait? Book a 30-minute call and we'll plan it on the spot:
${BOOKING}

Talk soon.

— John
Founder, Tomorrow's Tech AI
${SITE}
(254) 272-3313`,
    });
    return !res.error;
  } catch (err) {
    console.error("Confirmation email failed:", err);
    return false;
  }
}

/** Internal notification. Everything needed to decide whether to call now. */
export async function sendAdminNotification(lead: {
  leadId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  currentWebsite?: string | null;
  services: string[];
  timeline?: string | null;
  score: number;
  reasons: ScoreReason[];
  duplicate: boolean;
  stored: boolean;
  source: string;
  campaign?: string | null;
  ad?: string | null;
  placement?: string | null;
  landingPage?: string | null;
}): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  const band = lead.score >= 65 ? "HOT" : lead.score >= 35 ? "WARM" : "COOL";
  const flag = lead.duplicate ? " [RETURNING]" : "";
  const storageWarning = lead.stored
    ? ""
    : "\n!! NOT SAVED TO THE DATABASE — Supabase is not configured or the insert failed. This email is the only copy. !!\n";

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to: adminEmail(),
      replyTo: lead.email,
      subject: `${band} lead · ${lead.businessName || `${lead.firstName} ${lead.lastName}`} · $${OFFER_PRICE} Business Launch${flag}`,
      text: `${storageWarning}
New $${OFFER_PRICE} Business Launch lead — score ${lead.score}/100 (${band})

${lead.firstName} ${lead.lastName}
${lead.businessName ?? "(no business name)"}
${lead.phone ?? "(no phone)"}
${lead.email}

Business type:  ${lead.businessType ?? "—"}
Has a website:  ${lead.currentWebsite ?? "—"}
Needs:          ${lead.services.length ? lead.services.join(", ") : "—"}
Timeline:       ${lead.timeline ?? "—"}

Why this score:
${lead.reasons.map((r) => `  +${r.points}  ${r.label}`).join("\n") || "  (no signals)"}

Where they came from:
  Source:       ${lead.source}
  Campaign:     ${lead.campaign ?? "—"}
  Ad:           ${lead.ad ?? "—"}
  Placement:    ${lead.placement ?? "—"}
  Landing page: ${lead.landingPage ?? "—"}

${lead.leadId ? `Open in the admin: ${SITE}/admin/leads/${lead.leadId}` : ""}
${lead.duplicate ? "\nThis contact already existed. Original attribution was kept; the new details were merged in." : ""}`,
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
  step: "followup_24h" | "followup_72h",
  lead: {
    id: string;
    firstName: string;
    email: string;
    businessName?: string | null;
  }
): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  const greeting = lead.firstName ? `Hi ${lead.firstName},` : "Hi,";
  const business = lead.businessName ? ` for ${lead.businessName}` : "";

  const content =
    step === "followup_24h"
      ? {
          subject: `Quick follow-up on your $${OFFER_PRICE} Business Launch`,
          body: `${greeting}

I wanted to make sure your request came through${business} — it did, and it's on my list.

If it's easier to just talk it through, grab any slot that works:
${BOOKING}

Two things people usually ask at this point:

  · $${OFFER_PRICE} is the whole build. After launch it's $${HOSTING_FROM}/month for
    hosting, SSL, backups, security updates and small content changes.
  · Most sites go live 7-14 days after we have your content.

Reply to this email with any question and I'll answer it directly.

— John
Tomorrow's Tech AI
${SITE}`,
        }
      : {
          subject: `Still want to get ${lead.businessName ?? "your business"} online?`,
          body: `${greeting}

Last note from me on this one — I don't want to keep filling your inbox.

If the timing isn't right, that's completely fine. Reply "later" and I'll close
it out; nothing else will come from me.

If it is right, the fastest path is a 30-minute call:
${BOOKING}

Or just reply with your business name and what you need, and I'll send you a
plan for the $${OFFER_PRICE} build.

— John
Tomorrow's Tech AI
${SITE}
(254) 272-3313`,
        };

  const unsub = unsubscribeUrl(lead.id);
  const footer = unsub
    ? `\n\n---\nDon't want these? One click and they stop: ${unsub}`
    : "";

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to: lead.email,
      replyTo: adminEmail(),
      subject: content.subject,
      text: content.body + footer,
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
