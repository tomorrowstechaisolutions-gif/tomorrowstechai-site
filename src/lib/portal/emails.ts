import "server-only";
import { Resend } from "resend";
import {
  BRAND, renderEmail, eyebrow, heading, paragraph, button, linkFallback, fineprint, signoff, bullets, esc,
} from "@/lib/email/brand";

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

function hello(name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi,";
}

export async function sendPortalInvite(opts: { to: string; name: string | null; businessName: string; url: string }) {
  const html = renderEmail({
    preheader: `Your ${BRAND.name} member account is ready. Set a password to sign in.`,
    blocks: [
      eyebrow("Member account"),
      heading(`Your ${BRAND.name} account is ready`),
      paragraph(esc(hello(opts.name))),
      paragraph(
        `We've set up a member account for <strong>${esc(opts.businessName)}</strong>. ` +
          `It's where you'll see your services, invoices and billing in one place.`
      ),
      bullets(["Your username is this email address.", "Click below to choose your password.", "After that, sign in any time at tomorrowstechai.com/account."]),
      button("Set your password", opts.url),
      linkFallback(opts.url),
      fineprint("This link works once and expires in 24 hours. If it has expired, use \"Forgot password\" on the sign-in page, or reply to this email."),
      signoff(),
    ],
    footnote: `You're receiving this because ${BRAND.name} manages services for ${opts.businessName}.`,
  });
  const text = [
    hello(opts.name),
    "",
    `We've set up a member account for ${opts.businessName}. It's where you'll see your services, invoices and billing in one place.`,
    "",
    "Your username is this email address. Choose your password here:",
    opts.url,
    "",
    "After that, sign in any time at https://www.tomorrowstechai.com/account",
    "",
    "This link works once and expires in 24 hours.",
    "",
    `— ${BRAND.signer}`,
  ].join("\n");
  return deliver(opts.to, `Your ${BRAND.name} member account`, html, text, "Portal invite email");
}

export async function sendPortalReset(opts: { to: string; name: string | null; url: string }) {
  const html = renderEmail({
    preheader: "Reset your member account password.",
    blocks: [
      eyebrow("Password reset"),
      heading("Reset your password"),
      paragraph(esc(hello(opts.name))),
      paragraph("Someone asked to reset the password for your member account. If that was you, choose a new one below."),
      button("Choose a new password", opts.url),
      linkFallback(opts.url),
      fineprint("This link works once and expires in 24 hours. If you didn't ask for this, you can ignore this email; your password hasn't changed."),
      signoff(),
    ],
  });
  const text = [
    hello(opts.name),
    "",
    "Someone asked to reset the password for your member account. If that was you, choose a new one here:",
    opts.url,
    "",
    "This link works once and expires in 24 hours. If you didn't ask for this, ignore this email.",
  ].join("\n");
  return deliver(opts.to, "Reset your member account password", html, text, "Portal reset email");
}
