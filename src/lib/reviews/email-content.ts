/**
 * The "would you leave us a Google review?" email: what it says and how it
 * looks. Pure — no env and no server-only — so the System emails page can
 * preview it in the browser. The review link is passed in.
 *
 * The wording asks every client the same way and never asks for a good
 * review, only an honest one. Google's rules forbid picking who to ask by how
 * happy they are, or steering unhappy customers away from reviewing.
 */

import { BRAND, renderEmail, eyebrow, heading, paragraph, button, linkFallback, fineprint, signoff, esc } from "@/lib/email/brand";
import { fill, paragraphsOf, resolveCopy, type CopySlot, type CopyVars, type EmailCopy } from "@/lib/system-emails/copy";
import type { BuiltEmail } from "@/lib/system-emails/types";

/** Where a review is left. Not a secret; override with GOOGLE_REVIEW_URL. */
export const DEFAULT_REVIEW_URL = "https://g.page/r/CbanaKwmxzX-EBM/review";

export const REVIEW_SLOTS: CopySlot[] = [
  { key: "subject", label: "Subject", default: "A quick favor from Tomorrow's Tech AI" },
  { key: "heading", label: "Heading", default: "Would you leave us a Google review?" },
  {
    key: "intro", label: "Message", multiline: true,
    default: "{greeting}\n\nThanks for trusting us with {business_name}. If you have a minute, a short Google review would mean a lot. We're a small shop, and reviews are how other local businesses find us.\n\nAn honest sentence or two is plenty.",
  },
  { key: "button", label: "Button", default: "Leave a Google review" },
  { key: "fineprint", label: "Small print under the button", multiline: true, default: "If anything wasn't right, I want to hear that too. Just reply to this email." },
  { key: "footnote", label: "Footer note", multiline: true, default: "You're receiving this because Tomorrow's Tech AI did work for {business_name}." },
];

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0];
}

const escText = (text: string) => esc(text).replace(/&#39;/g, "'");

export function buildReviewRequestEmail(
  opts: { name: string | null; businessName: string; url: string },
  copy?: Partial<EmailCopy> | null
): BuiltEmail {
  const c = resolveCopy(REVIEW_SLOTS, copy);
  const first = firstName(opts.name);
  const vars: CopyVars = { greeting: first ? `Hi ${first},` : "Hi,", first_name: first, business_name: opts.businessName };
  const htmlVars: CopyVars = { greeting: esc(vars.greeting), first_name: esc(first), business_name: `<strong>${esc(opts.businessName)}</strong>` };
  const f = (t: string) => fill(t, vars);

  const html = renderEmail({
    preheader: "It takes about a minute, and an honest sentence or two is plenty.",
    blocks: [
      eyebrow("A quick favor"),
      heading(f(c.heading)),
      ...paragraphsOf(c.intro).map((p) => paragraph(fill(escText(p), htmlVars))),
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
    `${f(c.button)}:`,
    opts.url,
    "",
    f(c.fineprint),
    "",
    `— ${BRAND.signer}`,
  ].join("\n");

  return { subject: f(c.subject), html, text };
}

/** Days to wait before the same client can be asked again by hand. */
export const REVIEW_ASK_GAP_DAYS = 14;

export type ReviewState = {
  requestedAt: string | null;
  requestCount: number;
  receivedAt: string | null;
};

/**
 * Whether a client may be asked now, and if not, why. Plain logic so the rule
 * is tested: no email on file, already reviewed, or asked too recently.
 */
export function canAskForReview(email: string | null, state: ReviewState, now: Date = new Date()): { ok: true } | { ok: false; reason: string } {
  if (!email || !email.includes("@")) return { ok: false, reason: "Add an email to this client first." };
  if (state.receivedAt) return { ok: false, reason: "This client is marked as having left a review." };
  if (state.requestedAt) {
    const days = (now.getTime() - Date.parse(state.requestedAt)) / 86_400_000;
    if (days < REVIEW_ASK_GAP_DAYS) {
      const wait = Math.ceil(REVIEW_ASK_GAP_DAYS - days);
      return { ok: false, reason: `Already asked recently. You can ask again in ${wait} day${wait === 1 ? "" : "s"}.` };
    }
  }
  return { ok: true };
}
