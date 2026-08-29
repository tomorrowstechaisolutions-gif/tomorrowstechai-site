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
};
