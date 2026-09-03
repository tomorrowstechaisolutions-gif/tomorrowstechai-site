import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOSED_INVOICE_STATUSES, type InvoiceSource, type InvoiceStatus } from "./config";
import { daysOverdue, isOverdue, outstandingCents } from "./pricing";
import type { Invoice, InvoiceEvent } from "./types";

/**
 * The admin's read side.
 *
 * Everything here takes the request-scoped Supabase client, so it runs as the
 * signed-in admin and RLS applies. The service role never appears in this
 * file — the only code that needs it is the token flow in service.ts.
 */

export type InvoiceListRow = {
  id: string;
  number: string;
  title: string;
  status: InvoiceStatus;
  source: InvoiceSource;
  /** Past its due date with money still on it. Derived, never stored. */
  overdue: boolean;
  daysLate: number;
  clientName: string;
  clientEmail: string | null;
  companyName: string | null;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  recurringCents: number;
  recurringInterval: "month" | "year";
  currency: string;
  owner: string | null;
  publicToken: string;
  issueDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  sentMethod: "email" | "manual" | null;
  viewedAt: string | null;
  paidAt: string | null;
  proposalId: string | null;
  leadId: string | null;
  jobId: string | null;
  updatedAt: string;
};

export type InvoiceFilters = {
  status?: string;
  owner?: string;
  source?: string;
  search?: string;
  /** ISO date; matches invoices created on or after it. */
  since?: string;
};

export type InvoiceWorkspace = {
  rows: InvoiceListRow[];
  /** Counts across everything, not just the filtered view. */
  summary: Record<"draft" | "sent" | "overdue" | "partial" | "paid" | "void", number>;
  /** Money still owed on every live invoice, in cents. */
  outstandingCents: number;
  overdueCents: number;
  /** Collected in the last 30 days, from invoice_payments — not asking prices. */
  collected30Cents: number;
  /** Recurring lines on invoices that have actually been sent. */
  recurringCents: number;
  owners: string[];
  total: number;
};

function clientNameOf(inv: Invoice): string {
  return (
    inv.client_business_name ||
    inv.client_contact_name ||
    inv.client_email ||
    "No client recorded"
  );
}

function toRow(inv: Invoice, companyName: string | null): InvoiceListRow {
  const overdue = isOverdue(inv);
  return {
    id: inv.id,
    number: inv.invoice_number,
    title: inv.title,
    status: inv.status,
    source: inv.source,
    overdue,
    daysLate: overdue ? daysOverdue(inv.due_date) : 0,
    clientName: clientNameOf(inv),
    clientEmail: inv.client_email,
    companyName,
    totalCents: inv.total_cents,
    paidCents: inv.amount_paid_cents,
    outstandingCents: outstandingCents(inv),
    recurringCents: inv.recurring_cents,
    recurringInterval: inv.recurring_interval,
    currency: inv.currency,
    owner: inv.owner,
    publicToken: inv.public_token,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    sentAt: inv.sent_at,
    sentMethod: inv.sent_method,
    viewedAt: inv.first_viewed_at,
    paidAt: inv.paid_at,
    proposalId: inv.proposal_id,
    leadId: inv.lead_id,
    jobId: inv.job_id,
    updatedAt: inv.updated_at,
  };
}

export async function loadInvoiceWorkspace(
  sb: SupabaseClient,
  filters: InvoiceFilters = {}
): Promise<InvoiceWorkspace> {
  const { data, error } = await sb
    .from("invoices")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Could not load invoices: ${error.message}`);
  const all = (data ?? []) as Invoice[];

  // Company names in one pass rather than a join per row.
  const companyIds = Array.from(
    new Set(all.map((i) => i.company_id).filter((id): id is string => Boolean(id)))
  );
  const companyNames = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await sb
      .from("companies")
      .select("id, name")
      .in("id", companyIds);
    for (const company of (companies ?? []) as { id: string; name: string }[]) {
      companyNames.set(company.id, company.name);
    }
  }

  const rows = all.map((inv) =>
    toRow(inv, inv.company_id ? companyNames.get(inv.company_id) ?? null : null)
  );

  // ── Summary over EVERYTHING, so the cards do not change when a filter is
  // applied. A filtered "$0 outstanding" would be a different claim.
  const summary = { draft: 0, sent: 0, overdue: 0, partial: 0, paid: 0, void: 0 };
  let outstanding = 0;
  let overdueMoney = 0;
  let recurring = 0;

  for (const row of rows) {
    switch (row.status) {
      case "draft": summary.draft += 1; break;
      case "sent": summary.sent += 1; break;
      case "partial": summary.partial += 1; break;
      case "paid": summary.paid += 1; break;
      case "void":
      case "refunded": summary.void += 1; break;
      default: break;
    }
    if (row.overdue) {
      summary.overdue += 1;
      overdueMoney += row.outstandingCents;
    }
    if (!CLOSED_INVOICE_STATUSES.includes(row.status) && row.status !== "draft") {
      outstanding += row.outstandingCents;
      recurring += row.recurringCents;
    }
  }

  // ── Collected, from the payments table. This is money that actually
  // arrived, by any method — never the sum of what was asked for.
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: recent } = await sb
    .from("invoice_payments")
    .select("amount_cents")
    .gte("paid_on", since30);
  const collected30 = (recent ?? []).reduce(
    (sum, p) => sum + Number((p as { amount_cents: number }).amount_cents ?? 0),
    0
  );

  const owners = Array.from(
    new Set(all.map((i) => i.owner).filter((o): o is string => Boolean(o)))
  ).sort();

  // ── Filters, applied after the summary is fixed.
  const needle = (filters.search ?? "").trim().toLowerCase();
  const byId = new Map(all.map((inv) => [inv.id, inv]));

  const filtered = rows.filter((row) => {
    if (filters.status && filters.status !== "all") {
      if (filters.status === "overdue") {
        if (!row.overdue) return false;
      } else if (filters.status === "open") {
        if (CLOSED_INVOICE_STATUSES.includes(row.status)) return false;
      } else if (row.status !== filters.status) return false;
    }
    if (filters.owner && filters.owner !== "all" && row.owner !== filters.owner) return false;
    if (filters.source && filters.source !== "all" && row.source !== filters.source) return false;
    if (filters.since) {
      const source = byId.get(row.id);
      if (!source || source.created_at < filters.since) return false;
    }
    if (needle) {
      const hay = [
        row.number, row.title, row.clientName, row.clientEmail, row.companyName,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return {
    rows: filtered,
    summary,
    outstandingCents: outstanding,
    overdueCents: overdueMoney,
    collected30Cents: collected30,
    recurringCents: recurring,
    owners,
    total: rows.length,
  };
}

export async function loadInvoiceTimeline(
  sb: SupabaseClient,
  invoiceId: string
): Promise<InvoiceEvent[]> {
  const { data } = await sb
    .from("invoice_events")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(80);
  return (data ?? []) as InvoiceEvent[];
}

/** Invoices raised against one proposal, for the proposal's own screen. */
export async function invoicesForProposal(
  sb: SupabaseClient,
  proposalId: string
): Promise<InvoiceListRow[]> {
  const { data } = await sb
    .from("invoices")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Invoice[]).map((inv) => toRow(inv, null));
}
