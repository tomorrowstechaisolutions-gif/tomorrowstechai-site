import { DEFAULT_FOOTER, DEFAULT_TERMS, PAYMENT_TERMS, type PaymentTerm } from "@/lib/invoices/config";
import { DEFAULT_VALID_DAYS } from "@/lib/proposals/config";
import { DEFAULT_REVIEW_URL, REVIEW_ASK_GAP_DAYS } from "@/lib/reviews/email-content";

/**
 * Business defaults: the handful of values that used to be fixed in code and
 * are now editable on Settings.
 *
 * Pure on purpose (no server-only, no env, no database) so the rules are
 * tested: what the built-in value is, how a stored value is read back, and
 * what a submitted form is allowed to save. The store next to this file does
 * the reading and writing.
 *
 * A stored value never has to be complete or valid. Anything missing or out
 * of range falls back to the built-in value for that one field, so a bad row
 * can never stop an invoice from being raised.
 */

export type BusinessDefaults = {
  /** Payment terms a new invoice starts with. */
  invoiceTerm: PaymentTerm;
  /** The terms wording at the bottom of a new invoice. */
  invoiceTermsText: string;
  /** The thank-you line at the bottom of a new invoice. */
  invoiceFooter: string;
  /** Days a new proposal stays open before it expires. */
  proposalValidDays: number;
  /** Where "leave a review" sends a client. */
  reviewUrl: string;
  /** Days before the same client can be asked for a review again. */
  reviewGapDays: number;
  /** Hours after a new lead before the first follow-up email. */
  followupFirstHours: number;
  /** Hours after a new lead before the second follow-up email. */
  followupSecondHours: number;
};

export type DefaultKey = keyof BusinessDefaults;

/** The built-in values: what the site does when nothing has been saved. */
export const BUILT_IN: BusinessDefaults = {
  invoiceTerm: "due_on_receipt",
  invoiceTermsText: DEFAULT_TERMS,
  invoiceFooter: DEFAULT_FOOTER,
  proposalValidDays: DEFAULT_VALID_DAYS,
  reviewUrl: DEFAULT_REVIEW_URL,
  reviewGapDays: REVIEW_ASK_GAP_DAYS,
  followupFirstHours: 24,
  followupSecondHours: 72,
};

export const LIMITS = {
  invoiceTermsText: 6000,
  invoiceFooter: 2000,
  proposalValidDays: { min: 1, max: 365 },
  reviewGapDays: { min: 0, max: 365 },
  followupHours: { min: 1, max: 720 },
} as const;

/**
 * Terms a new invoice can START with. "Already paid up front" is left out:
 * it is a fact about one invoice, not a sensible default for all of them.
 */
export const DEFAULTABLE_TERMS: PaymentTerm[] = PAYMENT_TERMS.filter((t) => t !== "paid_upfront");

const isTerm = (v: unknown): v is PaymentTerm => typeof v === "string" && (DEFAULTABLE_TERMS as readonly string[]).includes(v);

function wholeNumber(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** A web address a client can safely be sent to: https only. */
export function isHttpsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Reads a stored value back into a full set of defaults. `base` is what an
 * unset field falls back to (the built-ins, or the built-ins with the review
 * link taken from the environment).
 */
export function resolveDefaults(stored: unknown, base: BusinessDefaults = BUILT_IN): BusinessDefaults {
  const s = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const text = (key: DefaultKey, max: number) => {
    const v = s[key];
    return typeof v === "string" && v.trim() && v.length <= max ? v.trim() : (base[key] as string);
  };
  const out: BusinessDefaults = {
    invoiceTerm: isTerm(s.invoiceTerm) ? s.invoiceTerm : base.invoiceTerm,
    invoiceTermsText: text("invoiceTermsText", LIMITS.invoiceTermsText),
    invoiceFooter: text("invoiceFooter", LIMITS.invoiceFooter),
    proposalValidDays: wholeNumber(s.proposalValidDays, LIMITS.proposalValidDays.min, LIMITS.proposalValidDays.max) ?? base.proposalValidDays,
    reviewUrl: typeof s.reviewUrl === "string" && isHttpsUrl(s.reviewUrl.trim()) ? s.reviewUrl.trim() : base.reviewUrl,
    reviewGapDays: wholeNumber(s.reviewGapDays, LIMITS.reviewGapDays.min, LIMITS.reviewGapDays.max) ?? base.reviewGapDays,
    followupFirstHours: wholeNumber(s.followupFirstHours, LIMITS.followupHours.min, LIMITS.followupHours.max) ?? base.followupFirstHours,
    followupSecondHours: wholeNumber(s.followupSecondHours, LIMITS.followupHours.min, LIMITS.followupHours.max) ?? base.followupSecondHours,
  };
  // The second email must come after the first; a stored pair that breaks
  // that is ignored as a pair rather than half-applied.
  if (out.followupSecondHours <= out.followupFirstHours) {
    out.followupFirstHours = base.followupFirstHours;
    out.followupSecondHours = base.followupSecondHours;
  }
  return out;
}

export type ParseResult = { ok: true; value: BusinessDefaults } | { ok: false; error: string };

/**
 * Checks a submitted Settings form. Unlike resolveDefaults this refuses bad
 * input with a sentence the owner can act on, rather than quietly falling
 * back, because a save that silently changed nothing is worse than an error.
 */
export function parseDefaultsForm(get: (name: DefaultKey) => string): ParseResult {
  const term = get("invoiceTerm");
  if (!isTerm(term)) return { ok: false, error: "Pick the payment terms a new invoice should start with." };

  const termsText = get("invoiceTermsText").trim();
  if (!termsText) return { ok: false, error: "The invoice terms wording can't be empty." };
  if (termsText.length > LIMITS.invoiceTermsText) return { ok: false, error: `The invoice terms wording is too long (limit ${LIMITS.invoiceTermsText.toLocaleString("en-US")} characters).` };

  const footer = get("invoiceFooter").trim();
  if (!footer) return { ok: false, error: "The invoice footer line can't be empty." };
  if (footer.length > LIMITS.invoiceFooter) return { ok: false, error: `The invoice footer line is too long (limit ${LIMITS.invoiceFooter.toLocaleString("en-US")} characters).` };

  const validDays = wholeNumber(get("proposalValidDays"), LIMITS.proposalValidDays.min, LIMITS.proposalValidDays.max);
  if (validDays === null) return { ok: false, error: "Proposal validity must be a whole number of days from 1 to 365." };

  const reviewUrl = get("reviewUrl").trim();
  if (!isHttpsUrl(reviewUrl)) return { ok: false, error: "The review link must be a full web address starting with https://" };

  const gap = wholeNumber(get("reviewGapDays"), LIMITS.reviewGapDays.min, LIMITS.reviewGapDays.max);
  if (gap === null) return { ok: false, error: "The gap between review asks must be a whole number of days from 0 to 365." };

  const first = wholeNumber(get("followupFirstHours"), LIMITS.followupHours.min, LIMITS.followupHours.max);
  const second = wholeNumber(get("followupSecondHours"), LIMITS.followupHours.min, LIMITS.followupHours.max);
  if (first === null || second === null) return { ok: false, error: "Follow-up timings must be whole hours from 1 to 720 (30 days)." };
  if (second <= first) return { ok: false, error: "The second follow-up has to come after the first." };

  return {
    ok: true,
    value: {
      invoiceTerm: term, invoiceTermsText: termsText, invoiceFooter: footer,
      proposalValidDays: validDays, reviewUrl, reviewGapDays: gap,
      followupFirstHours: first, followupSecondHours: second,
    },
  };
}

/** Which fields differ from `base`, so the page can say what has been changed. */
export function changedKeys(current: BusinessDefaults, base: BusinessDefaults = BUILT_IN): DefaultKey[] {
  return (Object.keys(base) as DefaultKey[]).filter((k) => current[k] !== base[k]);
}

/** "24 hours", "3 days", "1 day 12 hours": how a follow-up delay reads. */
export function describeHours(hours: number): string {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const d = days ? `${days} day${days === 1 ? "" : "s"}` : "";
  const h = rest ? `${rest} hour${rest === 1 ? "" : "s"}` : "";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return [d, h].filter(Boolean).join(" ");
}

/* ── Team & access ─────────────────────────────────────────────────── */

export const ADMIN_ROLES = ["owner", "admin", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_LABELS: Record<AdminRole, { label: string; can: string }> = {
  owner: { label: "Owner", can: "Everything, including who has access." },
  admin: { label: "Admin", can: "Everything except changing who has access." },
  viewer: { label: "Viewer", can: "Can sign in and look; edit screens that check roles stay locked." },
};

export const isAdminRole = (v: unknown): v is AdminRole => typeof v === "string" && (ADMIN_ROLES as readonly string[]).includes(v);

export type AdminRow = { id: string; role: string };

/**
 * Whether `actor` may change `target`'s role to `nextRole`, or remove them
 * (`nextRole: null`). The rules exist to stop the admin locking itself:
 * only an owner manages access, nobody removes themselves, and the last
 * owner can be neither removed nor demoted.
 */
export function accessChangeAllowed(
  actor: AdminRow, target: AdminRow, nextRole: AdminRole | null, all: AdminRow[],
): { ok: true } | { ok: false; reason: string } {
  if (actor.role !== "owner") return { ok: false, reason: "Only an owner can change who has access." };
  if (nextRole === null && actor.id === target.id) return { ok: false, reason: "You can't remove your own access." };
  const owners = all.filter((a) => a.role === "owner").length;
  const losesOwner = target.role === "owner" && nextRole !== "owner";
  if (losesOwner && owners <= 1) return { ok: false, reason: "This is the only owner. Make someone else an owner first." };
  return { ok: true };
}
