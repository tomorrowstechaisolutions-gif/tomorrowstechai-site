/**
 * Hand-written row types for the proposal tables.
 * Kept in sync with supabase/migrations/0016_proposals.sql.
 */

import type { PaymentMode, ProposalStatus } from "./config";

export type AgreementSection = {
  n: string;
  heading: string;
  paragraphs: string[];
  bullets: string[];
};

export type OwnershipRow = {
  asset: string;
  owner: string;
  treatment: string;
};

export type AgreementVersion = {
  id: string;
  version: string;
  title: string;
  intro: string | null;
  sections: AgreementSection[];
  ownership_rows: OwnershipRow[];
  status: "draft" | "published" | "archived";
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalItemType =
  | "scope" | "deliverable" | "page" | "integration" | "addon"
  | "discount" | "recurring" | "exclusion"
  | "client_responsibility" | "provider_responsibility";

export type ProposalItem = {
  id: string;
  proposal_id: string;
  item_type: ProposalItemType;
  title: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  is_optional: boolean;
  is_billable: boolean;
  sort_order: number;
  created_at: string;
};

export type ProposalSectionType =
  | "executive_summary" | "scope" | "deliverables" | "timeline"
  | "pricing" | "hosting" | "ownership" | "client_responsibilities"
  | "provider_responsibilities" | "exclusions" | "agreement" | "custom";

export type ProposalSection = {
  id: string;
  proposal_id: string;
  section_type: ProposalSectionType;
  title: string;
  content: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
};

export type ProposalSignature = {
  id: string;
  proposal_id: string;
  signer_name: string;
  signer_email: string;
  signer_title: string | null;
  signature_type: "typed" | "drawn";
  signature_text: string | null;
  signature_data: string | null;
  accepted_scope: boolean;
  accepted_pricing: boolean;
  accepted_ownership: boolean;
  accepted_agreement: boolean;
  agreement_version: string;
  agreement_version_id: string | null;
  document_hash: string | null;
  document_path: string | null;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
  created_at: string;
};

export type ProposalEventType =
  | "created" | "edited" | "sent" | "resent" | "viewed" | "accepted"
  | "declined" | "signed" | "payment_started" | "paid" | "expired"
  | "cancelled" | "converted_to_project" | "revised" | "duplicated"
  | "reminder_sent" | "note";

export type ProposalEvent = {
  id: string;
  proposal_id: string;
  event_type: ProposalEventType;
  body: string | null;
  actor: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

export type Proposal = {
  id: string;
  proposal_number: string;

  lead_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  customer_id: string | null;
  job_id: string | null;

  kind: "proposal" | "change_order";
  supersedes_id: string | null;

  created_by: string | null;
  owner: string | null;
  status: ProposalStatus;

  title: string;
  summary: string | null;

  package_key: string | null;
  package_name: string | null;

  client_business_name: string | null;
  client_contact_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_title: string | null;
  client_billing_address: string | null;

  currency: string;
  subtotal_cents: number;
  discount_amount_cents: number;
  one_time_price_cents: number;
  total_cents: number;
  recurring_price_cents: number;
  recurring_interval: "month" | "year";
  deposit_amount_cents: number;
  payment_mode: PaymentMode;

  turnaround_note: string | null;
  revision_limit: number | null;
  hosting_note: string | null;

  valid_until: string | null;
  public_token: string;
  agreement_version_id: string | null;

  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  signed_at: string | null;
  paid_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  converted_at: string | null;
  locked_at: string | null;

  signed_document_path: string | null;
  signed_document_hash: string | null;

  invoice_id: string | null;
  stripe_session_id: string | null;
  amount_paid_cents: number;

  notes_internal: string | null;

  created_at: string;
  updated_at: string;
};

/** A proposal with everything needed to render it, admin or public. */
export type FullProposal = {
  proposal: Proposal;
  items: ProposalItem[];
  sections: ProposalSection[];
  agreement: AgreementVersion | null;
  signature: ProposalSignature | null;
};
