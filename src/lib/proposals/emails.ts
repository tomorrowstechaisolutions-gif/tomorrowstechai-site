import "server-only";
import { Resend } from "resend";
import { formatMoney } from "./pricing";
import { amountDueAtSignature } from "./config";
import type { Proposal, ProposalSignature } from "./types";

/**
 * Proposal email, through the Resend account the rest of the site already
 * uses. Plain text, same as campaign/emails.ts — these are business letters,
 * not newsletters, and text lands in the inbox rather than the promotions tab.
 *
 * Nothing here ever includes an /admin URL. The client's only link is their
 * own tokenised proposal page.
 */

const SITE = "https://tomorrowstechai.com";

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

function firstName(p: Proposal): string {
  const name = (p.client_contact_name ?? "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

function priceLines(p: Proposal): string {
  const lines = [`Website build: ${formatMoney(p.total_cents, p.currency)} one-time`];
  if (p.recurring_price_cents > 0) {
    lines.push(
      `Hosting & management: ${formatMoney(p.recurring_price_cents, p.currency)}/${p.recurring_interval}`
    );
  }
  const due = amountDueAtSignature(p);
  if (due > 0) {
    lines.push(`Due when you sign: ${formatMoney(due, p.currency)}`);
    const balance = p.total_cents - due;
    if (balance > 0) lines.push(`Remaining balance: ${formatMoney(balance, p.currency)}`);
  } else {
    lines.push("Due when you sign: nothing — signing records your approval only.");
  }
  return lines.join("\n");
}

function expiryLine(p: Proposal): string {
  if (!p.valid_until) return "";
  const when = new Date(`${p.valid_until}T12:00:00Z`).toLocaleDateString("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  });
  return `\nThis proposal is open until ${when}.\n`;
}

/** The proposal itself. Sent when John presses Send. */
export async function sendProposalEmail(
  p: Proposal,
  url: string,
  note?: string | null
): Promise<boolean> {
  const client = resend();
  if (!client || !p.client_email) return false;

  const greeting = firstName(p) ? `Hi ${firstName(p)},` : "Hi,";

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to: p.client_email,
      subject: `Your proposal ${p.proposal_number} — ${p.title}`,
      text: `${greeting}

Your proposal is ready to read and sign online:

${url}

Proposal: ${p.proposal_number}
Project: ${p.title}

${priceLines(p)}
${expiryLine(p)}${note ? `\n${note.trim()}\n` : ""}
The page has the full scope of work, the pricing, the ownership and software
license terms, and the complete agreement. When you are happy with it, you can
accept and sign right there — no printing, no scanning.

Anything you want changed before you sign, just reply to this email and we
will sort it out.

— John
Founder, Tomorrow's Tech AI
${SITE}
(254) 563-2130`,
    });
    return !res.error;
  } catch (err) {
    console.error("Proposal email failed:", err);
    return false;
  }
}

/** Their copy of what they just signed. */
export async function sendSignedConfirmation(
  p: Proposal,
  signature: ProposalSignature,
  url: string
): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  const due = amountDueAtSignature(p);

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to: signature.signer_email,
      subject: `Signed — proposal ${p.proposal_number}, ${p.title}`,
      text: `Hi ${signature.signer_name.split(/\s+/)[0]},

Thank you — your agreement is signed and recorded.

Proposal: ${p.proposal_number}
Project: ${p.title}
Signed: ${new Date(signature.signed_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}
Agreement version: ${signature.agreement_version}

${priceLines(p)}

Your signed copy stays available at the same link, and you can read or print
it at any time:

${url}

${
  due > 0
    ? "Next step: the payment page is on that link. As soon as it clears we start the build."
    : "Next step: we will be in touch with what we need from you to get started."
}

— John
Founder, Tomorrow's Tech AI
${SITE}`,
    });
    return !res.error;
  } catch (err) {
    console.error("Signed confirmation failed:", err);
    return false;
  }
}

/** Receipt for a proposal payment. */
export async function sendPaymentConfirmation(
  p: Proposal,
  amountCents: number,
  url: string,
  receiptUrl?: string | null
): Promise<boolean> {
  const client = resend();
  if (!client || !p.client_email) return false;

  const balance = Math.max(0, p.total_cents - p.amount_paid_cents - amountCents);

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to: p.client_email,
      subject: `Payment received — ${formatMoney(amountCents, p.currency)}, proposal ${p.proposal_number}`,
      text: `Thank you — your payment of ${formatMoney(amountCents, p.currency)} has been received.

Proposal: ${p.proposal_number}
Project: ${p.title}
${balance > 0 ? `Remaining balance: ${formatMoney(balance, p.currency)}` : "Nothing further is outstanding on the build."}
${p.recurring_price_cents > 0 ? `Hosting & management: ${formatMoney(p.recurring_price_cents, p.currency)}/${p.recurring_interval}` : ""}

Your signed agreement and this proposal stay available here:
${url}
${receiptUrl ? `\nStripe receipt: ${receiptUrl}` : ""}

We will be in touch with the next step shortly.

— John
Founder, Tomorrow's Tech AI
${SITE}`,
    });
    return !res.error;
  } catch (err) {
    console.error("Payment confirmation failed:", err);
    return false;
  }
}

type AdminEventKind = "viewed" | "signed" | "paid" | "declined";

/** Internal notification. Says what happened and what it is worth. */
export async function notifyAdmin(
  kind: AdminEventKind,
  p: Proposal,
  detail?: string | null
): Promise<boolean> {
  const client = resend();
  if (!client) return false;

  const headline: Record<AdminEventKind, string> = {
    viewed: `Viewed — ${p.proposal_number}`,
    signed: `SIGNED — ${p.proposal_number}`,
    paid: `PAID — ${p.proposal_number}`,
    declined: `Declined — ${p.proposal_number}`,
  };

  try {
    const res = await client.emails.send({
      from: fromEmail(),
      to: adminEmail(),
      subject: `${headline[kind]} · ${p.client_business_name || p.client_contact_name || "client"}`,
      text: `${headline[kind]}

Client:   ${p.client_business_name || "—"}
Contact:  ${p.client_contact_name || "—"} ${p.client_email ? `<${p.client_email}>` : ""}
Project:  ${p.title}
Package:  ${p.package_name || "—"}

${priceLines(p)}
${detail ? `\n${detail}\n` : ""}
Open it in the admin under Proposals.`,
    });
    return !res.error;
  } catch (err) {
    console.error("Admin notification failed:", err);
    return false;
  }
}
