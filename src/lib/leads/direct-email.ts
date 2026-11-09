/**
 * One-to-one email from the lead page.
 *
 * Pure functions only, so the rules can be checked without a database or an
 * email provider (scripts/verify-lead-email.mts). The server action in
 * src/app/admin/lead-email-actions.ts does the sending and logging.
 *
 * Nothing is added to the message behind John's back: the signature lives in
 * the editable body, so what he sees in the box is exactly what is sent.
 */

export const SUBJECT_MAX = 160;
export const BODY_MAX = 10_000;

export const SIGNATURE = `— John
John C. Hockinson Jr.
Founder, Tomorrow's Tech AI
https://www.tomorrowstechai.com
(254) 563-2130`;

export type EmailableLead = {
  first_name: string;
  business_name: string | null;
  email: string;
  do_not_contact: boolean;
  unsubscribed_at: string | null;
};

export type LeadEmailTemplate = { id: string; label: string; subject: string; body: string };

function greeting(firstName: string): string {
  const name = firstName.trim();
  // Form names arrive as typed ("alex"); greet them properly.
  return name ? `Hi ${name.charAt(0).toUpperCase()}${name.slice(1)},` : "Hi,";
}

/** Starting points. Every one is fully editable before sending. */
export function leadEmailTemplates(lead: Pick<EmailableLead, "first_name" | "business_name">): LeadEmailTemplate[] {
  const hi = greeting(lead.first_name);
  const forBiz = lead.business_name ? ` for ${lead.business_name}` : "";
  return [
    {
      id: "blank",
      label: "Blank",
      subject: "",
      body: `${hi}\n\n\n\n${SIGNATURE}`,
    },
    {
      id: "more-details",
      label: "Ask for details",
      subject: "Following up on your message",
      body: `${hi}

Thanks for reaching out to Tomorrow's Tech AI. I read your message and want to make sure I point you in the right direction${forBiz}.

Could you tell me a little more?

- What kind of business you run
- What you're hoping to get done
- Roughly when you'd like it working

A couple of sentences is plenty. If it's easier to talk it through, just reply with a good time and number to reach you.

${SIGNATURE}`,
    },
    {
      id: "book-call",
      label: "Offer a call",
      subject: "Quick call about your project?",
      body: `${hi}

Thanks for getting in touch. The fastest way for me to understand what you need is a short call, usually 20 to 30 minutes, no pressure and no pitch deck.

Reply with two or three times that work for you this week and I'll send an invite.

${SIGNATURE}`,
    },
    {
      id: "check-in",
      label: "Check in",
      subject: "Checking in",
      body: `${hi}

Just checking in on your message from the other day. If you're still looking for help, I'm happy to pick it up whenever you're ready. If the timing changed, no problem at all.

${SIGNATURE}`,
    },
  ];
}

export type EmailBlock = { blocked: true; reason: string } | { blocked: false; warning: string | null };

/** Whether John may email this lead from the admin, and what to warn about. */
export function emailBlock(lead: Pick<EmailableLead, "email" | "do_not_contact" | "unsubscribed_at">): EmailBlock {
  if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return { blocked: true, reason: "This lead has no valid email address. Fix it in Contact & business first." };
  }
  if (lead.do_not_contact) {
    return { blocked: true, reason: "This lead is marked do-not-contact. Clear that under Ownership & follow-up before emailing." };
  }
  if (lead.unsubscribed_at) {
    return {
      blocked: false,
      warning:
        "They unsubscribed from automated emails. A personal reply to their inquiry is fine; don't send marketing.",
    };
  }
  return { blocked: false, warning: null };
}

export type DraftCheck = { ok: true; subject: string; body: string } | { ok: false; error: string };

/** Cleans and validates what was typed. Rejects header-injection attempts. */
export function checkDraft(rawSubject: string, rawBody: string): DraftCheck {
  const subject = rawSubject.replace(/\s+/g, " ").trim();
  const body = rawBody.replace(/\r\n/g, "\n").trim();
  if (!subject) return { ok: false, error: "Add a subject line." };
  if (subject.length > SUBJECT_MAX) return { ok: false, error: `Keep the subject under ${SUBJECT_MAX} characters.` };
  if (!body) return { ok: false, error: "The message is empty." };
  if (body.length > BODY_MAX) return { ok: false, error: `Keep the message under ${BODY_MAX.toLocaleString("en-US")} characters.` };
  // A template's empty space left unfilled: greeting and signature, nothing else.
  const withoutFrame = body.replace(SIGNATURE, "").replace(/^Hi[^\n]*,?/, "").trim();
  if (!withoutFrame) return { ok: false, error: "Write your message between the greeting and the signature." };
  return { ok: true, subject, body };
}

/** The line stored on the lead's activity timeline. */
export function activityBody(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body}`;
}
