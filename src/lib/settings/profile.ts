/**
 * Business profile: the contact details and identity the site shows about
 * the business, edited in one place on Settings.
 *
 * Pure on purpose (no server-only, no env, no database) so the rules are
 * tested and so client components and email builders can import the types
 * and helpers. The store next to this file does the reading and writing.
 *
 * What the profile does NOT control is stated here rather than implied:
 * the company name and the website address are fixed (FIXED_IDENTITY). The
 * name runs through the marketing copy of the whole site, so changing it is
 * a rebrand, not a setting.
 */

export type BusinessProfile = {
  /** Public phone, stored formatted: "(254) 563-2130". */
  phone: string;
  /** The address clients and visitors are told to write to. */
  email: string;
  /** First name emails are signed with. */
  signerName: string;
  /** The line under the signature. */
  signerRole: string;
  /** City shown as where the business is based. No street address. */
  city: string;
  /** Two-letter state. */
  region: string;
  /** The legal entity behind the brand, shown in the footer and search data. */
  legalName: string;
};

export type ProfileKey = keyof BusinessProfile;

export const FIXED_IDENTITY = {
  name: "Tomorrow's Tech AI",
  site: "https://www.tomorrowstechai.com",
  siteLabel: "tomorrowstechai.com",
} as const;

/** The built-in values: what the site shows when nothing has been saved. */
export const BUILT_IN_PROFILE: BusinessProfile = {
  phone: "(254) 563-2130",
  email: "info@tomorrowstechai.com",
  signerName: "John",
  signerRole: "Founder, Tomorrow's Tech AI",
  city: "Belton",
  region: "TX",
  legalName: "Tomorrowstek LLC",
};

export const PROFILE_LIMITS = { signerName: 60, signerRole: 100, city: 60, legalName: 100, email: 120 } as const;

/** The ten digits of a US number, or null. Accepts "+1", spaces, dots, dashes, brackets. */
export function phoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  // Area code and exchange can't start with 0 or 1 in the US numbering plan.
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? ten : null;
}

/** "(254) 563-2130" from any accepted spelling, or null. */
export function formatPhone(raw: string): string | null {
  const d = phoneDigits(raw);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

export function isEmail(raw: string): boolean {
  return raw.length <= PROFILE_LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t && t.length <= max ? t : null;
};

const region = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(t) ? t : null;
};

/** Reads a stored value back into a full profile, field by field. */
export function resolveProfile(stored: unknown, base: BusinessProfile = BUILT_IN_PROFILE): BusinessProfile {
  const s = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const email = typeof s.email === "string" ? s.email.trim().toLowerCase() : "";
  return {
    phone: (typeof s.phone === "string" ? formatPhone(s.phone) : null) ?? base.phone,
    email: isEmail(email) ? email : base.email,
    signerName: text(s.signerName, PROFILE_LIMITS.signerName) ?? base.signerName,
    signerRole: text(s.signerRole, PROFILE_LIMITS.signerRole) ?? base.signerRole,
    city: text(s.city, PROFILE_LIMITS.city) ?? base.city,
    region: region(s.region) ?? base.region,
    legalName: text(s.legalName, PROFILE_LIMITS.legalName) ?? base.legalName,
  };
}

export type ProfileParse = { ok: true; value: BusinessProfile } | { ok: false; error: string };

/** Checks a submitted profile form, refusing bad input with a sentence the owner can act on. */
export function parseProfileForm(get: (name: ProfileKey) => string): ProfileParse {
  const phone = formatPhone(get("phone"));
  if (!phone) return { ok: false, error: "Enter a 10-digit US phone number, for example (254) 563-2130." };

  const email = get("email").trim().toLowerCase();
  if (!isEmail(email)) return { ok: false, error: "Enter a full email address for the contact email." };

  const signerName = text(get("signerName"), PROFILE_LIMITS.signerName);
  if (!signerName) return { ok: false, error: `Enter the name emails are signed with (up to ${PROFILE_LIMITS.signerName} characters).` };

  const signerRole = text(get("signerRole"), PROFILE_LIMITS.signerRole);
  if (!signerRole) return { ok: false, error: `Enter the line that goes under the signature (up to ${PROFILE_LIMITS.signerRole} characters).` };

  const city = text(get("city"), PROFILE_LIMITS.city);
  if (!city || /\d/.test(city)) return { ok: false, error: "Enter the city only, with no street address or zip code." };

  const state = region(get("region"));
  if (!state) return { ok: false, error: "Enter the state as two letters, for example TX." };

  const legalName = text(get("legalName"), PROFILE_LIMITS.legalName);
  if (!legalName) return { ok: false, error: `Enter the legal business name (up to ${PROFILE_LIMITS.legalName} characters).` };

  return { ok: true, value: { phone, email, signerName, signerRole, city, region: state, legalName } };
}

/** The profile plus the spellings different places need. */
export type ProfileView = BusinessProfile & {
  /** "tel:+12545632130", for links. */
  phoneHref: string;
  /** "+1-254-563-2130", the spelling search engines expect. */
  phoneIntl: string;
  /** "mailto:info@…" */
  emailHref: string;
  /** "Belton, TX" */
  location: string;
};

export function profileView(p: BusinessProfile): ProfileView {
  const d = phoneDigits(p.phone) ?? phoneDigits(BUILT_IN_PROFILE.phone)!;
  return {
    ...p,
    phoneHref: `tel:+1${d}`,
    phoneIntl: `+1-${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`,
    emailHref: `mailto:${p.email}`,
    location: `${p.city}, ${p.region}`,
  };
}

/** The view used before anything is loaded, and whenever loading fails. */
export const BUILT_IN_VIEW: ProfileView = profileView(BUILT_IN_PROFILE);

/** Which fields differ from the built-ins, so the page can say what has been changed. */
export function changedProfileKeys(current: BusinessProfile, base: BusinessProfile = BUILT_IN_PROFILE): ProfileKey[] {
  return (Object.keys(base) as ProfileKey[]).filter((k) => current[k] !== base[k]);
}
