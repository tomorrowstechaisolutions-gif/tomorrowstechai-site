import {
  CTAI_SLOTS, buildBusinessConfirmation, buildPartnerConfirmation, buildAdminNotice,
} from "@/lib/central-texas-ai/email-content";
import { INITIATIVE_NAME } from "@/lib/central-texas-ai/config";
import type { SystemEmailDef } from "../types";

/** Sample data for previews. Never sent anywhere. */
const SAMPLE_DETAILS = {
  business_name: "Hill Country Roofing", contact_name: "Dana Ortiz", city: "Temple", zip: "76502",
  industry: "Construction", employee_count: "11-25", ai_use: "Not yet",
  modernization: ["Scheduling", "Customer follow-up"],
  challenge: "Jobs get scheduled by text and things slip through.",
  pilot_interest: "Yes",
};

const confirmationVars = [
  { name: "greeting", label: "\"Hi Dana,\" (or \"Hi,\" with no name)", sample: "Hi Dana," },
  { name: "first_name", label: "Their first name", sample: "Dana" },
  { name: "initiative_name", label: "Initiative name", sample: INITIATIVE_NAME },
];

export const CTAI_EMAILS: SystemEmailDef[] = [
  {
    key: "ctai.business_confirmation", module: "Central Texas AI", name: "Business interest received", audience: "lead",
    trigger: "Someone submits the business interest form at /central-texas-ai.",
    slots: CTAI_SLOTS.business,
    vars: confirmationVars,
    preview: (copy) => buildBusinessConfirmation("Dana", copy),
  },
  {
    key: "ctai.partner_confirmation", module: "Central Texas AI", name: "Partnership inquiry received", audience: "lead",
    trigger: "Someone submits the partnership inquiry form at /central-texas-ai.",
    slots: CTAI_SLOTS.partner,
    vars: confirmationVars,
    preview: (copy) => buildPartnerConfirmation("Dana", copy),
  },
  {
    key: "ctai.owner", module: "Central Texas AI", name: "To you: new Central Texas AI form", audience: "owner",
    trigger: "Either Central Texas AI form is submitted. Switch it on or off on Notifications.",
    slots: CTAI_SLOTS.admin,
    vars: [
      { name: "who", label: "Business or organization", sample: "Hill Country Roofing" },
      { name: "returning", label: "\" [RETURNING]\" when they already existed", sample: "" },
      { name: "email", label: "Their email", sample: "dana@example.com" },
      { name: "initiative_name", label: "Initiative name", sample: INITIATIVE_NAME },
    ],
    preview: (copy) => buildAdminNotice({
      kind: "business", details: SAMPLE_DETAILS, email: "dana@example.com", phone: "(254) 555-0142",
      leadId: "sample", duplicate: false, confirmationSent: true,
    }, copy),
  },
];
