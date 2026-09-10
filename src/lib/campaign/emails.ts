import "server-only";
import { Resend } from "resend";
import { BUSINESS_LAUNCH_OFFER, type Offer } from "./offers";
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

/**
 * Every email here is about ONE package, and the packages disagree on the
 * things a lead actually asks about: the price, how long the build takes, and
 * what the $29 covers. Starter's $29 buys hosting only; from $399 up it
 * includes management. Saying the wrong one in writing to a paying customer is
 * the mistake this parameter exists to prevent, so it defaults to Business
 * Launch -- where every historical lead came from -- and is passed explicitly
 * everywhere else.
 */
function wrap(text: string, width = 74): string {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line) out.push(line);
  return out.join("\n");
}

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

  const greeting = lead.firstName ? `Hi ${lead.firstName},` : "Hi,";

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to: lead.email,
      subject: `Your ${offer.name} request · Tomorrow's Tech AI`,
      text: `${greeting}

Your request is in. We'll review your business and contact you shortly —
usually within one business day.

Here's what happens next:

1. We read through what you sent — your trade, what you need, how fast you
   want to move.
2. We reach out by email or phone, whichever suits you.
3. We confirm the plan, then we build it.${
        offer.turnaround
          ? ` Most sites go live ${offer.turnaround}\n   after we have your content.`
          : ""
      }

The price, plainly: $${offer.price} one-time for the build. After you're live:

${wrap(offer.hostingDisclosure)}

Nothing is charged before you approve the plan.

Want to skip the wait? Book a 30-minute call and we'll plan it on the spot:
${BOOKING}

Talk soon.

— John
Founder, Tomorrow's Tech AI
${SITE}
(254) 563-2130`,
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
}, offer: Offer = BUSINESS_LAUNCH_OFFER): Promise<boolean> {
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
      subject: `${band} lead · ${lead.businessName || `${lead.firstName} ${lead.lastName}`} · ${offer.name}${flag}`,
      text: `${storageWarning}
New ${offer.name} lead — score ${lead.score}/100 (${band})

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
  },
  offer: Offer = BUSINESS_LAUNCH_OFFER
): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  const greeting = lead.firstName ? `Hi ${lead.firstName},` : "Hi,";
  const business = lead.businessName ? ` for ${lead.businessName}` : "";

  const content =
    step === "followup_24h"
      ? {
          subject: `Quick follow-up on your ${offer.name}`,
          body: `${greeting}

I wanted to make sure your request came through${business} — it did, and it's on my list.

If it's easier to just talk it through, grab any slot that works:
${BOOKING}

Two things people usually ask at this point:

  · $${offer.price} is the whole build. After launch:

${wrap(offer.hostingDisclosure, 68)
  .split("\n")
  .map((l) => `    ${l}`)
  .join("\n")}
${
  offer.turnaround
    ? `  · Most sites go live ${offer.turnaround} after we have your content.`
    : "  · I'll confirm the timeline with you before anything starts."
}

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
plan for the $${offer.price} build.

— John
Tomorrow's Tech AI
${SITE}
(254) 563-2130`,
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
