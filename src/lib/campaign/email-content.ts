/**
 * What every lead / campaign email says.
 *
 * Split out from emails.ts the same way the invoice emails are: sending needs
 * `server-only`, Resend and env (the unsubscribe link is signed with a
 * secret), composing needs none of that. Anything env-derived — the site
 * URL, the booking link, the unsubscribe URL — is passed in.
 *
 * These are plain-text emails, deliberately: they read like a note from John,
 * not a newsletter. So `html` is always empty and only `text` is sent. Line
 * breaks inside a slot are kept exactly as typed (the shipped copy is
 * hand-wrapped), and blank lines separate paragraphs.
 */

import { BUSINESS_LAUNCH_OFFER, type Offer } from "./offers";
import type { ScoreReason } from "@/lib/supabase/types";
import { fill, paragraphsOf, resolveCopy, type CopySlot, type EmailCopy } from "@/lib/system-emails/copy";

export type BuiltEmail = { subject: string; html: string; text: string };

export const CAMPAIGN_SITE = "https://tomorrowstechai.com";
export const CAMPAIGN_BOOKING = "https://cal.com/tomorrowstechai/discovery";

export type FollowupStep = "followup_24h" | "followup_72h";

/** Hand-wraps a sentence for a plain-text email. */
export function wrap(text: string, width = 74): string {
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

// ═══════════════════════════════════════════════════════════════════════
// Editable wording (System emails page). Defaults are the shipped text.
// ═══════════════════════════════════════════════════════════════════════

const UNSUBSCRIBE_SLOT: CopySlot = {
  key: "unsubscribe",
  label: "Unsubscribe line (bottom of the email)",
  default: "Don't want these? One click and they stop: {unsubscribe_url}",
  help: "Only shown when an unsubscribe link can be made. Keep {unsubscribe_url} in it.",
};

export const CAMPAIGN_SLOTS: Record<"confirmation" | FollowupStep | "owner", CopySlot[]> = {
  confirmation: [
    { key: "subject", label: "Subject", default: "Your {offer_name} request · Tomorrow's Tech AI" },
    { key: "intro", label: "Opening", default: "{greeting}\n\nYour request is in. We'll review your business and contact you shortly —\nusually within one business day.", multiline: true },
    { key: "steps_heading", label: "What-happens-next heading", default: "Here's what happens next:" },
    {
      key: "steps", label: "What happens next (steps)", multiline: true,
      default: "1. We read through what you sent — your trade, what you need, how fast you\n   want to move.\n2. We reach out by email or phone, whichever suits you.\n3. We confirm the plan, then we build it.{turnaround_line}",
      help: "{turnaround_line} is the turnaround sentence below, and is empty for packages with no stated turnaround.",
    },
    { key: "turnaround_line", label: "Turnaround sentence (packages that state one)", default: "Most sites go live {turnaround}\n   after we have your content.", multiline: true },
    { key: "price_line", label: "Price line (the package's hosting terms print below it)", default: "The price, plainly: {price} one-time for the build. After you're live:" },
    { key: "no_charge", label: "No-charge line", default: "Nothing is charged before you approve the plan.", multiline: true },
    { key: "booking_line", label: "Booking line (the booking link prints below it)", default: "Want to skip the wait? Book a 30-minute call and we'll plan it on the spot:" },
    { key: "closing", label: "Closing line", default: "Talk soon.", multiline: true },
  ],
  followup_24h: [
    { key: "subject", label: "Subject", default: "Quick follow-up on your {offer_name}" },
    { key: "intro", label: "Opening", default: "{greeting}\n\nI wanted to make sure your request came through{for_business} — it did, and it's on my list.", multiline: true },
    { key: "booking_line", label: "Booking line (the booking link prints below it)", default: "If it's easier to just talk it through, grab any slot that works:" },
    { key: "faq_heading", label: "Questions heading", default: "Two things people usually ask at this point:" },
    { key: "price_point", label: "Point 1: price (the package's hosting terms print below it)", default: "{price} is the whole build. After launch:" },
    { key: "turnaround_point", label: "Point 2: turnaround (packages that state one)", default: "Most sites go live {turnaround} after we have your content." },
    { key: "no_turnaround_point", label: "Point 2: no stated turnaround", default: "I'll confirm the timeline with you before anything starts." },
    { key: "closing", label: "Closing line", default: "Reply to this email with any question and I'll answer it directly.", multiline: true },
    UNSUBSCRIBE_SLOT,
  ],
  followup_72h: [
    { key: "subject", label: "Subject", default: "Still want to get {business} online?" },
    {
      key: "intro", label: "Opening", multiline: true,
      default: "{greeting}\n\nLast note from me on this one — I don't want to keep filling your inbox.\n\nIf the timing isn't right, that's completely fine. Reply \"later\" and I'll close\nit out; nothing else will come from me.",
    },
    { key: "booking_line", label: "Booking line (the booking link prints below it)", default: "If it is right, the fastest path is a 30-minute call:" },
    { key: "closing", label: "Closing line", default: "Or just reply with your business name and what you need, and I'll send you a\nplan for the {price} build.", multiline: true },
    UNSUBSCRIBE_SLOT,
  ],
  owner: [
    { key: "subject", label: "Subject", default: "{band} lead · {who} · {offer_name}{returning}" },
    { key: "storage_warning", label: "Warning when the lead was not saved", default: "!! NOT SAVED TO THE DATABASE — Supabase is not configured or the insert failed. This email is the only copy. !!" },
    { key: "headline", label: "Headline", default: "New {offer_name} lead — score {score}/100 ({band})" },
    { key: "admin_link", label: "Admin link line", default: "Open in the admin: {admin_url}" },
    { key: "returning_note", label: "Note for a returning contact", default: "This contact already existed. Original attribution was kept; the new details were merged in.", multiline: true },
  ],
};

function greetingOf(firstName: string): string {
  return firstName ? `Hi ${firstName},` : "Hi,";
}

function unsubscribeFooter(c: EmailCopy, unsubscribeUrl: string | null | undefined): string {
  return unsubscribeUrl ? `\n\n---\n${fill(c.unsubscribe, { unsubscribe_url: unsubscribeUrl })}` : "";
}

// ═══════════════════════════════════════════════════════════════════════
// Confirmation to the lead.
// ═══════════════════════════════════════════════════════════════════════

export function buildLeadConfirmationEmail(
  lead: { firstName: string },
  offer: Offer = BUSINESS_LAUNCH_OFFER,
  links: { site?: string; booking?: string } = {},
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(CAMPAIGN_SLOTS.confirmation, copy);
  const site = links.site ?? CAMPAIGN_SITE;
  const booking = links.booking ?? CAMPAIGN_BOOKING;
  const base = {
    first_name: lead.firstName,
    greeting: greetingOf(lead.firstName),
    offer_name: offer.name,
    price: `$${offer.price}`,
    turnaround: offer.turnaround ?? "",
  };
  const vars = {
    ...base,
    turnaround_line: offer.turnaround ? ` ${fill(c.turnaround_line, base).trim()}` : "",
  };
  const f = (t: string) => fill(t, vars);
  const para = (t: string) => paragraphsOf(f(t)).join("\n\n");

  const text = `${para(c.intro)}

${f(c.steps_heading)}

${para(c.steps)}

${f(c.price_line)}

${wrap(offer.hostingDisclosure)}

${para(c.no_charge)}

${f(c.booking_line)}
${booking}

${para(c.closing)}

— John
Founder, Tomorrow's Tech AI
${site}
(254) 563-2130`;

  return { subject: f(c.subject), html: "", text };
}

// ═══════════════════════════════════════════════════════════════════════
// The automated follow-ups (24 h and 72 h after the request).
// ═══════════════════════════════════════════════════════════════════════

export function buildFollowupEmail(
  step: FollowupStep,
  lead: { firstName: string; businessName?: string | null },
  offer: Offer = BUSINESS_LAUNCH_OFFER,
  links: { site?: string; booking?: string; unsubscribe?: string | null } = {},
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(CAMPAIGN_SLOTS[step], copy);
  const site = links.site ?? CAMPAIGN_SITE;
  const booking = links.booking ?? CAMPAIGN_BOOKING;
  const vars = {
    first_name: lead.firstName,
    greeting: greetingOf(lead.firstName),
    offer_name: offer.name,
    price: `$${offer.price}`,
    turnaround: offer.turnaround ?? "",
    business_name: lead.businessName ?? "",
    for_business: lead.businessName ? ` for ${lead.businessName}` : "",
    business: lead.businessName ?? "your business",
  };
  const f = (t: string) => fill(t, vars);
  const para = (t: string) => paragraphsOf(f(t)).join("\n\n");

  let body: string;
  if (step === "followup_24h") {
    body = `${para(c.intro)}

${f(c.booking_line)}
${booking}

${f(c.faq_heading)}

  · ${f(c.price_point)}

${wrap(offer.hostingDisclosure, 68)
  .split("\n")
  .map((l) => `    ${l}`)
  .join("\n")}
  · ${f(offer.turnaround ? c.turnaround_point : c.no_turnaround_point)}

${para(c.closing)}

— John
Tomorrow's Tech AI
${site}`;
  } else {
    body = `${para(c.intro)}

${f(c.booking_line)}
${booking}

${para(c.closing)}

— John
Tomorrow's Tech AI
${site}
(254) 563-2130`;
  }

  return { subject: f(c.subject), html: "", text: body + unsubscribeFooter(c, links.unsubscribe) };
}

// ═══════════════════════════════════════════════════════════════════════
// To John: a new lead came in.
// ═══════════════════════════════════════════════════════════════════════

export type AdminLeadInfo = {
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
};

export function buildAdminLeadEmail(
  lead: AdminLeadInfo,
  offer: Offer = BUSINESS_LAUNCH_OFFER,
  links: { site?: string } = {},
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(CAMPAIGN_SLOTS.owner, copy);
  const site = links.site ?? CAMPAIGN_SITE;
  const band = lead.score >= 65 ? "HOT" : lead.score >= 35 ? "WARM" : "COOL";
  const vars = {
    band,
    score: lead.score,
    offer_name: offer.name,
    who: lead.businessName || `${lead.firstName} ${lead.lastName}`,
    returning: lead.duplicate ? " [RETURNING]" : "",
    first_name: lead.firstName,
    last_name: lead.lastName,
    business_name: lead.businessName ?? "",
    admin_url: lead.leadId ? `${site}/admin/leads/${lead.leadId}` : "",
  };
  const f = (t: string) => fill(t, vars);

  const storageWarning = lead.stored ? "" : `\n${f(c.storage_warning)}\n`;

  const text = `${storageWarning}
${f(c.headline)}

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

${lead.leadId ? f(c.admin_link) : ""}
${lead.duplicate ? `\n${paragraphsOf(f(c.returning_note)).join("\n\n")}` : ""}`;

  return { subject: f(c.subject), html: "", text };
}
