/**
 * What the member-portal emails say, and what they look like.
 *
 * Split out from emails.ts the same way the invoice emails are: sending
 * needs `server-only` and the Resend client, composing needs neither. Pure:
 * no env, no server-only. Anything env-derived (the admin link) is passed in.
 */

import {
  BRAND, renderEmail, eyebrow, heading, paragraph, button, linkFallback, fineprint, signoff, bullets, esc,
} from "@/lib/email/brand";
import { fill, linesOf, paragraphsOf, resolveCopy, type CopySlot, type CopyVars, type EmailCopy } from "@/lib/system-emails/copy";
import type { BuiltEmail } from "@/lib/system-emails/types";

export type { BuiltEmail };

// ═══════════════════════════════════════════════════════════════════════
// Editable wording (System emails page). Defaults are the shipped text.
// ═══════════════════════════════════════════════════════════════════════

export const PORTAL_SLOTS: Record<"invite" | "reset" | "request" | "billing", CopySlot[]> = {
  invite: [
    { key: "subject", label: "Subject", default: "Your Tomorrow's Tech AI member account" },
    { key: "heading", label: "Heading", default: "Your Tomorrow's Tech AI account is ready" },
    { key: "intro", label: "Opening", default: "{greeting}\n\nWe've set up a member account for {business_name}. It's where you'll see your services, invoices and billing in one place.", multiline: true },
    { key: "steps", label: "Points (one per line)", default: "Your username is this email address.\nClick below to choose your password.\nAfter that, sign in any time at tomorrowstechai.com/account.", multiline: true },
    { key: "button", label: "Button", default: "Set your password" },
    { key: "fineprint", label: "Small print under the button", default: "This link works once and expires in 24 hours. If it has expired, use \"Forgot password\" on the sign-in page, or reply to this email.", multiline: true },
    { key: "footnote", label: "Footer note", default: "You're receiving this because Tomorrow's Tech AI manages services for {business_name}.", multiline: true },
    { key: "text_password", label: "Password line (plain-text version)", default: "Your username is this email address. Choose your password here:" },
    { key: "text_signin", label: "Sign-in line (plain-text version)", default: "After that, sign in any time at https://www.tomorrowstechai.com/account" },
    { key: "text_expiry", label: "Small print (plain-text version)", default: "This link works once and expires in 24 hours." },
  ],
  reset: [
    { key: "subject", label: "Subject", default: "Reset your member account password" },
    { key: "heading", label: "Heading", default: "Reset your password" },
    { key: "intro", label: "Opening", default: "{greeting}\n\nSomeone asked to reset the password for your member account. If that was you, choose a new one below.", multiline: true },
    { key: "button", label: "Button", default: "Choose a new password" },
    { key: "fineprint", label: "Small print under the button", default: "This link works once and expires in 24 hours. If you didn't ask for this, you can ignore this email; your password hasn't changed.", multiline: true },
    { key: "text_intro", label: "Opening (plain-text version)", default: "{greeting}\n\nSomeone asked to reset the password for your member account. If that was you, choose a new one here:", multiline: true },
    { key: "text_expiry", label: "Small print (plain-text version)", default: "This link works once and expires in 24 hours. If you didn't ask for this, ignore this email.", multiline: true },
  ],
  request: [
    { key: "subject", label: "Subject", default: "[Portal] {label}: {subject}", help: "{label} is the request type (Question, Change request, ...). {subject} is what the member typed." },
    { key: "intro", label: "Line above the message", default: "{business_name} ({from}) wrote:" },
    { key: "button", label: "Button", default: "Open the client" },
    { key: "text_heading", label: "First line (plain-text version)", default: "{label} from {business_name} ({from})" },
  ],
  billing: [
    { key: "headline_scheduled", label: "Headline: cancellation scheduled (with end date)", default: "{business_name} cancelled {services} (ends {ends_on})", help: "Used as the heading and, after \"[Billing] \", the subject." },
    { key: "headline_scheduled_nodate", label: "Headline: cancellation scheduled (no end date)", default: "{business_name} cancelled {services}" },
    { key: "headline_resumed", label: "Headline: cancellation undone", default: "{business_name} kept {services} (cancellation undone)" },
    { key: "headline_ended", label: "Headline: subscription ended", default: "{business_name}: {services} has ended" },
    { key: "no_services", label: "Wording when no service names are known", default: "their subscription" },
    { key: "body_scheduled", label: "Body: cancellation scheduled", default: "They cancelled from the billing page. Nothing more will be charged, and the service stays on until {ends_on}.", multiline: true },
    { key: "period_fallback", label: "End date wording when no date is known", default: "the end of the paid period" },
    { key: "body_resumed", label: "Body: cancellation undone", default: "They undid a scheduled cancellation, so billing carries on as before.", multiline: true },
    { key: "body_ended", label: "Body: subscription ended", default: "The subscription has ended in Stripe. The service is now marked ended on their client record.", multiline: true },
    { key: "reason_label", label: "Reason label", default: "Reason given:" },
    { key: "button", label: "Button", default: "Open the client" },
  ],
};

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0];
}

function hello(name: string | null): string {
  const first = firstName(name);
  return first ? `Hi ${first},` : "Hi,";
}

/**
 * Escapes edited wording for element content. Apostrophes are left alone:
 * they are harmless outside an attribute, and the shipped markup had them raw.
 */
function escText(text: string): string {
  return esc(text).replace(/&#39;/g, "'");
}

/** Wording as HTML: the template escaped, then fill-ins dropped in already as HTML. */
function fillHtml(template: string, htmlVars: CopyVars): string {
  return fill(escText(template), htmlVars);
}

// ═══════════════════════════════════════════════════════════════════════
// Member-facing.
// ═══════════════════════════════════════════════════════════════════════

export function buildPortalInviteEmail(
  opts: { name: string | null; businessName: string; url: string },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(PORTAL_SLOTS.invite, copy);
  const vars = { greeting: hello(opts.name), first_name: firstName(opts.name), business_name: opts.businessName };
  const htmlVars = { ...vars, greeting: esc(vars.greeting), first_name: esc(vars.first_name), business_name: `<strong>${esc(opts.businessName)}</strong>` };
  const f = (t: string) => fill(t, vars);
  const intro = paragraphsOf(c.intro);

  const html = renderEmail({
    preheader: `Your ${BRAND.name} member account is ready. Set a password to sign in.`,
    blocks: [
      eyebrow("Member account"),
      heading(f(c.heading)),
      ...intro.map((p) => paragraph(fillHtml(p, htmlVars))),
      bullets(linesOf(f(c.steps))),
      button(f(c.button), opts.url),
      linkFallback(opts.url),
      fineprint(f(c.fineprint)),
      signoff(),
    ],
    footnote: f(c.footnote),
  });
  const text = [
    paragraphsOf(f(c.intro)).join("\n\n"),
    "",
    f(c.text_password),
    opts.url,
    "",
    f(c.text_signin),
    "",
    f(c.text_expiry),
    "",
    `— ${BRAND.signer}`,
  ].join("\n");
  return { subject: f(c.subject), html, text };
}

export function buildPortalResetEmail(
  opts: { name: string | null; url: string },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(PORTAL_SLOTS.reset, copy);
  const vars = { greeting: hello(opts.name), first_name: firstName(opts.name) };
  const htmlVars = { greeting: esc(vars.greeting), first_name: esc(vars.first_name) };
  const f = (t: string) => fill(t, vars);

  const html = renderEmail({
    preheader: "Reset your member account password.",
    blocks: [
      eyebrow("Password reset"),
      heading(f(c.heading)),
      ...paragraphsOf(c.intro).map((p) => paragraph(fillHtml(p, htmlVars))),
      button(f(c.button), opts.url),
      linkFallback(opts.url),
      fineprint(f(c.fineprint)),
      signoff(),
    ],
  });
  const text = [
    paragraphsOf(f(c.text_intro)).join("\n\n"),
    opts.url,
    "",
    paragraphsOf(f(c.text_expiry)).join("\n\n"),
  ].join("\n");
  return { subject: f(c.subject), html, text };
}

// ═══════════════════════════════════════════════════════════════════════
// To John.
// ═══════════════════════════════════════════════════════════════════════

export const PORTAL_REQUEST_LABELS: Record<string, string> = {
  question: "Question", change: "Change request", problem: "Problem", billing: "Billing",
  cancel: "Cancellation request", new_service: "New service request",
};

export function buildPortalRequestAlertEmail(
  opts: { businessName: string; from: string; category: string; subject: string; message: string; adminUrl: string },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(PORTAL_SLOTS.request, copy);
  const label = PORTAL_REQUEST_LABELS[opts.category] ?? "Request";
  const vars = { label, subject: opts.subject, business_name: opts.businessName, from: opts.from };
  const htmlVars = { label: esc(label), subject: esc(opts.subject), business_name: `<strong>${esc(opts.businessName)}</strong>`, from: esc(opts.from) };
  const f = (t: string) => fill(t, vars);

  const html = renderEmail({
    preheader: `${label} from ${opts.businessName}: ${opts.subject}`,
    blocks: [
      eyebrow(`Member portal · ${label}`),
      heading(opts.subject),
      paragraph(fillHtml(c.intro, htmlVars)),
      paragraph(esc(opts.message).replace(/\n/g, "<br />")),
      button(f(c.button), opts.adminUrl),
    ],
    tone: opts.category === "cancel" || opts.category === "problem" ? "alert" : "default",
  });
  const text = [f(c.text_heading), "", opts.subject, "", opts.message, "", opts.adminUrl].join("\n");
  return { subject: f(c.subject).slice(0, 180), html, text };
}

export type BillingChangeKind = "scheduled" | "resumed" | "ended";

export function buildBillingChangeAlertEmail(
  opts: { kind: BillingChangeKind; businessName: string; services: string[]; endsOn: string | null; reason: string | null; adminUrl: string },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(PORTAL_SLOTS.billing, copy);
  const what = opts.services.length ? opts.services.join(", ") : c.no_services;
  const vars = { business_name: opts.businessName, services: what, ends_on: opts.endsOn ?? c.period_fallback };
  const f = (t: string) => fill(t, vars);
  const subject = f(
    opts.kind === "scheduled"
      ? opts.endsOn ? c.headline_scheduled : c.headline_scheduled_nodate
      : opts.kind === "resumed"
        ? c.headline_resumed
        : c.headline_ended
  );
  const body = paragraphsOf(f(opts.kind === "scheduled" ? c.body_scheduled : opts.kind === "resumed" ? c.body_resumed : c.body_ended));
  const reasonLabel = f(c.reason_label);

  const html = renderEmail({
    preheader: subject,
    blocks: [
      eyebrow("Billing change"),
      heading(subject),
      ...body.map((p) => paragraph(esc(p))),
      ...(opts.reason ? [paragraph(`<strong>${esc(reasonLabel)}</strong> ${esc(opts.reason)}`)] : []),
      button(f(c.button), opts.adminUrl),
    ],
    tone: opts.kind === "resumed" ? "default" : "alert",
  });
  const text = [subject, "", body.join("\n\n"), ...(opts.reason ? ["", `${reasonLabel} ${opts.reason}`] : []), "", opts.adminUrl].join("\n");
  return { subject: `[Billing] ${subject}`.slice(0, 180), html, text };
}
