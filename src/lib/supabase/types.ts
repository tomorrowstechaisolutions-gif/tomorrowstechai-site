import type { JobStage as ClassicJobStage } from "@/lib/jobs/config";
import type { StarterStage } from "@/lib/intake/config";

/**
 * A job's stage depends on its package: the $399 Classic runs the stages in
 * lib/jobs/config, the $149 Starter the ones in lib/intake/config. One column
 * holds both, so the type is the union and the check constraint in migration
 * 0015 is what actually keeps a Starter stage off a Classic job.
 */
export type JobStage = ClassicJobStage | StarterStage;
/**
 * Hand-written row types for the campaign CRM tables.
 * Kept in sync with supabase/migrations/0001_business_launch.sql.
 */

export const LEAD_STATUSES = [
  "New",
  "Contact Attempted",
  "Contacted",
  "Qualified",
  "Demo Scheduled",
  "Proposal/Checkout Sent",
  "Won",
  "Lost",
  "Follow Up Later",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses that stop automated sales follow-up. */
export const CLOSED_STATUSES: LeadStatus[] = ["Won", "Lost"];

export type ScoreReason = { label: string; points: number };

export type Lead = {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  business_name: string | null;
  business_type: string | null;
  current_website: "yes" | "no" | null;
  website_url: string | null;
  services_interested: string[];
  timeline: string | null;
  source: string;
  campaign: string | null;
  adset: string | null;
  ad: string | null;
  placement: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  fbp: string | null;
  fbc: string | null;
  gclid: string | null;
  landing_page: string | null;
  referrer: string | null;
  meta_leadgen_id: string | null;
  meta_form_id: string | null;
  meta_page_id: string | null;
  lead_status: LeadStatus;
  lead_score: number;
  lead_score_reasons: ScoreReason[];
  assigned_to: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  email_consent: boolean;
  sms_consent: boolean;
  consent_text: string | null;
  consent_at: string | null;
  unsubscribed_at: string | null;
  do_not_contact: boolean;
  ip_address: string | null;
  user_agent: string | null;
  submission_count: number;
};

export type LeadEvent = {
  id: string;
  lead_id: string;
  created_at: string;
  type:
    | "note"
    | "status_change"
    | "email_sent"
    | "email_failed"
    | "call"
    | "sms"
    | "form_submit"
    | "followup_sent"
    | "appointment"
    | "revenue"
    | "system"
    | "duplicate_merge";
  body: string | null;
  meta: Record<string, unknown>;
  actor: string;
};

export type CampaignSpend = {
  id: string;
  date: string;
  campaign: string;
  /** "" when the row isn't broken out by this dimension. Never null — the
   *  unique upsert key spans these four columns. */
  adset: string;
  ad: string;
  placement: string;
  device: string;
  spend_cents: number;
  impressions: number;
  reach: number;
  clicks: number;
  landing_page_views: number;
  source: "manual" | "meta_api";
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  lead_id: string | null;
  scheduled_at: string | null;
  status: "scheduled" | "completed" | "no_show" | "cancelled";
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  lead_id: string | null;
  name: string | null;
  business_name: string | null;
  email: string;
  phone: string | null;
  status: "active" | "paused" | "churned";
  won_at: string;
  churned_at: string | null;
  mrr_cents: number;
  notes: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export const REVENUE_CATEGORIES = [
  "launch_package",
  "hosting",
  "crm",
  "ai_automation",
  "custom_app",
  "ecommerce",
  "dashboard",
  "social",
  "marketing",
  "development",
  "other",
] as const;

export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

export type RevenueEvent = {
  id: string;
  customer_id: string | null;
  lead_id: string | null;
  kind: "initial" | "recurring" | "upsell";
  category: RevenueCategory;
  description: string | null;
  amount_cents: number;
  currency: string;
  campaign: string | null;
  occurred_at: string;
  created_at: string;
  /** Stripe's id for the thing that produced this row. Unique — a webhook
   *  replay updates nothing instead of booking the money twice. Null for
   *  rows a human entered in the admin. */
  external_id: string | null;
};

export const BILLING_PERIODS = ["one_time", "monthly"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/**
 * Something you can sell on top of the $399 package.
 *
 * `from_cents` is a reference price for the catalog screen only. The amount
 * actually charged is typed when the link is sent, because custom work is
 * quoted per job — so a stale catalog price can never reach a customer.
 */
export type CatalogItem = {
  id: string;
  name: string;
  category: RevenueCategory;
  description: string | null;
  billing: BillingPeriod;
  from_cents: number;
  active: boolean;
  position: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "paid",
  "expired",
  "void",
  "refunded",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type Invoice = {
  id: string;
  /** 'launch' uses launch_cents + hosting_cents; 'upsell' uses amount_cents. */
  kind: "launch" | "upsell";
  lead_id: string | null;
  customer_id: string | null;
  catalog_item_id: string | null;
  amount_cents: number;
  billing: BillingPeriod;
  description: string | null;
  stripe_session_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent: string | null;
  launch_cents: number;
  hosting_cents: number;
  currency: string;
  status: InvoiceStatus;
  checkout_url: string | null;
  receipt_url: string | null;
  sent_at: string;
  paid_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: string;
  customer_id: string | null;
  lead_id: string | null;
  invoice_id: string | null;
  title: string;
  business_name: string | null;
  stage: JobStage;
  package: string;
  project_type: string;
  value_cents: number;
  owner: string | null;
  next_milestone: string | null;
  engagement_status: "pre_contract" | "contracted" | "awaiting_payment" | "paid" | "cancelled";
  pricing_model: "standard" | "custom" | "founding_client" | "portfolio" | "discounted" | "pro_bono";
  recurring_value_cents: number;
  estimated_market_value_cents: number | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  payment_timing: string | null;
  pricing_note: string | null;
  scope_baseline: string | null;
  scope_expansion: string | null;
  promised_days: number;
  due_at: string | null;
  started_at: string;
  launched_at: string | null;
  completed_at: string | null;
  site_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type JobTask = {
  id: string;
  job_id: string;
  stage: string;
  label: string;
  position: number;
  done: boolean;
  done_at: string | null;
  created_at: string;
};

export type JobEvent = {
  id: string;
  job_id: string;
  kind: "note" | "stage_change" | "task" | "payment" | "system";
  body: string | null;
  from_stage: string | null;
  to_stage: string | null;
  actor: string | null;
  created_at: string;
};

export type AdCreative = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  campaign: string;
  adset: string;
  status: "draft" | "ready" | "live" | "paused" | "archived";
  platform: "meta" | "google" | "other";
  format: "feed_4x5" | "feed_1x1" | "story_9x16" | "reel_9x16" | "other";
  primary_text: string;
  headline: string;
  description: string;
  cta_label: string;
  destination_path: string;
  image_url: string | null;
  image_note: string | null;
  audience_note: string | null;
  notes: string | null;
  parent_id: string | null;
  generated_by: "human" | "ai";
  brief: string | null;
  first_run_at: string | null;
  retired_at: string | null;
};

/* ───────────────────────────────────────────────────────────────────────
   Command Center — 0007_command_center.sql
   ─────────────────────────────────────────────────────────────────────── */

/**
 * A job's business category. `jobs` is the project record for the whole
 * company now, not only the $399 package — see the migration note on why no
 * separate `projects` table exists.
 */
export const PROJECT_TYPES = [
  "website",
  "app",
  "ai_system",
  "crm",
  "automation",
  "branding",
  "ecommerce",
  "saas",
  "custom_software",
  "consulting",
  "other",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  website: "Website",
  app: "App",
  ai_system: "AI System",
  crm: "CRM",
  automation: "Automation",
  branding: "Branding",
  ecommerce: "Ecommerce",
  saas: "SaaS",
  custom_software: "Custom Software",
  consulting: "Consulting",
  other: "Other",
};

export const TASK_KINDS = [
  "task",
  "followup",
  "meeting",
  "callback",
  "deadline",
  "invoice",
  "content",
  "other",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];
export type Priority = "low" | "medium" | "high" | "critical";

export type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  kind: TaskKind;
  priority: Priority;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  owner: string | null;
  lead_id: string | null;
  job_id: string | null;
  customer_id: string | null;
  invoice_id: string | null;
  source: "manual" | "ai" | "system";
  created_at: string;
  updated_at: string;
};

export const INSIGHT_KINDS = [
  "opportunity",
  "action",
  "marketing",
  "revenue",
  "risk",
  "system",
] as const;

export type InsightKind = (typeof INSIGHT_KINDS)[number];

export type AiInsight = {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  severity: Priority;
  href: string | null;
  metric: Record<string, unknown>;
  /** 'rule' rows are computed per request and never stored. */
  generated_by: "rule" | "ai";
  model: string | null;
  status: "new" | "seen" | "dismissed";
  valid_until: string | null;
  created_at: string;
};

export const AI_ACTION_KINDS = [
  "send_email",
  "send_sms",
  "publish_social",
  "create_campaign",
  "change_campaign",
  "change_budget",
  "update_lead",
  "update_project",
  "create_task",
  "draft_proposal",
  "delete_record",
  "other",
] as const;

export type AiActionKind = (typeof AI_ACTION_KINDS)[number];

/**
 * A proposal, not a deed. Nothing consequential happens until an admin
 * approves — the database itself refuses an 'approved' row with no
 * reviewed_by.
 */
export type AiAction = {
  id: string;
  kind: AiActionKind;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  target_table: string | null;
  target_id: string | null;
  status: "proposed" | "approved" | "rejected" | "executed" | "failed" | "expired";
  risk: "low" | "medium" | "high";
  proposed_by: "ai" | "rule" | "human";
  model: string | null;
  rationale: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export const SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "google_business",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_business: "Google Business",
};

export type SocialAccount = {
  id: string;
  platform: SocialPlatform;
  handle: string | null;
  display_name: string | null;
  external_id: string | null;
  connected: boolean;
  status: "connected" | "expired" | "disconnected" | "error";
  /** null means never synced — rendered as "—", never as 0. */
  followers: number | null;
  reach_30d: number | null;
  engagement_30d: number | null;
  clicks_30d: number | null;
  leads_30d: number | null;
  stats_updated_at: string | null;
  token_expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SocialPost = {
  id: string;
  account_id: string | null;
  platform: SocialPlatform;
  body: string;
  media_url: string | null;
  link_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: "draft" | "needs_approval" | "scheduled" | "published" | "failed";
  external_id: string | null;
  external_url: string | null;
  campaign: string | null;
  generated_by: "human" | "ai";
  ai_action_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export const EXPENSE_CATEGORIES = [
  "software",
  "contractor",
  "hardware",
  "hosting",
  "fees",
  "marketing",
  "travel",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Ad spend is NOT here — it lives in campaign_spend and is added on top. */
export type Expense = {
  id: string;
  occurred_at: string;
  category: ExpenseCategory;
  vendor: string | null;
  description: string | null;
  amount_cents: number;
  recurring: boolean;
  notes: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};
