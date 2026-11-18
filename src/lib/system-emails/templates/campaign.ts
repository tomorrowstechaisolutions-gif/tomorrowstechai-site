import {
  CAMPAIGN_SLOTS, buildAdminLeadEmail, buildFollowupEmail, buildLeadConfirmationEmail,
} from "@/lib/campaign/email-content";
import { BUSINESS_LAUNCH_OFFER } from "@/lib/campaign/offers";
import type { SystemEmailDef } from "../types";

/**
 * Lead and campaign emails. These go out as plain text (a note from John, not
 * a newsletter), so `html` is empty and the preview is the text version.
 * Sample data for previews only. Never sent anywhere.
 */
const SAMPLE_LEAD = {
  id: "sample", firstName: "Dana", lastName: "Ortiz", email: "dana@example.com",
  businessName: "Hill Country Roofing",
};
const OFFER = BUSINESS_LAUNCH_OFFER;
const UNSUB = "https://tomorrowstechai.com/api/unsubscribe?id=sample&t=sample";

const common = [
  { name: "greeting", label: "\"Hi Dana,\" (or \"Hi,\" with no name)", sample: "Hi Dana," },
  { name: "first_name", label: "Lead's first name", sample: "Dana" },
  { name: "offer_name", label: "Package name", sample: OFFER.name },
  { name: "price", label: "Package price", sample: `$${OFFER.price}` },
];
const turnaround = { name: "turnaround", label: "Package turnaround (empty when not stated)", sample: OFFER.turnaround ?? "" };
const unsubscribe = { name: "unsubscribe_url", label: "One-click unsubscribe link", sample: UNSUB };

export const CAMPAIGN_EMAILS: SystemEmailDef[] = [
  {
    key: "campaign.lead_confirmation", module: "Leads & campaigns", name: "Request received", audience: "lead",
    trigger: "Someone submits a package request on a campaign page or a Meta lead form.",
    slots: CAMPAIGN_SLOTS.confirmation,
    vars: [...common, turnaround,
      { name: "turnaround_line", label: "The turnaround sentence (empty when the package states none)", sample: "Most sites go live 7–14 days after we have your content." }],
    preview: (copy) => buildLeadConfirmationEmail(SAMPLE_LEAD, OFFER, {}, copy),
  },
  {
    key: "campaign.followup_24h", module: "Leads & campaigns", name: "Follow-up (24 hours)", audience: "lead",
    trigger: "24 hours after a request, unless the lead has replied, booked, bought, opted out or been closed.",
    slots: CAMPAIGN_SLOTS.followup_24h,
    vars: [...common, turnaround,
      { name: "business_name", label: "Lead's business", sample: "Hill Country Roofing" },
      { name: "for_business", label: "\" for Hill Country Roofing\" (empty with no business name)", sample: " for Hill Country Roofing" },
      unsubscribe],
    preview: (copy) => buildFollowupEmail("followup_24h", SAMPLE_LEAD, OFFER, { unsubscribe: UNSUB }, copy),
  },
  {
    key: "campaign.followup_72h", module: "Leads & campaigns", name: "Follow-up (72 hours, last note)", audience: "lead",
    trigger: "72 hours after a request, unless the lead has replied, booked, bought, opted out or been closed.",
    slots: CAMPAIGN_SLOTS.followup_72h,
    vars: [...common,
      { name: "business_name", label: "Lead's business", sample: "Hill Country Roofing" },
      { name: "business", label: "Lead's business (or \"your business\")", sample: "Hill Country Roofing" },
      unsubscribe],
    preview: (copy) => buildFollowupEmail("followup_72h", SAMPLE_LEAD, OFFER, { unsubscribe: UNSUB }, copy),
  },
  {
    key: "campaign.owner_new_lead", module: "Leads & campaigns", name: "To you: new lead", audience: "owner",
    trigger: "A new campaign or Meta lead comes in. Switch it on or off on Notifications.",
    slots: CAMPAIGN_SLOTS.owner,
    vars: [
      { name: "band", label: "HOT / WARM / COOL", sample: "HOT" },
      { name: "score", label: "Lead score", sample: "72" },
      { name: "who", label: "Business (or the lead's name)", sample: "Hill Country Roofing" },
      { name: "offer_name", label: "Package name", sample: OFFER.name },
      { name: "returning", label: "\" [RETURNING]\" for a contact we already had", sample: "" },
      { name: "first_name", label: "Lead's first name", sample: "Dana" },
      { name: "last_name", label: "Lead's last name", sample: "Ortiz" },
      { name: "business_name", label: "Lead's business", sample: "Hill Country Roofing" },
      { name: "admin_url", label: "Link to the lead in the admin", sample: "https://tomorrowstechai.com/admin/leads/sample" },
    ],
    preview: (copy) => buildAdminLeadEmail({
      leadId: "sample", firstName: "Dana", lastName: "Ortiz", email: "dana@example.com",
      phone: "(512) 555-0142", businessName: "Hill Country Roofing", businessType: "Roofing",
      currentWebsite: "No", services: ["New website", "Google Business Profile"], timeline: "This month",
      score: 72, reasons: [{ points: 30, label: "Needs a website now" }, { points: 25, label: "Phone number given" }, { points: 17, label: "Timeline: this month" }],
      duplicate: false, stored: true, source: "facebook", campaign: "business-launch", ad: "roofers-v2",
      placement: "feed", landingPage: "/business-launch",
    }, OFFER, {}, copy),
  },
];
