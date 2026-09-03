import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isExpired } from "./service";
import {
  CLOSED_PROPOSAL_STATUSES,
  type ProposalStatus,
} from "./config";
import type { Proposal, ProposalEvent } from "./types";

/**
 * The admin's read side.
 *
 * Everything here takes the request-scoped Supabase client, so it runs as the
 * signed-in admin and RLS applies. The service role never appears in this
 * file — the only code that needs it is the public token flow in service.ts.
 */

export type ProposalListRow = {
  id: string;
  number: string;
  title: string;
  status: ProposalStatus;
  /** True when valid_until has passed but nothing has re-stamped the row. */
  staleExpired: boolean;
  kind: "proposal" | "change_order";
  clientName: string;
  clientEmail: string | null;
  companyName: string | null;
  packageName: string | null;
  oneTimeCents: number;
  recurringCents: number;
  recurringInterval: "month" | "year";
  owner: string | null;
  publicToken: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  paidAt: string | null;
  validUntil: string | null;
  jobId: string | null;
  leadId: string | null;
  dealId: string | null;
  updatedAt: string;
};

export type ProposalFilters = {
  status?: string;
  owner?: string;
  packageKey?: string;
  search?: string;
  /** ISO date; matches proposals created on or after it. */
  since?: string;
};

export type ProposalWorkspace = {
  rows: ProposalListRow[];
  /** Counts across everything, not just the filtered view. */
  summary: Record<
    "draft" | "sent" | "viewed" | "awaiting_signature" | "accepted" | "signed" | "expired",
    number
  >;
  /** Open one-time value still winnable, in cents. */
  openValueCents: number;
  /** One-time value on proposals that have actually been signed. */
  wonValueCents: number;
  owners: string[];
  packages: { key: string; name: string }[];
  total: number;
};

function clientNameOf(p: Proposal): string {
  return (
    p.client_business_name ||
    p.client_contact_name ||
    p.client_email ||
    "No client recorded"
  );
}

function toRow(p: Proposal, companyName: string | null): ProposalListRow {
  return {
    id: p.id,
    number: p.proposal_number,
    title: p.title,
    status: p.status,
    staleExpired: isExpired(p) && !CLOSED_PROPOSAL_STATUSES.includes(p.status),
    kind: p.kind,
    clientName: clientNameOf(p),
    clientEmail: p.client_email,
    companyName,
    packageName: p.package_name,
    oneTimeCents: p.total_cents,
    recurringCents: p.recurring_price_cents,
    recurringInterval: p.recurring_interval,
    owner: p.owner,
    publicToken: p.public_token,
    sentAt: p.sent_at,
    viewedAt: p.first_viewed_at,
    signedAt: p.signed_at,
    paidAt: p.paid_at,
    validUntil: p.valid_until,
    jobId: p.job_id,
    leadId: p.lead_id,
    dealId: p.deal_id,
    updatedAt: p.updated_at,
  };
}

export async function loadProposalWorkspace(
  sb: SupabaseClient,
  filters: ProposalFilters = {}
): Promise<ProposalWorkspace> {
  const { data, error } = await sb
    .from("proposals")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Could not load proposals: ${error.message}`);
  const all = (data ?? []) as Proposal[];

  // Company names in one pass rather than a join per row.
  const companyIds = Array.from(
    new Set(all.map((p) => p.company_id).filter((id): id is string => Boolean(id)))
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

  const rows = all.map((p) => toRow(p, p.company_id ? companyNames.get(p.company_id) ?? null : null));

  // ── Summary over EVERYTHING, so the cards do not change when a filter is
  // applied. A filtered "3 awaiting signature" would be a different claim.
  const summary = {
    draft: 0, sent: 0, viewed: 0, awaiting_signature: 0,
    accepted: 0, signed: 0, expired: 0,
  };
  let openValueCents = 0;
  let wonValueCents = 0;

  for (const row of rows) {
    if (row.staleExpired || row.status === "expired") summary.expired += 1;
    switch (row.status) {
      case "draft": summary.draft += 1; break;
      case "sent": summary.sent += 1; break;
      case "viewed": summary.viewed += 1; break;
      case "accepted": summary.accepted += 1; summary.awaiting_signature += 1; break;
      case "signed": summary.accepted += 1; summary.signed += 1; break;
      // Old rows only — a proposal has not collected money since 2026-09-03.
      case "payment_pending":
      case "paid":
      case "converted": summary.signed += 1; break;
      default: break;
    }
    if (!CLOSED_PROPOSAL_STATUSES.includes(row.status) && !row.staleExpired) {
      openValueCents += row.oneTimeCents;
    }
    // Won means agreed, not collected — the money is the invoice's business.
    if (row.signedAt || row.status === "paid" || row.status === "converted") {
      wonValueCents += row.oneTimeCents;
    }
  }

  const owners = Array.from(
    new Set(all.map((p) => p.owner).filter((o): o is string => Boolean(o)))
  ).sort();
  const packages = Array.from(
    new Map(
      all
        .filter((p) => p.package_key)
        .map((p) => [p.package_key as string, p.package_name ?? p.package_key ?? ""])
    ).entries()
  ).map(([key, name]) => ({ key, name }));

  // ── Filters, applied after the summary is fixed.
  const needle = (filters.search ?? "").trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (filters.status && filters.status !== "all") {
      if (filters.status === "expired") {
        if (!(row.staleExpired || row.status === "expired")) return false;
      } else if (row.status !== filters.status) return false;
    }
    if (filters.owner && filters.owner !== "all" && row.owner !== filters.owner) return false;
    if (filters.packageKey && filters.packageKey !== "all") {
      const source = all.find((p) => p.id === row.id);
      if (source?.package_key !== filters.packageKey) return false;
    }
    if (filters.since) {
      const source = all.find((p) => p.id === row.id);
      if (!source || source.created_at < filters.since) return false;
    }
    if (needle) {
      const hay = [
        row.number, row.title, row.clientName, row.clientEmail,
        row.companyName, row.packageName,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return {
    rows: filtered,
    summary,
    openValueCents,
    wonValueCents,
    owners,
    packages,
    total: rows.length,
  };
}

export async function loadProposalTimeline(
  sb: SupabaseClient,
  proposalId: string
): Promise<ProposalEvent[]> {
  const { data } = await sb
    .from("proposal_events")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as ProposalEvent[];
}

// ── What the builder needs to attach a proposal to something real ────

export type LinkCandidate = {
  id: string;
  label: string;
  sub: string | null;
  email: string | null;
  phone: string | null;
  businessName: string | null;
  companyId: string | null;
};

export async function loadLinkCandidates(sb: SupabaseClient): Promise<{
  leads: LinkCandidate[];
  customers: LinkCandidate[];
  deals: { id: string; label: string; leadId: string | null; companyId: string | null }[];
}> {
  const [leadRows, customerRows, dealRows] = await Promise.all([
    sb.from("leads")
      .select("id, first_name, last_name, email, phone, business_name, company_id, lead_status, updated_at")
      .order("updated_at", { ascending: false }).limit(300),
    sb.from("customers")
      .select("id, name, business_name, email, phone, company_id, status, updated_at")
      .order("updated_at", { ascending: false }).limit(300),
    sb.from("deals")
      .select("id, title, lead_id, company_id, stage, updated_at")
      .not("stage", "in", "(won,lost)")
      .order("updated_at", { ascending: false }).limit(300),
  ]);

  type LeadRaw = {
    id: string; first_name: string | null; last_name: string | null;
    email: string | null; phone: string | null; business_name: string | null;
    company_id: string | null; lead_status: string | null;
  };
  type CustomerRaw = {
    id: string; name: string | null; business_name: string | null;
    email: string | null; phone: string | null; company_id: string | null; status: string | null;
  };
  type DealRaw = { id: string; title: string; lead_id: string | null; company_id: string | null; stage: string };

  return {
    leads: ((leadRows.data ?? []) as LeadRaw[]).map((lead) => ({
      id: lead.id,
      label: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || "Unnamed lead",
      sub: lead.business_name || lead.lead_status,
      email: lead.email,
      phone: lead.phone,
      businessName: lead.business_name,
      companyId: lead.company_id,
    })),
    customers: ((customerRows.data ?? []) as CustomerRaw[]).map((customer) => ({
      id: customer.id,
      label: customer.business_name || customer.name || customer.email || "Unnamed client",
      sub: customer.name && customer.business_name ? customer.name : customer.status,
      email: customer.email,
      phone: customer.phone,
      businessName: customer.business_name,
      companyId: customer.company_id,
    })),
    deals: ((dealRows.data ?? []) as DealRaw[]).map((deal) => ({
      id: deal.id,
      label: `${deal.title} · ${deal.stage}`,
      leadId: deal.lead_id,
      companyId: deal.company_id,
    })),
  };
}
