import {
  FORM_SLOTS, MAGNETS, SITE, buildMagnetDownloadEmail, buildOwnerMagnetEmail, buildOwnerNewsletterEmail, buildOwnerContactEmail,
} from "@/lib/forms/email-content";
import type { SystemEmailDef } from "../types";

/** Sample data for previews. Never sent anywhere. The magnet is a real one from the config. */
const MAGNET = MAGNETS["operations-audit"];
const SAMPLE = {
  firstName: "Dana",
  email: "dana@example.com",
  ip: "203.0.113.24",
  audienceId: "sample-audience",
};

export const FORM_EMAILS: SystemEmailDef[] = [
  {
    key: "forms.magnet_download", module: "Website forms", name: "Free download (checklist / field guide)", audience: "lead",
    trigger: "A visitor asks for a free download (Operations Audit Checklist or AI Field Guide). Each download has its own wording below.",
    slots: FORM_SLOTS.magnet,
    vars: [
      { name: "greeting", label: "The greeting line, as set above", sample: "Hi Dana," },
      { name: "first_name", label: "Visitor's first name (may be blank)", sample: SAMPLE.firstName },
      { name: "download_url", label: "Link to the PDF", sample: `${SITE}${MAGNET.pdfPath}` },
      { name: "contact_url", label: "Booking / contact page", sample: `${SITE}/contact` },
      { name: "magnet_title", label: "Download title", sample: MAGNET.title },
    ],
    preview: (copy) => buildMagnetDownloadEmail(MAGNET, SAMPLE.firstName, copy),
  },
  {
    key: "forms.owner_magnet", module: "Website forms", name: "To you: free download", audience: "owner",
    trigger: "A new contact downloads a free resource. Switch it on or off on Notifications.",
    slots: FORM_SLOTS.ownerMagnet,
    vars: [
      { name: "magnet_name", label: "Short download name", sample: MAGNET.shortName },
      { name: "magnet_title", label: "Download title", sample: MAGNET.title },
      { name: "email", label: "Visitor's email", sample: SAMPLE.email },
      { name: "first_name", label: "Visitor's first name (may be blank)", sample: SAMPLE.firstName },
    ],
    preview: (copy) => buildOwnerMagnetEmail({ magnet: MAGNET, email: SAMPLE.email, firstName: SAMPLE.firstName, ip: SAMPLE.ip, audienceId: SAMPLE.audienceId }, copy),
  },
  {
    key: "forms.owner_newsletter", module: "Website forms", name: "To you: newsletter sign-up", audience: "owner",
    trigger: "Someone new signs up for Field Notes. Switch it on or off on Notifications.",
    slots: FORM_SLOTS.newsletter,
    vars: [{ name: "email", label: "Subscriber's email", sample: SAMPLE.email }],
    preview: (copy) => buildOwnerNewsletterEmail({ email: SAMPLE.email, ip: SAMPLE.ip, audienceId: SAMPLE.audienceId }, copy),
  },
  {
    key: "forms.owner_contact", module: "Website forms", name: "To you: contact form", audience: "owner",
    trigger: "Someone sends the contact form. Switch it on or off on Notifications.",
    slots: FORM_SLOTS.contact,
    vars: [
      { name: "name", label: "Their name", sample: "Dana Ortiz" },
      { name: "company", label: "Their company", sample: "Hill Country Roofing" },
      { name: "email", label: "Their email", sample: SAMPLE.email },
    ],
    preview: (copy) => buildOwnerContactEmail({
      name: "Dana Ortiz", email: SAMPLE.email, company: "Hill Country Roofing",
      message: "We run three crews and schedule everything off a whiteboard. Could you take a look?",
    }, copy),
  },
];
