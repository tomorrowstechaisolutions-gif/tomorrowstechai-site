/**
 * The Central Texas AI Business Modernization Initiative — the vocabulary the
 * public page, the API route, the emails and the admin all share.
 *
 * No `server-only` import on purpose: the client form reads the option lists
 * from here, and the route validates against the very same arrays, so the two
 * can never drift.
 */

export const INITIATIVE_NAME = "Central Texas AI Business Modernization Initiative";
export const INITIATIVE_PATH = "/central-texas-ai";
export const INITIATIVE_URL = "https://tomorrowstechai.com/central-texas-ai";

/**
 * `leads.source` values. The admin filters on these exactly, so they are the
 * contract — change them and old rows stop matching the filter.
 */
export const INITIATIVE_SOURCES = {
  business: "Central Texas AI Initiative",
  partner: "Central Texas AI Partner Inquiry",
} as const;

export type InitiativeKind = keyof typeof INITIATIVE_SOURCES;

/**
 * `leads.tags`. Tags are added to a returning contact too, whereas `source`
 * keeps the contact's first-touch value — so the tag is the dependable way to
 * find every initiative submission, including ones from existing contacts.
 */
export const INITIATIVE_TAG = "Central Texas AI";
export const BUSINESS_TAG = "Business Interest";
export const PARTNER_TAG = "Partner Inquiry";

export const INITIATIVE_TAGS: Record<InitiativeKind, string[]> = {
  business: [INITIATIVE_TAG, BUSINESS_TAG, "Pilot Program"],
  partner: [INITIATIVE_TAG, PARTNER_TAG, "Economic Development", "Partner"],
};

export const AI_USE_OPTIONS = ["None", "Limited", "Some AI tools", "Advanced"];
export const PILOT_INTEREST_OPTIONS = ["Yes", "Maybe", "I would like more information"];
export const ORGANIZATION_TYPES = [
  "Economic Development Corporation",
  "City / County",
  "Workforce Organization",
  "College / University",
  "Nonprofit",
  "Chamber of Commerce",
  "Government Agency",
  "Other",
];
export const MODERNIZATION_OPTIONS = [
  "Customer service",
  "Phone / AI receptionist",
  "CRM",
  "Scheduling",
  "Workflow automation",
  "Website",
  "E-commerce",
  "Marketing",
  "Social media",
  "Employee productivity",
  "Data / reporting",
  "Other",
];
export const PARTNERSHIP_OPTIONS = [
  "Funding / Grant Partnership",
  "Business Recruitment",
  "Workforce Training",
  "Education",
  "Program Sponsorship",
  "Economic Development",
  "Community Outreach",
  "Other",
];

/** Where the executive concept sheet lives, relative to /public. */
export const CONCEPT_SHEET_PATH =
  "/central-texas-ai/Central_Texas_AI_Business_Modernization_Initiative_Temple_EDC.pdf";

/**
 * The details stored on the `form_submit` lead event, in display order, with
 * the label the admin shows. Keys not listed here are not displayed.
 */
export const DETAIL_LABELS: Record<InitiativeKind, [key: string, label: string][]> = {
  business: [
    ["business_name", "Business"],
    ["contact_name", "Contact"],
    ["city", "City"],
    ["zip", "ZIP"],
    ["industry", "Industry"],
    ["employee_count", "Employees"],
    ["ai_use", "Current AI use"],
    ["modernization", "Wants help with"],
    ["challenge", "Biggest challenge"],
    ["pilot_interest", "Pilot interest"],
  ],
  partner: [
    ["organization_name", "Organization"],
    ["contact_name", "Contact"],
    ["title", "Title"],
    ["organization_type", "Organization type"],
    ["city", "City"],
    ["website", "Website"],
    ["partnership_interest", "Partnership interests"],
    ["message", "Message"],
  ],
};
