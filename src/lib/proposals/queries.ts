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
    awaitingPrice: number;
    pipelineCents: number;
    won: number;
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
}): ProposalStep[] {
  const sent = Boolean(input.checkoutUrl) || ["sent", "paid", "refunded"].includes(input.invoiceStatus ?? "");
  const paid = Boolean(input.paidAt) || input.invoiceStatus === "paid" || input.stage === "won";

  return [
    { label: "Opportunity qualified", detail: "Contact and business need are identified.", state: "done" },
    {
      label: input.isKeyKonnect ? "Working website built" : "Working preview delivered",
      detail: input.isKeyKonnect
        ? "The Key Konnect website is built and available at the working preview."
        : "Share a concrete preview or discovery summary.",
      state: input.isKeyKonnect ? "done" : "active",
    },
    {
      label: input.isKeyKonnect ? "Brand and music received" : "Assets and feedback",
      detail: input.isKeyKonnect
        ? "Cory delivered his logos and ‘13 Years Old’ audio; both are incorporated into the website."
        : "Collect brand assets, content, and decision-maker feedback.",
      state: input.isKeyKonnect ? "done" : "waiting",
    },
    {
      label: "Scope and price approved",
      detail: input.valueCents ? "Commercial scope has a recorded value." : "Price is intentionally open until scope is agreed.",
      state: input.valueCents ? "done" : "waiting",
    },
    {
      label: "Proposal sent",
      detail: sent ? "Checkout or proposal link is recorded." : "Send the final scope, price, and payment link.",
      state: sent ? "done" : input.valueCents ? "active" : "waiting",
    },
    {
      label: "Accepted and paid",
      detail: paid ? "Payment is recorded; delivery can begin." : "Do not count this as revenue until acceptance or payment is recorded.",
      state: paid ? "done" : sent ? "active" : "waiting",
    },
  ];
}

export async function loadProposalWorkspace(sb: SupabaseClient): Promise<ProposalWorkspace> {
  const [dealRows, invoiceRows, leadRows] = await Promise.all([
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
      drafts: proposals.filter((p) => !p.invoiceId || p.invoiceStatus === "draft").length,
      sent: proposals.filter((p) => p.invoiceStatus === "sent").length,
      awaitingPrice: active.filter((p) => !p.valueCents).length,
      pipelineCents: active.reduce((sum, p) => sum + (p.valueCents ?? 0), 0),
      won: proposals.filter((p) => p.stage === "won" || p.invoiceStatus === "paid").length,
    },
  };
}
