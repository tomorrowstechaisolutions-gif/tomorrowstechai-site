/**
 * The Email Marketing vocabulary, in one place.
 *
 * No "server-only" here on purpose: the composer, the filter bar and the
 * audience builder are client components and every one of them needs these
 * labels. Anything that touches Supabase or Resend lives elsewhere.
 *
 * These strings are the SAME strings the database check constraints allow.
 * If a value can be written it has a label here, and if it has a label here
 * it can be written.
 */

/* ── Campaigns ─────────────────────────────────────────────────────── */

export type CampaignType =
  | "newsletter" | "promotion" | "sales_outreach" | "lead_nurture"
  | "announcement" | "event" | "product_launch" | "follow_up"
  | "re_engagement" | "custom";

export type CampaignStatus =
  | "draft" | "waiting_approval" | "approved" | "scheduled"
  | "sending" | "sent" | "paused" | "failed" | "archived";

export type ApprovalMode = "none" | "internal" | "client";

export type ApprovalStatus =
  | "not_required" | "waiting" | "approved" | "changes_requested" | "rejected";

export type EmailTone = "default" | "success" | "alert";

/* ── Recipients and events ─────────────────────────────────────────── */

export type RecipientStatus =
  | "pending" | "sending" | "sent" | "delivered"
  | "bounced" | "complained" | "failed" | "skipped";

export type SkipReason =
  | "suppressed" | "unsubscribed" | "hard_bounce" | "complaint"
  | "no_consent" | "do_not_contact" | "invalid_email" | "duplicate";

export type EventType =
  | "sent" | "delivered" | "opened" | "clicked" | "bounced"
  | "complained" | "unsubscribed" | "failed" | "delivery_delayed";

export type SuppressionReason =
  | "unsubscribed" | "hard_bounce" | "complaint"
  | "manual" | "invalid" | "do_not_contact";

/* ── Audiences ─────────────────────────────────────────────────────── */

export type AudienceType =
  | "dynamic_segment" | "static_list" | "imported_list" | "crm_segment";

export type AudienceSource = "leads" | "customers" | "members";

/* ── Templates and sequences ───────────────────────────────────────── */

export type TemplateCategory =
  | "welcome" | "newsletter" | "promotion" | "sales_followup" | "appointment"
  | "proposal_followup" | "re_engagement" | "client_update"
  | "product_launch" | "event" | "other";

export type SequenceStatus = "draft" | "active" | "paused" | "archived";

export type EnrollmentTrigger =
  | "manual" | "lead_created" | "form_submitted" | "lead_tagged"
  | "pipeline_stage_changed" | "proposal_sent" | "proposal_not_accepted"
  | "meeting_completed" | "client_onboarded" | "audience_imported";

export type EnrollmentStatus = "active" | "paused" | "completed" | "exited" | "failed";

export type ExitReason =
  | "replied" | "meeting_booked" | "proposal_accepted" | "converted"
  | "unsubscribed" | "hard_bounce" | "complaint" | "manual"
  | "goal_completed" | "suppressed" | "sequence_archived";

export type DelayUnit = "minutes" | "hours" | "days" | "weeks";

export type StepCondition =
  | "always" | "opened_previous" | "clicked_previous"
  | "not_opened_previous" | "not_clicked_previous" | "lead_stage" | "has_tag";

/* ── Sending health ────────────────────────────────────────────────── */

/**
 * Four states, and Unknown is a real one — the one this module defaults to.
 *
 * §35 is emphatic and so is the schema: no authentication status is ever
 * assumed. A domain nobody has checked is Unknown, not Healthy. A green SPF
 * badge that nobody earned is how mail silently starts going to spam.
 */
export type HealthState = "healthy" | "warning" | "critical" | "unknown";

export type DnsStatus = "verified" | "pending" | "failed" | "unknown";
export type DmarcStatus = "configured" | "pending" | "missing" | "unknown";
export type ProviderStatus = "connected" | "not_connected" | "error" | "unknown";

/* ── Content blocks ────────────────────────────────────────────────── */

/**
 * A campaign body is an ARRAY OF TYPED BLOCKS, not a slab of HTML.
 *
 * That choice is what makes everything else possible: the pre-send checks
 * can find a missing CTA, the personalization scanner can find a broken
 * token, and the renderer can produce email-safe table markup through the
 * builders that already exist in lib/email/brand.ts. A raw-HTML field would
 * be quicker to build and would make every one of those impossible.
 *
 * `html` exists for the genuinely custom case and is escaped-by-exception:
 * it is only rendered for an admin-authored template, never for anything a
 * client or an import supplied.
 */
export type BlockType =
  | "heading" | "text" | "button" | "image" | "divider"
  | "spacer" | "bullets" | "quote" | "fineprint" | "signoff" | "html";

export type EmailBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string; dim?: boolean }
  | { type: "button"; label: string; href: string }
  | { type: "image"; src: string; alt: string; href?: string }
  | { type: "divider" }
  | { type: "spacer"; size?: number }
  | { type: "bullets"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "fineprint"; text: string }
  | { type: "signoff" }
  | { type: "html"; html: string };

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  text: "Text",
  button: "Button",
  image: "Image",
  divider: "Divider",
  spacer: "Spacer",
  bullets: "Bullet list",
  quote: "Quote",
  fineprint: "Fine print",
  signoff: "Sign-off",
  html: "Custom HTML",
};

/* ── Personalization ───────────────────────────────────────────────── */

/**
 * The ONLY tokens that resolve. Anything else in a body is a broken token
 * and the pre-send check refuses to let it go out silently — §13.
 *
 * Every one has a fallback, because "Hi ," is worse than "Hi there," and a
 * blank company name in a subject line is how a send gets remembered.
 */
export const PERSONALIZATION_TOKENS: {
  token: string;
  label: string;
  fallback: string;
  description: string;
}[] = [
  { token: "first_name",   label: "First name",   fallback: "there",     description: "The recipient's first name." },
  { token: "last_name",    label: "Last name",    fallback: "",          description: "The recipient's last name." },
  { token: "full_name",    label: "Full name",    fallback: "there",     description: "First and last together." },
  { token: "company_name", label: "Company",      fallback: "your business", description: "The recipient's business." },
  { token: "client_name",  label: "Client",       fallback: "our client",   description: "The client this campaign belongs to." },
  { token: "sales_rep",    label: "Sales rep",    fallback: "John",      description: "The campaign owner." },
  { token: "service_name", label: "Service",      fallback: "our services", description: "The linked service." },
  { token: "email",        label: "Email",        fallback: "",          description: "The recipient's own address." },
];

export const TOKEN_NAMES: string[] = PERSONALIZATION_TOKENS.map((t) => t.token);

/** Finds every {{token}} in a string, valid or not. */
export function findTokens(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
}

/** The tokens in this text that will NOT resolve. */
export function unknownTokens(text: string): string[] {
  return [...new Set(findTokens(text))].filter((name) => !TOKEN_NAMES.includes(name));
}

/* ── Labels ────────────────────────────────────────────────────────── */

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  newsletter: "Newsletter",
  promotion: "Promotion",
  sales_outreach: "Sales Outreach",
  lead_nurture: "Lead Nurture",
  announcement: "Announcement",
  event: "Event",
  product_launch: "Product Launch",
  follow_up: "Follow-Up",
  re_engagement: "Re-Engagement",
  custom: "Custom",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  waiting_approval: "Waiting Approval",
  approved: "Approved",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  paused: "Paused",
  failed: "Failed",
  archived: "Archived",
};

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
  none: "No approval required",
  internal: "Internal approval required",
  client: "Client approval required",
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  not_required: "Not required",
  waiting: "Waiting",
  approved: "Approved",
  changes_requested: "Changes requested",
  rejected: "Rejected",
};

export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  pending: "Pending",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Complained",
  failed: "Failed",
  skipped: "Not sent",
};

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  suppressed: "On the suppression list",
  unsubscribed: "Unsubscribed",
  hard_bounce: "Previously hard bounced",
  complaint: "Previously reported spam",
  no_consent: "No marketing consent recorded",
  do_not_contact: "Marked do not contact",
  invalid_email: "Not a valid address",
  duplicate: "Already in this send",
};

export const SUPPRESSION_REASON_LABELS: Record<SuppressionReason, string> = {
  unsubscribed: "Unsubscribed",
  hard_bounce: "Hard bounce",
  complaint: "Spam complaint",
  manual: "Added by hand",
  invalid: "Invalid address",
  do_not_contact: "Do not contact",
};

export const AUDIENCE_TYPE_LABELS: Record<AudienceType, string> = {
  dynamic_segment: "Dynamic Segment",
  static_list: "Static List",
  imported_list: "Imported List",
  crm_segment: "CRM Segment",
};

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  welcome: "Welcome",
  newsletter: "Newsletter",
  promotion: "Promotion",
  sales_followup: "Sales Follow-Up",
  appointment: "Appointment Reminder",
  proposal_followup: "Proposal Follow-Up",
  re_engagement: "Re-Engagement",
  client_update: "Client Update",
  product_launch: "Product Launch",
  event: "Event Announcement",
  other: "Other",
};

export const SEQUENCE_STATUS_LABELS: Record<SequenceStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export const ENROLLMENT_TRIGGER_LABELS: Record<EnrollmentTrigger, string> = {
  manual: "Manual enrollment",
  lead_created: "Lead created",
  form_submitted: "Form submitted",
  lead_tagged: "Lead tagged",
  pipeline_stage_changed: "Pipeline stage changed",
  proposal_sent: "Proposal sent",
  proposal_not_accepted: "Proposal not accepted",
  meeting_completed: "Meeting completed",
  client_onboarded: "Client onboarded",
  audience_imported: "Audience imported",
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  exited: "Exited",
  failed: "Failed",
};

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  replied: "Replied",
  meeting_booked: "Meeting booked",
  proposal_accepted: "Proposal accepted",
  converted: "Converted",
  unsubscribed: "Unsubscribed",
  hard_bounce: "Hard bounce",
  complaint: "Spam complaint",
  manual: "Removed by hand",
  goal_completed: "Goal completed",
  suppressed: "Suppressed",
  sequence_archived: "Sequence archived",
};

export const DELAY_UNIT_LABELS: Record<DelayUnit, string> = {
  minutes: "minutes",
  hours: "hours",
  days: "days",
  weeks: "weeks",
};

export const STEP_CONDITION_LABELS: Record<StepCondition, string> = {
  always: "Always send",
  opened_previous: "Opened the previous email",
  clicked_previous: "Clicked the previous email",
  not_opened_previous: "Did not open the previous email",
  not_clicked_previous: "Did not click the previous email",
  lead_stage: "Lead is at stage",
  has_tag: "Lead has tag",
};

export const HEALTH_LABELS: Record<HealthState, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

export const DNS_LABELS: Record<DnsStatus, string> = {
  verified: "Verified",
  pending: "Pending",
  failed: "Failed",
  unknown: "Not checked",
};

export const DMARC_LABELS: Record<DmarcStatus, string> = {
  configured: "Configured",
  pending: "Pending",
  missing: "Missing",
  unknown: "Not checked",
};

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  error: "Error",
  unknown: "Not checked",
};

/* ── Tones ─────────────────────────────────────────────────────────── */
/* The chip classes already defined in globals.css — nothing new is added
   to the design system here. */

export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, string> = {
  draft: "t-muted",
  waiting_approval: "t-warn",
  approved: "t-info",
  scheduled: "t-info",
  sending: "t-warm",
  sent: "t-ok",
  paused: "t-muted",
  failed: "t-risk",
  archived: "t-muted",
};

export const RECIPIENT_STATUS_TONE: Record<RecipientStatus, string> = {
  pending: "t-muted",
  sending: "t-info",
  sent: "t-info",
  delivered: "t-ok",
  bounced: "t-risk",
  complained: "t-risk",
  failed: "t-risk",
  skipped: "t-muted",
};

export const HEALTH_TONE: Record<HealthState, string> = {
  healthy: "t-ok",
  warning: "t-warn",
  critical: "t-risk",
  unknown: "t-muted",
};

export const DNS_TONE: Record<DnsStatus, string> = {
  verified: "t-ok",
  pending: "t-warn",
  failed: "t-risk",
  unknown: "t-muted",
};

export const DMARC_TONE: Record<DmarcStatus, string> = {
  configured: "t-ok",
  pending: "t-warn",
  missing: "t-warn",
  unknown: "t-muted",
};

export const PROVIDER_TONE: Record<ProviderStatus, string> = {
  connected: "t-ok",
  not_connected: "t-muted",
  error: "t-risk",
  unknown: "t-muted",
};

export const SEQUENCE_STATUS_TONE: Record<SequenceStatus, string> = {
  draft: "t-muted",
  active: "t-ok",
  paused: "t-warn",
  archived: "t-muted",
};

export const APPROVAL_STATUS_TONE: Record<ApprovalStatus, string> = {
  not_required: "t-muted",
  waiting: "t-warn",
  approved: "t-ok",
  changes_requested: "t-warn",
  rejected: "t-risk",
};

/* ── Groupings the screens agree on ────────────────────────────────── */

/** Statuses the "Active Campaigns" KPI counts. §2. */
export const ACTIVE_CAMPAIGN_STATUS: CampaignStatus[] = [
  "waiting_approval", "approved", "scheduled", "sending",
];

/** Statuses that mean this campaign is finished with, one way or another. */
export const TERMINAL_CAMPAIGN_STATUS: CampaignStatus[] = ["sent", "failed", "archived"];

/** Recipient statuses that count as "we actually attempted a send". */
export const ATTEMPTED_STATUS: RecipientStatus[] = [
  "sent", "delivered", "bounced", "complained",
];

export const CAMPAIGN_TYPE_ORDER: CampaignType[] = [
  "newsletter", "promotion", "sales_outreach", "lead_nurture", "announcement",
  "event", "product_launch", "follow_up", "re_engagement", "custom",
];

export const CAMPAIGN_STATUS_ORDER: CampaignStatus[] = [
  "draft", "waiting_approval", "approved", "scheduled",
  "sending", "sent", "paused", "failed", "archived",
];

export const AUDIENCE_TYPE_ORDER: AudienceType[] = [
  "dynamic_segment", "static_list", "imported_list", "crm_segment",
];

export const TEMPLATE_CATEGORY_ORDER: TemplateCategory[] = [
  "welcome", "newsletter", "promotion", "sales_followup", "appointment",
  "proposal_followup", "re_engagement", "client_update", "product_launch",
  "event", "other",
];

export const DELAY_UNIT_ORDER: DelayUnit[] = ["minutes", "hours", "days", "weeks"];

export const STEP_CONDITION_ORDER: StepCondition[] = [
  "always", "opened_previous", "clicked_previous",
  "not_opened_previous", "not_clicked_previous", "lead_stage", "has_tag",
];

export const ENROLLMENT_TRIGGER_ORDER: EnrollmentTrigger[] = [
  "manual", "lead_created", "form_submitted", "lead_tagged",
  "pipeline_stage_changed", "proposal_sent", "proposal_not_accepted",
  "meeting_completed", "client_onboarded", "audience_imported",
];

/**
 * Timezones offered in the scheduler.
 *
 * A short list of the ones this business actually operates in, rather than
 * the full IANA database in a select — and the default is Central, because
 * that is where the office is and a campaign scheduled in the wrong zone
 * goes out in the middle of somebody's night.
 */
export const TIMEZONE_OPTIONS = [
  { value: "America/Chicago", label: "Central (America/Chicago)" },
  { value: "America/New_York", label: "Eastern (America/New_York)" },
  { value: "America/Denver", label: "Mountain (America/Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (America/Los_Angeles)" },
  { value: "UTC", label: "UTC" },
];

/* ── Small shared helpers ──────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

/**
 * Deliberately permissive, because the job here is to catch typos and
 * obvious junk, not to adjudicate RFC 5322. Anything that survives this
 * still has to survive the provider.
 */
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
export const isEmail = (value: string): boolean => EMAIL.test(value.trim());

/** Lowercased and trimmed. The one form an address is compared in. */
export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export function slugify(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** "2 days", "1 hour" — the delay as somebody typed it, read back. */
export function delayLabel(amount: number, unit: DelayUnit): string {
  if (amount === 0) return "immediately";
  const word = amount === 1 ? DELAY_UNIT_LABELS[unit].replace(/s$/, "") : DELAY_UNIT_LABELS[unit];
  return `${amount} ${word}`;
}

/** A delay in milliseconds, for working out when a step is due. */
export function delayMs(amount: number, unit: DelayUnit): number {
  const per: Record<DelayUnit, number> = {
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
    weeks: 604_800_000,
  };
  return Math.max(0, amount) * per[unit];
}

/**
 * A rate, or null when the denominator is zero.
 *
 * This is the single most important helper in the module. An open rate of
 * "0%" when nothing was sent is a lie; the honest answer is that there
 * isn't one, and every screen prints a dash for null.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}
