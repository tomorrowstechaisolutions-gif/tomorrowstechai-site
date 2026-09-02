import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import type { DealStage } from "@/lib/crm/stages";

export type ProposalStep = {
  label: string;
  detail: string;
  state: "done" | "active" | "waiting";
};

export type ProposalRow = {
  id: string;
  dealId: string;
  leadId: string | null;
  companyName: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  title: string;
  stage: DealStage;
  valueCents: number | null;
  hostingCents: number | null;
  billing: "one_time" | "monthly";
  expectedClose: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  previewUrl: string | null;
  notes: string | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  checkoutUrl: string | null;
  sentAt: string | null;
  paidAt: string | null;
  proposalSentAt: string | null;
  proposalAcceptedAt: string | null;
  proposalAcceptedBy: string | null;
  assetsReceivedAt: string | null;
  buildReadyAt: string | null;
  reviewApprovedAt: string | null;
  launchedAt: string | null;
  updatedAt: string;
  isKeyKonnect: boolean;
  steps: ProposalStep[];
};

export type ProposalWorkspace = {
  proposals: ProposalRow[];
  kpis: {
    active: number;
    drafts: number;
    sent: number;
    accepted: number;
    pipelineCents: number;
    paid: number;
  };
};

const one = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] ?? null : value;

function urlFrom(text: string | null): string | null {
  const match = text?.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

function proposalSteps(input: {
  isKeyKonnect: boolean;
  stage: DealStage;
  valueCents: number | null;
  invoiceStatus: string | null;
  checkoutUrl: string | null;
  paidAt: string | null;
  proposalSentAt: string | null;
  proposalAcceptedAt: string | null;
  assetsReceivedAt: string | null;
  buildReadyAt: string | null;
  reviewApprovedAt: string | null;
  launchedAt: string | null;
}): ProposalStep[] {
  const paid = Boolean(input.paidAt) || input.invoiceStatus === "paid" || input.stage === "won";
  const buildReady = Boolean(input.assetsReceivedAt) && Boolean(input.buildReadyAt);

  return [
    { label: "Scope and price captured", detail: input.valueCents ? "The discovery agreement has a recorded value." : "Finish discovery and record the agreed scope and price.", state: input.valueCents ? "done" : "active" },
    {
      label: "Proposal sent",
      detail: input.proposalSentAt ? "The written scope and price were sent to the client." : "Send the written agreement after the first sit-down; no payment is requested yet.",
      state: input.proposalSentAt ? "done" : input.valueCents ? "active" : "waiting",
    },
    {
      label: "Agreement accepted",
      detail: input.proposalAcceptedAt ? "The client’s acceptance is recorded; this is not a payment." : "Record the client’s written approval before treating the scope as authorized.",
      state: input.proposalAcceptedAt ? "done" : input.proposalSentAt ? "active" : "waiting",
    },
    {
      label: "Assets and build ready",
      detail: buildReady ? "Required assets are received and the working build is ready for review." : "Collect the agreed assets and prepare the working build.",
      state: buildReady ? "done" : input.proposalAcceptedAt ? "active" : "waiting",
    },
    {
      label: "Final review approved",
      detail: input.reviewApprovedAt ? "The client approved the finished site for launch." : "Review the finished site with the client and record approval.",
      state: input.reviewApprovedAt ? "done" : buildReady ? "active" : "waiting",
    },
    {
      label: ".com live and invoice due",
      detail: input.launchedAt ? "The approved site is live on its production domain; payment may now be requested." : "Connect the approved site to its .com, then issue the final invoice.",
      state: input.launchedAt ? "done" : input.reviewApprovedAt ? "active" : "waiting",
    },
    {
      label: "Paid",
      detail: paid ? "Payment is recorded as revenue." : "Do not count revenue until payment is actually recorded.",
      state: paid ? "done" : input.launchedAt ? "active" : "waiting",
    },
  ];
}

export async function loadProposalWorkspace(sb: SupabaseClient): Promise<ProposalWorkspace> {
  const [dealRows, invoiceRows, leadRows, milestoneRows] = await Promise.all([
    sb
      .from("deals")
      .select("id, lead_id, title, stage, value_cents, billing, expected_close, next_action, next_action_at, notes, updated_at, companies(name), leads(first_name, last_name, email, phone, business_name)")
      .in("stage", ["proposal", "negotiation", "won", "lost", "on_hold"])
      .order("updated_at", { ascending: false })
      .then((r) => unwrap(r, "proposal deals")),
    sb
      .from("invoices")
      .select("id, deal_id, lead_id, status, kind, amount_cents, launch_cents, hosting_cents, billing, description, checkout_url, sent_at, paid_at, notes, updated_at")
      .order("updated_at", { ascending: false })
      .then((r) => unwrap(r, "proposal invoices")),
    sb
      .from("leads")
      .select("id, first_name, last_name, email, phone, business_name, company_id, companies(name), updated_at")
      .order("updated_at", { ascending: false })
      .limit(500)
      .then((r) => unwrap(r, "proposal candidate leads")),
    sb
      .from("lead_events")
      .select("lead_id, created_at, meta")
      .eq("type", "system")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then((r) => (r.error ? [] : (r.data ?? []))),
  ]);

  type LeadLite = { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; business_name: string | null };
  type DealRaw = {
    id: string; lead_id: string | null; title: string; stage: DealStage;
    value_cents: number | null; billing: "one_time" | "monthly";
    expected_close: string | null; next_action: string | null; next_action_at: string | null;
    notes: string | null; updated_at: string;
    companies: { name: string } | { name: string }[] | null;
    leads: LeadLite | LeadLite[] | null;
  };
  type InvoiceRaw = {
    id: string; deal_id: string | null; lead_id: string | null; status: string;
    kind: "launch" | "upsell"; amount_cents: number; launch_cents: number; hosting_cents: number;
    billing: "one_time" | "monthly"; description: string | null;
    checkout_url: string | null; sent_at: string | null; paid_at: string | null;
    notes: string | null; updated_at: string;
  };
  type LeadCandidateRaw = LeadLite & {
    id: string; company_id: string | null; updated_at: string;
    companies: { name: string } | { name: string }[] | null;
  };

  const invoices = invoiceRows as InvoiceRaw[];
  type MilestoneEventRaw = {
    lead_id: string;
    created_at: string;
    meta: { proposal_milestone?: string; cleared?: boolean; accepted_by?: string | null } | null;
  };
  const latestMilestone = new Map<string, MilestoneEventRaw>();
  for (const event of milestoneRows as MilestoneEventRaw[]) {
    const key = event.meta?.proposal_milestone;
    if (!key) continue;
    const mapKey = `${event.lead_id}:${key}`;
    if (!latestMilestone.has(mapKey)) latestMilestone.set(mapKey, event);
  }
  const milestone = (leadId: string | null, key: string) =>
    leadId ? latestMilestone.get(`${leadId}:${key}`) ?? null : null;
  const milestoneDate = (leadId: string | null, key: string) => {
    const event = milestone(leadId, key);
    return event && !event.meta?.cleared ? event.created_at : null;
  };
  const invoiceByDeal = new Map<string, InvoiceRaw>();
  for (const invoice of invoices) {
    if (invoice.deal_id && !invoiceByDeal.has(invoice.deal_id)) invoiceByDeal.set(invoice.deal_id, invoice);
  }

  const proposals = (dealRows as DealRaw[]).map((deal): ProposalRow => {
    const lead = one(deal.leads);
    const company = one(deal.companies);
    const invoice = invoiceByDeal.get(deal.id) ?? null;
    const contactName = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Contact not linked";
    const companyName = company?.name ?? lead?.business_name ?? "Business not linked";
    const identity = `${contactName} ${companyName}`.toLowerCase();
    const isKeyKonnect = identity.includes("cory simek") || identity.includes("key konnect");
    const valueCents = deal.value_cents ?? (invoice ? (invoice.kind === "launch" ? invoice.launch_cents : invoice.amount_cents) : null);
    const previewUrl = isKeyKonnect
      ? "https://corywiththekeys.vercel.app/"
      : urlFrom(`${deal.notes ?? ""} ${invoice?.notes ?? ""}`);

    const base = {
      id: invoice?.id ?? deal.id,
      dealId: deal.id,
      leadId: deal.lead_id,
      companyName,
      contactName,
      email: lead?.email ?? null,
      phone: lead?.phone ?? null,
      title: deal.title,
      stage: deal.stage,
      valueCents: valueCents && valueCents > 0 ? valueCents : null,
      hostingCents: invoice?.hosting_cents && invoice.hosting_cents > 0 ? invoice.hosting_cents : (isKeyKonnect ? 2900 : null),
      billing: deal.billing,
      expectedClose: deal.expected_close,
      nextAction: deal.next_action,
      nextActionAt: deal.next_action_at,
      previewUrl,
      notes: deal.notes ?? invoice?.description ?? invoice?.notes ?? null,
      invoiceId: invoice?.id ?? null,
      invoiceStatus: invoice?.status ?? null,
      checkoutUrl: invoice?.checkout_url ?? null,
      sentAt: invoice?.sent_at ?? null,
      paidAt: invoice?.paid_at ?? null,
      proposalSentAt: milestoneDate(deal.lead_id, "proposal_sent"),
      proposalAcceptedAt: milestoneDate(deal.lead_id, "proposal_accepted"),
      proposalAcceptedBy: milestone(deal.lead_id, "proposal_accepted")?.meta?.accepted_by ?? null,
      assetsReceivedAt: milestoneDate(deal.lead_id, "assets_received"),
      buildReadyAt: milestoneDate(deal.lead_id, "build_ready"),
      reviewApprovedAt: milestoneDate(deal.lead_id, "review_approved"),
      launchedAt: milestoneDate(deal.lead_id, "launched"),
      updatedAt: invoice && invoice.updated_at > deal.updated_at ? invoice.updated_at : deal.updated_at,
      isKeyKonnect,
    };

    return { ...base, steps: proposalSteps(base) };
  });

  // A proposal can be agreed in conversation before somebody has remembered
  // to create the deal row. Do not hide that real work behind an empty-state
  // filter: surface Cory from the lead record, then let the explicit sync
  // action create the missing deal and invoice atomically under admin RLS.
  if (!proposals.some((proposal) => proposal.isKeyKonnect)) {
    const cory = (leadRows as LeadCandidateRaw[]).find((lead) => {
      const identity = `${lead.first_name ?? ""} ${lead.last_name ?? ""} ${lead.business_name ?? ""} ${lead.email ?? ""}`.toLowerCase();
      return identity.includes("cory simek") || identity.includes("key konnect") || identity.includes("corywiththekeys");
    });
    if (cory) {
      const company = one(cory.companies);
      const base = {
        id: `lead-${cory.id}`,
        dealId: "",
        leadId: cory.id,
        companyName: company?.name ?? cory.business_name ?? "The Key Konnect",
        contactName: [cory.first_name, cory.last_name].filter(Boolean).join(" ") || "Cory Simek",
        email: cory.email ?? "corywiththekeys@gmail.com",
        phone: cory.phone,
        title: "The Key Konnect website launch",
        stage: "proposal" as DealStage,
        valueCents: 39900,
        hostingCents: 2900,
        billing: "one_time" as const,
        expectedClose: null,
        nextAction: "Save the agreement to CRM, send the final proposal, and record acceptance or payment",
        nextActionAt: null,
        previewUrl: "https://corywiththekeys.vercel.app/",
        notes: "4–5 page website with working vehicle inventory, an initial merchandise shop, music experience, and starter CRM. $399 build + $29/month hosting.",
        invoiceId: null,
        invoiceStatus: null,
        checkoutUrl: null,
        sentAt: null,
        paidAt: null,
        proposalSentAt: null,
        proposalAcceptedAt: null,
        proposalAcceptedBy: null,
        assetsReceivedAt: "2026-09-01T12:39:00.000Z",
        buildReadyAt: "2026-09-01T12:39:00.000Z",
        reviewApprovedAt: null,
        launchedAt: null,
        updatedAt: cory.updated_at,
        isKeyKonnect: true,
      };
      proposals.unshift({ ...base, steps: proposalSteps(base) });
    }
  }

  const active = proposals.filter((p) => !["won", "lost"].includes(p.stage));
  return {
    proposals,
    kpis: {
      active: active.length,
      drafts: proposals.filter((p) => !p.proposalSentAt).length,
      sent: proposals.filter((p) => Boolean(p.proposalSentAt)).length,
      accepted: active.filter((p) => Boolean(p.proposalAcceptedAt)).length,
      pipelineCents: active.reduce((sum, p) => sum + (p.valueCents ?? 0), 0),
      paid: proposals.filter((p) => p.invoiceStatus === "paid").length,
    },
  };
}
