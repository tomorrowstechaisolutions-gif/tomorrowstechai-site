import "server-only";
import { Resend } from "resend";
import { notifyOwner } from "@/lib/notifications/owner";
import { emailCopy } from "@/lib/system-emails/store";
import {
  buildPortalInviteEmail, buildPortalResetEmail, buildPortalRequestAlertEmail, buildBillingChangeAlertEmail,
} from "./email-content";

/** Portal invite and password-reset emails, sent through the site's Resend account. */

function fromEmail(): string {
  return process.env.CONTACT_FROM_EMAIL || "Tomorrow's Tech AI <hello@tomorrowstechai.com>";
}

async function deliver(to: string, subject: string, html: string, text: string, label: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  try {
    const res = await new Resend(key).emails.send({ from: fromEmail(), to, subject, html, text });
    return !res.error;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return false;
  }
}

function adminClientUrl(customerId: string): string {
  return `${(process.env.PORTAL_ORIGIN || "https://www.tomorrowstechai.com").replace(/\/$/, "")}/admin/clients/${customerId}`;
}

export async function sendPortalInvite(opts: { to: string; name: string | null; businessName: string; url: string }) {
  const { subject, html, text } = buildPortalInviteEmail(opts, await emailCopy("portal.invite"));
  return deliver(opts.to, subject, html, text, "Portal invite email");
}

export async function sendPortalReset(opts: { to: string; name: string | null; url: string }) {
  const { subject, html, text } = buildPortalResetEmail(opts, await emailCopy("portal.reset"));
  return deliver(opts.to, subject, html, text, "Portal reset email");
}

/** Alerts John when a member sends a request from the portal. */
async function sendPortalRequestAlertNow(opts: {
  businessName: string;
  from: string;
  category: string;
  subject: string;
  message: string;
  customerId: string;
}) {
  const to = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
  const { subject, html, text } = buildPortalRequestAlertEmail(
    { ...opts, adminUrl: adminClientUrl(opts.customerId) },
    await emailCopy("portal.owner_request")
  );
  return deliver(to, subject, html, text, "Portal request alert");
}

/**
 * Alerts John when a client's Stripe subscription changes on its own: a
 * cancellation scheduled (or undone) from the billing page, or a subscription
 * that has actually ended. Sent from the Stripe webhook.
 */
async function sendBillingChangeAlertNow(opts: {
  kind: "scheduled" | "resumed" | "ended";
  businessName: string;
  services: string[];
  endsOn: string | null;
  reason: string | null;
  customerId: string;
}) {
  const to = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
  const { subject, html, text } = buildBillingChangeAlertEmail(
    { ...opts, adminUrl: adminClientUrl(opts.customerId) },
    await emailCopy("portal.owner_billing")
  );
  return deliver(to, subject, html, text, "Billing change alert");
}

/** Owner email, gated by its Notifications switch and logged. */
export async function sendPortalRequestAlert(...args: Parameters<typeof sendPortalRequestAlertNow>): Promise<boolean> {
  return notifyOwner(args[0].category === "new_service" ? "portal.new_service" : "portal.request", `${args[0].businessName}: ${args[0].subject}`, () => Promise.resolve(sendPortalRequestAlertNow(...args)));
}

/** Owner email, gated by its Notifications switch and logged. */
export async function sendBillingChangeAlert(...args: Parameters<typeof sendBillingChangeAlertNow>): Promise<boolean> {
  return notifyOwner(({ scheduled: "billing.cancel_scheduled", resumed: "billing.cancel_undone", ended: "billing.subscription_ended" } as const)[args[0].kind], args[0].businessName, () => Promise.resolve(sendBillingChangeAlertNow(...args)));
}
