/**
 * The $149 Starter package, from payment to live.
 *
 * The ad promises 2-3 business days. That is only deliverable if the content
 * arrives in one piece, so the sale hands straight to a wizard instead of a
 * thread of emails asking for the logo again.
 *
 * Shared by the client wizard and the admin, so nothing server-only here.
 */

/** Starter delivery stages. Deliberately not the $399 vocabulary. */
export const STARTER_STAGES = [
  "Purchased",
  "Intake Required",
  "Intake Submitted",
  "Ready to Build",
  "In Development",
  "Client Review",
  "Revision",
  "Launch Ready",
  "Live",
  "On Hold",
] as const;

export type StarterStage = (typeof STARTER_STAGES)[number];

export const STARTER_ACTIVE_STAGES: StarterStage[] = [
  "Purchased",
  "Intake Required",
  "Intake Submitted",
  "Ready to Build",
  "In Development",
  "Client Review",
  "Revision",
  "Launch Ready",
];

/**
 * Who is holding the ball. The whole reason Starter gets its own stages is
 * that "waiting on them" and "waiting on us" are different problems and the
 * board should never blur them.
 */
export const STARTER_STAGE_OWNER: Record<StarterStage, "us" | "client"> = {
  Purchased: "us",
  "Intake Required": "client",
  "Intake Submitted": "us",
  "Ready to Build": "us",
  "In Development": "us",
  "Client Review": "client",
  Revision: "us",
  "Launch Ready": "us",
  Live: "us",
  "On Hold": "client",
};

export const STARTER_STAGE_BLURB: Record<StarterStage, string> = {
  Purchased: "Paid. Intake link going out.",
  "Intake Required": "Waiting on their content. The clock has not started.",
  "Intake Submitted": "Everything is in. Check it before the clock starts.",
  "Ready to Build": "Content checked. Clock running.",
  "In Development": "Three pages going together.",
  "Client Review": "Staging link sent. Waiting on their notes.",
  Revision: "Applying their one revision round.",
  "Launch Ready": "Approved. Domain, DNS and SSL next.",
  Live: "Delivered. Hosting is running.",
  "On Hold": "Blocked — usually waiting on the client.",
};

export const STARTER_PACKAGE = "starter_149";

/** The promise in the ad, in business days, counted from Ready to Build. */
export const STARTER_PROMISED_DAYS = 3;

/** The one-time build price, in cents. */
export const STARTER_PRICE_CENTS = 14900;

// ─── The wizard ────────────────────────────────────────────────────────────

export const INTAKE_STEPS = [
  { n: 1, slug: "business", title: "Business information", blurb: "Who you are and how customers reach you." },
  { n: 2, slug: "content", title: "Website content", blurb: "What the three pages should say." },
  { n: 3, slug: "branding", title: "Branding & photos", blurb: "Your logo, your pictures, your colours." },
  { n: 4, slug: "domain", title: "Domain & access", blurb: "Where the site will live." },
  { n: 5, slug: "review", title: "Review & submit", blurb: "Check it over and start the clock." },
] as const;

export const TOTAL_STEPS = INTAKE_STEPS.length;

export const PRIMARY_CTAS = [
  "Call",
  "Request Quote",
  "Contact Us",
  "Book Consultation",
] as const;

export type PrimaryCta = (typeof PRIMARY_CTAS)[number];

export const DOMAIN_STATUSES = [
  { value: "existing", label: "I already own a domain" },
  { value: "new", label: "I want a new domain" },
  { value: "undecided", label: "I need help deciding" },
] as const;

export const SOCIAL_NETWORKS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "other", label: "Other" },
] as const;

export const FILE_KINDS = [
  { value: "logo", label: "Logo", hint: "PNG or SVG with a transparent background if you have one.", required: true },
  { value: "team", label: "Team photos", hint: "You, your crew, anyone customers will meet.", required: false },
  { value: "work", label: "Work / project photos", hint: "Real jobs beat stock photography every time.", required: false },
  { value: "premises", label: "Storefront, vehicle or equipment", hint: "If it is branded, it belongs on the site.", required: false },
  { value: "other", label: "Anything else", hint: "Certifications, awards, badges.", required: false },
] as const;

export type FileKind = (typeof FILE_KINDS)[number]["value"];

/** Per file. The bucket enforces this too; this is the friendly failure. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 30;

export const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "application/pdf",
] as const;

/**
 * What must be answered before the clock can start.
 *
 * Kept here rather than as NOT NULL columns because this is a statement about
 * the product, not the data, and it will change faster than the schema should.
 * Everything absent from this list is genuinely optional — a business with no
 * social accounts and no testimonials can still submit.
 */
export const REQUIRED_FIELDS = [
  "business_name",
  "contact_name",
  "email",
  "phone",
  "business_address",
  "service_area",
  "business_hours",
  "business_description",
  "services_offered",
  "home_page_content",
  "services_page_content",
  "contact_page_info",
  "primary_cta",
  "domain_status",
] as const;

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export const FIELD_LABELS: Record<string, string> = {
  business_name: "Business name",
  contact_name: "Primary contact name",
  email: "Email",
  phone: "Phone number",
  business_address: "Business address",
  service_area: "Service area / cities served",
  business_hours: "Business hours",
  google_business_url: "Google Business Profile",
  business_description: "Business description",
  services_offered: "Services offered",
  home_page_content: "Home page content",
  services_page_content: "Services page content",
  contact_page_info: "Contact page information",
  primary_cta: "Primary call to action",
  testimonials: "Testimonials / reviews",
  brand_colors: "Brand colours",
  example_websites: "Example websites you like",
  legal_text: "Required legal text",
  domain_status: "Domain",
  domain_name: "Domain name",
  registrar: "Registrar",
  domain_notes: "Domain notes",
};

/** Which step a field lives on, so "3 missing" can say where. */
export const FIELD_STEP: Record<string, number> = {
  business_name: 1,
  contact_name: 1,
  email: 1,
  phone: 1,
  business_address: 1,
  service_area: 1,
  business_hours: 1,
  google_business_url: 1,
  business_description: 2,
  services_offered: 2,
  home_page_content: 2,
  services_page_content: 2,
  contact_page_info: 2,
  primary_cta: 2,
  testimonials: 2,
  brand_colors: 3,
  example_websites: 3,
  legal_text: 3,
  domain_status: 4,
  domain_name: 4,
  registrar: 4,
  domain_notes: 4,
};

export const ATTESTATION_TURNAROUND =
  "I understand the 2–3 business day turnaround begins after Tomorrow’s Tech AI receives all required content, images, access information, and payment.";

export const ATTESTATION_RIGHTS =
  "I confirm that I own or have permission to use all logos, images, text, and other materials I submit.";

/** Shape the wizard and the admin both read. */
export type IntakeRecord = {
  id: string;
  job_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  package: string;
  token: string;
  token_expires_at: string;
  status: "draft" | "submitted";
  current_step: number;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  business_address: string | null;
  service_area: string | null;
  business_hours: string | null;
  google_business_url: string | null;
  business_description: string | null;
  services_offered: string | null;
  home_page_content: string | null;
  services_page_content: string | null;
  contact_page_info: string | null;
  primary_cta: PrimaryCta | null;
  testimonials: string | null;
  brand_colors: string | null;
  example_websites: string | null;
  legal_text: string | null;
  social_links: Record<string, string>;
  domain_status: "existing" | "new" | "undecided" | null;
  domain_name: string | null;
  registrar: string | null;
  domain_notes: string | null;
  attest_turnaround: boolean;
  attest_rights: boolean;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IntakeFile = {
  id: string;
  intake_id: string;
  kind: FileKind;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

/**
 * What is still missing. One function, used by the wizard to disable submit,
 * by the submit route to refuse, and by the admin to explain a stalled job —
 * three places that must never disagree about what "complete" means.
 */
export function missingRequirements(
  intake: Pick<IntakeRecord, RequiredField | "attest_turnaround" | "attest_rights">,
  files: Pick<IntakeFile, "kind">[]
): { field: string; label: string; step: number }[] {
  const missing: { field: string; label: string; step: number }[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = intake[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      missing.push({
        field,
        label: FIELD_LABELS[field] ?? field,
        step: FIELD_STEP[field] ?? 1,
      });
    }
  }

  if (!files.some((f) => f.kind === "logo")) {
    missing.push({ field: "logo", label: "Logo upload", step: 3 });
  }
  if (!intake.attest_turnaround) {
    missing.push({ field: "attest_turnaround", label: "Turnaround acknowledgement", step: 5 });
  }
  if (!intake.attest_rights) {
    missing.push({ field: "attest_rights", label: "Rights confirmation", step: 5 });
  }

  return missing;
}
