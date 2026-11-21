/**
 * Remembering a visitor who has already told Tess who they are, so she does
 * not ask again on their next visit.
 *
 * It is kept in the visitor's own browser, nowhere else: a different phone or
 * computer is a stranger to her, and clearing the browser forgets them. Their
 * details are already on the lead in the CRM from the first visit.
 */

export type GuideContact = { name: string; email: string; phone: string };

export const CONTACT_KEY = "tess-guide-contact";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** What gets stored in the browser. */
export function packContact(contact: GuideContact): string {
  return JSON.stringify({ name: contact.name, email: contact.email, phone: contact.phone });
}

/** The visitor the browser remembers, or null when there is none worth trusting. */
export function readContact(raw: string | null | undefined): GuideContact | null {
  if (!raw) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
  const { name, email, phone } = saved as Record<string, unknown>;
  const who = { name: clean(name, 120), email: clean(email, 200), phone: clean(phone, 40) };
  return who.name && EMAIL_RE.test(who.email) ? who : null;
}
