import "server-only";
import { Resend } from "resend";
import {
  buildAdminNotice, buildBusinessConfirmation, buildPartnerConfirmation, type BuiltEmail,
} from "./email-content";
import type { InitiativeKind } from "./config";

/**
 * Sends the Central Texas AI Initiative emails through the same Resend
 * account, sender and admin inbox as the rest of the site. Content lives in
 * email-content.ts; this file only delivers.
 *
 * Every send returns a boolean and never throws — a failed email must not
 * turn a saved submission into an error for the visitor.
 */

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function fromEmail(): string {
  return process.env.CONTACT_FROM_EMAIL || "Tomorrow's Tech AI <hello@tomorrowstechai.com>";
}

function adminEmail(): string {
  return process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
}

async function deliver(to: string, built: BuiltEmail, label: string, replyTo?: string): Promise<boolean> {
  const client = resend();
  if (!client || !to) return false;
  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      ...(replyTo ? { replyTo } : {}),
    });
    if (res.error) console.error(`${label} failed:`, res.error);
    return !res.error;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return false;
  }
}

/** The receipt the visitor gets. Transactional — sent regardless of marketing consent. */
export function sendInitiativeConfirmation(kind: InitiativeKind, to: string, firstName: string) {
  const built = kind === "business" ? buildBusinessConfirmation(firstName) : buildPartnerConfirmation(firstName);
  return deliver(to, built, `Central Texas AI ${kind} confirmation`, adminEmail());
}

/** The internal notice to John, reply-to set to the visitor. */
export function sendInitiativeAdminNotice(input: Parameters<typeof buildAdminNotice>[0]) {
  return deliver(adminEmail(), buildAdminNotice(input), "Central Texas AI admin notice", input.email);
}
