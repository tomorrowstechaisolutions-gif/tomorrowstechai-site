/**
 * The proposal vocabulary: statuses, what may follow what, payment modes,
 * the ownership summary, and the package templates.
 *
 * A plain module on purpose. Server actions live in a `"use server"` file,
 * which may export nothing but async functions — so every constant both the
 * form and the action need has to live somewhere like this.
 *
 * Package content is IMPORTED from the campaign modules rather than retyped.
 * The scope lines on a proposal are then the same sentences the landing page
 * promised; two copies would eventually disagree, and the client would be
 * holding the one we did not update.
 */

import {
  INCLUDED, NOT_INCLUDED, OFFER_PRICE_CENTS, HOSTING_FROM_CENTS, CAMPAIGN_NAME,
} from "@/lib/campaign/config";
import {
  STARTER_INCLUDED, STARTER_NOT_INCLUDED, STARTER_YOU_PROVIDE,
  STARTER_PRICE_CENTS, STARTER_HOSTING, STARTER_TURNAROUND_DAYS,
} from "@/lib/campaign/starter";
import {
  PRO_INCLUDED, PRO_NOT_INCLUDED, PRO_PRICE_CENTS, PRO_HOSTING,
} from "@/lib/campaign/professional";
import {
  ECOM_INCLUDED, ECOM_NOT_INCLUDED, ECOM_PRICE_CENTS, ECOM_HOSTING,
} from "@/lib/campaign/ecommerce";

// ── Status ───────────────────────────────────────────────────────────

export const PROPOSAL_STATUSES = [
  "draft", "sent", "viewed", "accepted", "signed",
  "payment_pending", "paid", "declined", "expired",
  "cancelled", "converted",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  signed: "Signed",
  payment_pending: "Awaiting payment",
  paid: "Paid",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  converted: "Converted",
};

/** Reuses the `.cc-chip` tones already defined for the admin. */
export const STATUS_TONE: Record<ProposalStatus, string> = {
  draft: "t-muted",
  sent: "t-info",
  viewed: "t-info",
  accepted: "t-warn",
  signed: "t-warn",
  payment_pending: "t-warn",
  paid: "t-ok",
  declined: "t-risk",
  expired: "t-risk",
  cancelled: "t-muted",
  converted: "t-ok",
};

/**
 * What may follow what.
 *
 * The client only ever drives the middle of this: sent → viewed → accepted →
 * signed → payment_pending → paid. Everything else is an admin decision, and
 * an admin decision is still not a free-for-all — a paid proposal cannot go
 * back to draft, because the money is real and the document has been signed.
 *
 * `converted` is terminal: the project exists, and the proposal's job now is
 * to be the record of what was agreed.
 */
export const ALLOWED_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft:           ["sent", "cancelled"],
  sent:            ["viewed", "accepted", "declined", "expired", "cancelled", "draft"],
  viewed:          ["accepted", "declined", "expired", "cancelled", "sent"],
  accepted:        ["signed", "declined", "cancelled"],
  signed:          ["payment_pending", "paid", "converted", "cancelled"],
  payment_pending: ["paid", "signed", "cancelled"],
  paid:            ["converted"],
  declined:        ["draft", "sent", "cancelled"],
  expired:         ["draft", "sent", "cancelled"],
  cancelled:       ["draft"],
  converted:       [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses that mean the document is finished, one way or another. */
export const CLOSED_PROPOSAL_STATUSES: ProposalStatus[] =
  ["paid", "declined", "expired", "cancelled", "converted"];

/** Statuses where the client can still act on the public link. */
export const LIVE_PROPOSAL_STATUSES: ProposalStatus[] =
  ["sent", "viewed", "accepted", "signed", "payment_pending"];

// ── Payment ──────────────────────────────────────────────────────────

export const PAYMENT_MODES = ["deposit", "full", "invoice_later"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  deposit: "Deposit due at signature",
  full: "Full payment due at signature",
  invoice_later: "Invoice after launch — nothing due at signature",
};

export const PAYMENT_MODE_HELP: Record<PaymentMode, string> = {
  deposit:
    "The client pays the deposit when they sign; the balance is invoiced later. The project cannot be created until the deposit clears.",
  full:
    "The client pays the whole one-time amount when they sign. The project cannot be created until it clears.",
  invoice_later:
    "Signing is acceptance only. No card is asked for, and the project can be created as soon as the agreement is signed.",
};

/** What is actually due the moment they sign, in cents. */
export function amountDueAtSignature(p: {
  payment_mode: PaymentMode;
  total_cents: number;
  deposit_amount_cents: number;
}): number {
  if (p.payment_mode === "invoice_later") return 0;
  if (p.payment_mode === "full") return p.total_cents;
  return p.deposit_amount_cents;
}

// ── The four confirmations ───────────────────────────────────────────

/**
 * Every one is required. They are separate rather than a single "I agree"
 * because the ownership terms are the part a client is most likely to be
 * surprised by later, and a tick against that specific sentence is worth
 * considerably more than a tick against a paragraph of everything.
 */
export const ACCEPTANCE_CHECKS = [
  { key: "accepted_scope", label: "I have reviewed and agree to the Scope of Work." },
  { key: "accepted_pricing", label: "I understand the one-time project price and any recurring hosting/management fees." },
  { key: "accepted_ownership", label: "I understand the Ownership & Software License terms." },
  { key: "accepted_agreement", label: "I have reviewed and agree to the Website Development, Hosting & Software License Agreement." },
] as const;

export type AcceptanceKey = (typeof ACCEPTANCE_CHECKS)[number]["key"];

// ── Ownership at a glance ────────────────────────────────────────────

/**
 * The plain-language summary shown BEFORE the agreement, so the ownership
 * position is read rather than discovered. It restates Sections 4–7 and
 * Exhibit B; the agreement itself remains the operative text, and this says
 * so out loud rather than quietly replacing it.
 */
export const OWNERSHIP_SUMMARY = {
  clientOwns: {
    heading: "You own",
    items: [
      "The domain you purchase or already own",
      "Your branding and any logos you supply",
      "Images, copy and content you provide",
      "Your customer records and leads",
      "Your orders and inventory records",
      "Your business data generated through the site",
      "Any other materials you provided",
    ],
  },
  providerRetains: {
    heading: "Tomorrow's Tech AI retains ownership of",
    items: [
      "Reusable and proprietary code",
      "Templates, frameworks and reusable design systems",
      "The admin center and backend software",
      "CRM logic, pipelines and workflow engines",
      "Database architecture and schemas",
      "Automation systems and integrations",
      "AI components, prompts, agents and orchestration",
      "Internal tools, libraries and software architecture",
    ],
  },
  notIncluded: {
    heading: "Standard website pricing does not include",
    items: [
      "Full source-code ownership",
      "Ownership of proprietary backend systems",
      "Ownership of Tomorrow's Tech AI software or intellectual property",
    ],
  },
  licenceNote:
    "You receive a license to use the delivered website and software as defined in the Agreement. A full source-code, backend or IP buyout is a separate arrangement and is quoted separately.",
} as const;

// ── Package templates ────────────────────────────────────────────────

export type TemplateItem = {
  item_type:
    | "scope" | "deliverable" | "page" | "integration" | "addon"
    | "discount" | "recurring" | "exclusion"
    | "client_responsibility" | "provider_responsibility";
  title: string;
  description?: string | null;
  unit_price_cents?: number;
  is_billable?: boolean;
  is_optional?: boolean;
};

export type PackageTemplate = {
  key: string;
  name: string;
  /** What the proposal is called before anyone edits it. */
  defaultTitle: string;
  summary: string;
  oneTimeCents: number;
  recurringCents: number;
  /** Half the build, rounded to the dollar. 0 means no deposit by default. */
  depositCents: number;
  paymentMode: PaymentMode;
  turnaroundNote: string | null;
  revisionLimit: number | null;
  hostingNote: string;
  items: TemplateItem[];
};

/** The same sentence on every package, because the service is the same one. */
const HOSTING_NOTE =
  "Hosting and management covers managed hosting, SSL, backups, security updates, uptime monitoring and small content changes. New features or major additions are scoped and quoted separately before work begins.";

/** Half, to the nearest whole dollar. Never more than the total. */
function halfDeposit(cents: number): number {
  return Math.round(cents / 200) * 100;
}

const PROVIDER_RESPONSIBILITIES: TemplateItem[] = [
  { item_type: "provider_responsibility", title: "Design", description: "Layout, branding application and the visual design of every page in scope." },
  { item_type: "provider_responsibility", title: "Development", description: "Building the agreed pages and features on modern, maintained technology." },
  { item_type: "provider_responsibility", title: "Deployment", description: "Publishing the approved site to production hosting with SSL and the domain connected." },
  { item_type: "provider_responsibility", title: "Agreed integrations", description: "Configuring the third-party services listed in this proposal." },
  { item_type: "provider_responsibility", title: "Launch support", description: "Being on hand through go-live while the site meets real traffic." },
];

const CLIENT_RESPONSIBILITIES: TemplateItem[] = [
  { item_type: "client_responsibility", title: "Logo", description: "Whatever you have. If you have nothing, our Logo Studio can produce one." },
  { item_type: "client_responsibility", title: "Business information", description: "Name, address or service area, phone, email and hours." },
  { item_type: "client_responsibility", title: "Images", description: "Real photos of your work, your team and your premises." },
  { item_type: "client_responsibility", title: "Content", description: "What you do, who you do it for, and what you want to be called about." },
  { item_type: "client_responsibility", title: "Product information", description: "Names, prices, options, images and fulfillment details for anything being sold." },
  { item_type: "client_responsibility", title: "Approvals", description: "Timely review and written approval at each review round." },
  { item_type: "client_responsibility", title: "Third-party account access", description: "Access to the domain registrar, analytics, payment or other accounts the build needs." },
];

function fromIncluded(list: readonly { title: string; body: string }[]): TemplateItem[] {
  return list.map((entry) => ({
    item_type: "scope" as const,
    title: entry.title,
    description: entry.body,
  }));
}

function fromExclusions(list: readonly string[]): TemplateItem[] {
  return list.map((title) => ({ item_type: "exclusion" as const, title }));
}

export const PACKAGE_TEMPLATES: PackageTemplate[] = [
  {
    key: "starter_149",
    name: "Starter Website",
    defaultTitle: "Starter website build",
    summary:
      "A clean, fast three-page website that gives your business a credible home online and a working way for customers to contact you.",
    oneTimeCents: STARTER_PRICE_CENTS,
    recurringCents: STARTER_HOSTING * 100,
    depositCents: 0,
    paymentMode: "full",
    turnaroundNote: `${STARTER_TURNAROUND_DAYS} business days from the moment your content is submitted.`,
    revisionLimit: 1,
    hostingNote: HOSTING_NOTE,
    items: [
      ...fromIncluded(STARTER_INCLUDED),
      ...fromExclusions(STARTER_NOT_INCLUDED),
      ...STARTER_YOU_PROVIDE.map((entry) => ({
        item_type: "client_responsibility" as const,
        title: entry.title,
        description: entry.body,
      })),
      ...PROVIDER_RESPONSIBILITIES,
    ],
  },
  {
    key: "classic_399",
    name: "Classic Business Website",
    defaultTitle: "Business website build",
    summary:
      "A professional five-page website with lead capture, a starter CRM and online payments — everything a local business needs to be found, believed and contacted.",
    oneTimeCents: OFFER_PRICE_CENTS,
    recurringCents: HOSTING_FROM_CENTS,
    depositCents: halfDeposit(OFFER_PRICE_CENTS),
    paymentMode: "deposit",
    turnaroundNote: "7–14 days from the moment your content is received.",
    revisionLimit: 1,
    hostingNote: HOSTING_NOTE,
    items: [
      ...fromIncluded(INCLUDED),
      ...fromExclusions(NOT_INCLUDED),
      ...CLIENT_RESPONSIBILITIES,
      ...PROVIDER_RESPONSIBILITIES,
    ],
  },
  {
    key: "professional_699",
    name: "Professional Business Website",
    defaultTitle: "Professional website build",
    summary:
      "A custom-designed site of up to ten pages with multiple lead paths, conversion tracking and a CRM-ready workflow behind it.",
    oneTimeCents: PRO_PRICE_CENTS,
    recurringCents: PRO_HOSTING * 100,
    depositCents: halfDeposit(PRO_PRICE_CENTS),
    paymentMode: "deposit",
    turnaroundNote: null,
    revisionLimit: 3,
    hostingNote: HOSTING_NOTE,
    items: [
      ...fromIncluded(PRO_INCLUDED),
      ...fromExclusions(PRO_NOT_INCLUDED),
      ...CLIENT_RESPONSIBILITIES,
      ...PROVIDER_RESPONSIBILITIES,
    ],
  },
  {
    key: "ecommerce_999",
    name: "E-Commerce Website",
    defaultTitle: "E-commerce website build",
    summary:
      "A real online store: product catalog, cart, secure checkout, payments, shipping and tax configured for how you actually sell.",
    oneTimeCents: ECOM_PRICE_CENTS,
    recurringCents: ECOM_HOSTING * 100,
    depositCents: halfDeposit(ECOM_PRICE_CENTS),
    paymentMode: "deposit",
    turnaroundNote: null,
    revisionLimit: 3,
    hostingNote: HOSTING_NOTE,
    items: [
      ...fromIncluded(ECOM_INCLUDED),
      ...fromExclusions(ECOM_NOT_INCLUDED),
      ...CLIENT_RESPONSIBILITIES,
      ...PROVIDER_RESPONSIBILITIES,
    ],
  },
  {
    key: "custom",
    name: "Custom Proposal",
    defaultTitle: "Custom project",
    summary: "",
    oneTimeCents: 0,
    recurringCents: 0,
    depositCents: 0,
    paymentMode: "deposit",
    turnaroundNote: null,
    revisionLimit: null,
    hostingNote: HOSTING_NOTE,
    items: [...CLIENT_RESPONSIBILITIES, ...PROVIDER_RESPONSIBILITIES],
  },
];

export function templateByKey(key: string | null | undefined): PackageTemplate {
  return (
    PACKAGE_TEMPLATES.find((t) => t.key === key) ??
    PACKAGE_TEMPLATES[PACKAGE_TEMPLATES.length - 1]
  );
}

/** Shown on the builder so the $399 package is not mislabelled in the list. */
export const CAMPAIGN_PACKAGE_NAME = CAMPAIGN_NAME;

/** How long a proposal is good for unless the admin says otherwise. */
export const DEFAULT_VALID_DAYS = 30;

/**
 * The onboarding checklist seeded on conversion. Deliberately the same
 * subjects the Starter intake wizard already asks for, so a client who does
 * both is not asked twice in different words.
 */
export const ONBOARDING_CHECKLIST = [
  "Logo",
  "Business information",
  "Services",
  "Photos",
  "Team information",
  "Domain access",
  "Social links",
  "Contact information",
  "Legal / business info",
  "Product data",
  "Existing website",
  "Analytics accounts",
];
