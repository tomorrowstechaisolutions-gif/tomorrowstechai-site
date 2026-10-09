/** Hand-written row types for supabase/migrations/20261009150000_partner_center.sql. */

export type PartnerConnection = {
  id: string;
  partner_key: string;
  name: string;
  company_id: string | null;
  customer_id: string | null;
  website_id: string | null;
  api_base_url: string | null;
  api_key_env: string | null;
  status: "pending_configuration" | "active" | "paused" | "disabled";
  relationship: string[];
  our_share_pct: number;
  fee_basis: "processing_only" | "processing_and_direct" | "gross";
  settlement_method: "stripe_connect_on_sale" | "monthly_statement" | "manual";
  terms_notes: string | null;
  agreement_signed_on: string | null;
  last_sync_at: string | null;
  last_sync_ok: boolean | null;
  last_sync_error: string | null;
  last_sync_count: number | null;
  created_at: string;
  updated_at: string;
};

export type PartnerCampaignRef = { id: string; name?: string | null; status?: string | null };

export type PartnerWorkOrder = {
  id: string;
  partner_id: string;
  external_id: string;
  order_code: string | null;
  service: string | null;
  campaign_type: string | null;
  scope: string | null;
  partner_status: string | null;
  platforms: string[];
  posts_per_week: number | null;
  starts_on: string | null;
  ends_on: string | null;
  renews_on: string | null;
  external_author_id: string | null;
  author_name: string | null;
  external_book_id: string | null;
  book_title: string | null;
  brief: string | null;
  campaigns: PartnerCampaignRef[];
  job_id: string | null;
  first_seen_at: string;
  last_synced_at: string;
  removed_at: string | null;
};

export type PartnerSettlement = {
  id: string;
  partner_id: string;
  work_order_id: string | null;
  external_ref: string;
  source: "stripe_connect" | "partner_feed" | "manual";
  description: string | null;
  currency: string;
  sale_cents: number;
  fee_cents: number;
  net_cents: number;
  share_pct: number;
  our_share_cents: number;
  partner_share_cents: number;
  sold_at: string;
  status: "pending" | "paid" | "reversed" | "partially_reversed";
  paid_at: string | null;
  reversed_cents: number;
  revenue_event_id: string | null;
  notes: string | null;
  created_at: string;
};
