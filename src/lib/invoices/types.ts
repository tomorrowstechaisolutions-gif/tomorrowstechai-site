/**
 * Hand-written row types for the invoice tables.
 * Kept in sync with supabase/migrations/0004_invoices_and_jobs.sql (the
 * original payment-link columns) and 0023_invoice_documents.sql (everything
 * that turned it into a document).
 */

import type { InvoiceItemKind, InvoiceSource, InvoiceStatus, PaymentMethod } from "./config";

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  item_kind: InvoiceItemKind;
  title: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  sort_order: number;
  created_at: string;
};

export type InvoicePayment = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  paid_on: string;
  note: string | null;
  recorded_by: string | null;
  stripe_payment_intent: string | null;
  created_at: string;
};

export type InvoiceEventType =
  | "created" | "edited" | "sent" | "resent" | "link_copied" | "viewed"
  | "payment_started" | "payment_recorded" | "paid" | "reminder_sent"
  | "voided" | "refunded" | "note";

export type InvoiceEvent = {
  id: string;
  invoice_id: string;
  event_type: InvoiceEventType;
  body: string | null;
  actor: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  source: InvoiceSource;
  status: InvoiceStatus;

  lead_id: string | null;
  customer_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  proposal_id: string | null;
  job_id: string | null;
  catalog_item_id: string | null;

  created_by: string | null;
  owner: string | null;

  title: string;
  description: string | null;

  client_business_name: string | null;
  client_contact_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_billing_address: string | null;

  issue_date: string | null;
  due_date: string | null;
  payment_terms: string | null;

  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  recurring_cents: number;
  recurring_interval: "month" | "year";
  recurring_starts_on: string | null;
  amount_paid_cents: number;

  /** The 0004 columns. Still written by the checkout and upsell routes. */
  launch_cents: number;
  hosting_cents: number;
  amount_cents: number;
  kind: string;
  billing: "one_time" | "monthly";

  terms: string | null;
  footer_note: string | null;
  notes: string | null;
  notes_internal: string | null;

  public_token: string;
  checkout_url: string | null;
  receipt_url: string | null;

  stripe_session_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent: string | null;

  sent_method: "email" | "manual" | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  paid_at: string | null;
  expires_at: string | null;
  voided_at: string | null;
  cancelled_reason: string | null;

  created_at: string;
  updated_at: string;
};

/** An invoice with everything needed to render it, admin or client. */
export type FullInvoice = {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: InvoicePayment[];
};
