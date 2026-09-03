import "server-only";
import { Resend } from "resend";
import {
  buildRequestEmail, buildReminderEmail, buildRequestCompletedEmail,
  buildRequestAdminEmail, type BuiltEmail, type RequestAdminEventKind,
} from "./email-content";
import { markReminded, markSent, requestUrl, type LoadedRequest } from "./service";
import type { ClientRequest } from "./types";

/**
 * Sending client action requests, through the Resend account the rest of the
 * site already uses.
 *
 * This file only sends and records that it sent. What the messages say and
 * how they look lives in email-content.ts, which has no `server-only` import
 * and no Resend client, so the templates render without a send.
 *
 * Nothing here ever includes an /admin URL in a client's email. Their only
 * link is their own tokenised page.
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
 * One send path, so a template that throws can never take a save or a submit
 * down with it. Every caller treats `false` as "not delivered" and carries on
 * — the request, the answers and the completion are already real whether or
 * not the email landed.
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

/** The request itself. Sent when John presses Send. Records the outcome. */
export async function sendRequestEmail(loaded: LoadedRequest): Promise<{
  request: ClientRequest;
  delivered: boolean;
}> {
  const { request, template } = loaded;
  const url = requestUrl(request.token);

  const ok = await deliver(
    request.to_email,
    buildRequestEmail(request, template, url),
    "Client request email"
  );

  return { request: await markSent(request, ok), delivered: ok };
}

/** The nudge. Same link, shorter message, alert tone. */
export async function sendReminderEmail(loaded: LoadedRequest): Promise<boolean> {
  const { request, template } = loaded;
  const url = requestUrl(request.token);

  const ok = await deliver(
    request.to_email,
    buildReminderEmail(request, template, url),
    "Client request reminder"
  );

  if (ok) await markReminded(request);
  return ok;
}

/** Their receipt, the moment they finish. */
export async function sendCompletionReceipt(loaded: LoadedRequest): Promise<boolean> {
  const { request, template } = loaded;
  return deliver(
    request.to_email,
    buildRequestCompletedEmail(request, template, requestUrl(request.token)),
    "Client request receipt"
  );
}

/** John's copy. Never sent to the client. */
export async function notifyAdminOfRequest(
  kind: RequestAdminEventKind,
  loaded: LoadedRequest
): Promise<boolean> {
  return deliver(
    adminEmail(),
    buildRequestAdminEmail(kind, loaded.request, loaded.template),
    "Request admin notification"
  );
}
