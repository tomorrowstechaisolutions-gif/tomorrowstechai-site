import "server-only";
import { Resend } from "resend";
import type { Proposal, ProposalSignature } from "./types";
import {
  buildProposalEmail, buildSignedEmail, buildPaymentEmail, buildAdminEmail,
  type AdminEventKind, type BuiltEmail,
} from "./email-content";

/**
 * Proposal email, through the Resend account the rest of the site already
 * uses.
 *
 * This file only sends. What the messages say and how they look lives in
 * email-content.ts, which has no server-only import and no Resend client, so
 * the templates can be rendered and inspected without a send.
 *
 * Nothing here ever includes an /admin URL. The client's only link is their
 * own tokenised proposal page.
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

/**
 * One send path, so a template that throws can never take a signature or a
 * webhook down with it. Every caller treats `false` as "not delivered" and
 * carries on — the proposal, the signature and the payment are already real
 * whether or not the email landed.
 */
async function deliver(to: string, built: BuiltEmail, label: string): Promise<boolean> {
  const client = resend();
  if (!client || !to) return false;

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
    });
    return !res.error;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return false;
  }
}

/** The proposal itself. Sent when John presses Send. */
export async function sendProposalEmail(
  p: Proposal,
  url: string,
  note?: string | null
): Promise<boolean> {
  if (!p.client_email) return false;
  return deliver(p.client_email, buildProposalEmail(p, url, note), "Proposal email");
}

/** Their copy of what they just signed. */
export async function sendSignedConfirmation(
  p: Proposal,
  signature: ProposalSignature,
  url: string
): Promise<boolean> {
  return deliver(signature.signer_email, buildSignedEmail(p, signature, url), "Signed confirmation");
}

/** Receipt for a proposal payment. */
export async function sendPaymentConfirmation(
  p: Proposal,
  amountCents: number,
  url: string,
  receiptUrl?: string | null
): Promise<boolean> {
  if (!p.client_email) return false;
  return deliver(
    p.client_email,
    buildPaymentEmail(p, amountCents, url, receiptUrl),
    "Payment confirmation"
  );
}

/** Internal notification. Says what happened and what it is worth. */
export async function notifyAdmin(
  kind: AdminEventKind,
  p: Proposal,
  detail?: string | null
): Promise<boolean> {
  return deliver(adminEmail(), buildAdminEmail(kind, p, detail), "Admin notification");
}
