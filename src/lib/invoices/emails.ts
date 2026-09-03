import "server-only";
import { Resend } from "resend";
import type { Invoice, InvoiceItem } from "./types";
import {
  buildInvoiceEmail, buildInvoiceReceiptEmail, buildInvoiceReminderEmail,
  buildAdminInvoiceEmail, type AdminInvoiceEvent, type BuiltEmail,
} from "./email-content";

/**
 * Invoice email, through the Resend account the rest of the site already
 * uses.
 *
 * This file only sends. What the messages say and how they look lives in
 * email-content.ts, which has no server-only import and no Resend client, so
 * the templates can be rendered and inspected without a send.
 *
 * Nothing here ever includes an /admin URL. The client's only link is their
 * own tokenised invoice page.
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
 * One send path, so a template that throws can never take a payment or a
 * webhook down with it. Every caller treats `false` as "not delivered" and
 * carries on — the invoice and the money are already real whether or not the
 * email landed.
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

/** The invoice itself. Sent when John presses Email to client. */
export async function sendInvoiceEmail(
  inv: Invoice,
  items: InvoiceItem[],
  url: string,
  note?: string | null
): Promise<boolean> {
  if (!inv.client_email) return false;
  return deliver(inv.client_email, buildInvoiceEmail(inv, items, url, note), "Invoice email");
}

/** Their receipt, after money lands by any route. */
export async function sendInvoiceReceipt(
  inv: Invoice,
  amountCents: number,
  url: string,
  receiptUrl?: string | null
): Promise<boolean> {
  if (!inv.client_email) return false;
  return deliver(
    inv.client_email,
    buildInvoiceReceiptEmail(inv, amountCents, url, receiptUrl),
    "Invoice receipt"
  );
}

/** A nudge on something overdue. */
export async function sendInvoiceReminder(
  inv: Invoice,
  items: InvoiceItem[],
  url: string,
  daysLate: number
): Promise<boolean> {
  if (!inv.client_email) return false;
  return deliver(
    inv.client_email,
    buildInvoiceReminderEmail(inv, items, url, daysLate),
    "Invoice reminder"
  );
}

/** Internal notification. Says what happened and what it is worth. */
export async function notifyAdminInvoice(
  kind: AdminInvoiceEvent,
  inv: Invoice,
  detail?: string | null
): Promise<boolean> {
  return deliver(adminEmail(), buildAdminInvoiceEmail(kind, inv, detail), "Admin invoice notification");
}
