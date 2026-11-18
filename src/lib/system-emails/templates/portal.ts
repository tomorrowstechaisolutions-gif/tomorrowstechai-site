import {
  PORTAL_SLOTS, buildPortalInviteEmail, buildPortalResetEmail, buildPortalRequestAlertEmail, buildBillingChangeAlertEmail,
} from "@/lib/portal/email-content";
import type { SystemEmailDef } from "../types";

/** Sample data for previews. Never sent anywhere. */
const SAMPLE = {
  name: "Dana Ortiz",
  businessName: "Hill Country Roofing",
  email: "dana@example.com",
  setUrl: "https://www.tomorrowstechai.com/account/set-password?token=sample",
  adminUrl: "https://www.tomorrowstechai.com/admin/clients/sample",
};

const greeting = [
  { name: "greeting", label: "\"Hi Dana,\" (or \"Hi,\" with no name)", sample: "Hi Dana," },
  { name: "first_name", label: "Member's first name", sample: "Dana" },
];

export const PORTAL_EMAILS: SystemEmailDef[] = [
  {
    key: "portal.invite", module: "Member portal", name: "Member account invite", audience: "member",
    trigger: "You invite a client to the member portal from their client page.",
    slots: PORTAL_SLOTS.invite,
    vars: [...greeting, { name: "business_name", label: "Client business", sample: SAMPLE.businessName }],
    preview: (copy) => buildPortalInviteEmail({ name: SAMPLE.name, businessName: SAMPLE.businessName, url: SAMPLE.setUrl }, copy),
  },
  {
    key: "portal.reset", module: "Member portal", name: "Password reset", audience: "member",
    trigger: "A member asks to reset their password on the sign-in page.",
    slots: PORTAL_SLOTS.reset,
    vars: greeting,
    preview: (copy) => buildPortalResetEmail({ name: SAMPLE.name, url: SAMPLE.setUrl }, copy),
  },
  {
    key: "portal.owner_request", module: "Member portal", name: "To you: member request", audience: "owner",
    trigger: "A member sends a request (question, change, problem, new service...) from the portal. Switch it on or off on Notifications.",
    slots: PORTAL_SLOTS.request,
    vars: [
      { name: "label", label: "Request type", sample: "Change request" },
      { name: "subject", label: "Subject the member typed", sample: "Add our new service area to the website" },
      { name: "business_name", label: "Client business", sample: SAMPLE.businessName },
      { name: "from", label: "Member's email", sample: SAMPLE.email },
    ],
    preview: (copy) => buildPortalRequestAlertEmail({
      businessName: SAMPLE.businessName, from: SAMPLE.email, category: "change",
      subject: "Add our new service area to the website",
      message: "We've started taking jobs in Georgetown and Round Rock.\nCan those go on the service-area page?",
      adminUrl: SAMPLE.adminUrl,
    }, copy),
  },
  {
    key: "portal.owner_billing", module: "Member portal", name: "To you: billing change", audience: "owner",
    trigger: "A client cancels (or un-cancels) a subscription from the billing page, or a subscription ends in Stripe. Switch it on or off on Notifications.",
    slots: PORTAL_SLOTS.billing,
    vars: [
      { name: "business_name", label: "Client business", sample: SAMPLE.businessName },
      { name: "services", label: "Services affected", sample: "Website Hosting & Management" },
      { name: "ends_on", label: "When the service ends", sample: "Dec 2, 2026" },
    ],
    preview: (copy) => buildBillingChangeAlertEmail({
      kind: "scheduled", businessName: SAMPLE.businessName, services: ["Website Hosting & Management"],
      endsOn: "Dec 2, 2026", reason: "Moving the site in-house.", adminUrl: SAMPLE.adminUrl,
    }, copy),
  },
];
