import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { lastNDays } from "@/lib/dashboard/period";
import {
  comparableCents,
  DEAL_STAGES,
  LEAD_STATUS_STAGE,
  OPEN_STAGES,
  STAGE_LABELS,
  type DealStage,
} from "./stages";

/**
 * Everything the CRM shows.
 *
 * The relationship this screen exists to make visible:
 *
 *   Company → Contacts → Lead/Inquiry → Deals → Stage → Proposal → Won/Lost
 *
 * And the substitution that keeps it honest: a CONTACT is a lead, and a lead
 * who bought is also a customer. Several leads sharing one company_id are
 * several contacts at one company. There is no third record for the same
 * human, which is how a CRM ends up holding three spellings of one phone
 * number.
 */

export type ContactRow = {
  id: string;
  /** Which table this person lives in. Both are contacts; only one has paid. */
  kind: "lead" | "customer";
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: { id: string; name: string } | null;
  companyName: string | null;
  status: string;
  stage: DealStage | null;
  owner: string | null;
  servicesInterested: string[];
  lastActivityAt: string | null;
  lastActivityLabel: string | null;
  nextActionAt: string | null;
  score: number | null;
  openDeals: number;
  dealValueCents: number;
  source: string | null;
};

export type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  businessType: string | null;
  city: string | null;
  state: string | null;
  contacts: number;
  openDeals: number;
  pipelineCents: number;
  wonCents: number;
  isClient: boolean;
};

export type DealRow = {
  id: string;
  title: string;
  stage: DealStage;
  stageLabel: string;
  valueCents: number | null;
  billing: string;
  comparableCents: number;
  company: { id: string; name: string } | null;
  contactName: string | null;
  expectedClose: string | null;
  owner: string | null;
  updatedAt: string;
  hasProposal: boolean;
};

export type ActivityRow = {
  id: string;
  type: string;
  label: string;
  detail: string | null;
  at: string;
  leadId: string | null;
  who: string | null;
};

export type CrmFilters = {
  q?: string;
  tab: "contacts" | "companies" | "deals" | "activity";
  stage?: string;
  owner?: string;
  company?: string;
  status?: string;
};

export type CrmBoard = {
  kpis: {
    contacts: number;
    companies: number;
    engaged: number;
    openDeals: number;
    clients: number;
    pipelineCents: number;
  };
  tabCounts: Record<CrmFilters["tab"], number>;
  contacts: ContactRow[];
  companies: CompanyRow[];
  deals: DealRow[];
  activity: ActivityRow[];
  stageDistribution: { key: DealStage; label: string; count: number; valueCents: number }[];
  funnel: { key: DealStage; label: string; count: number; valueCents: number }[];
  metrics: {
    conversionPct: number | null;
    avgDealCents: number | null;
    winRatePct: number | null;
  };
  owners: string[];
  companyOptions: { id: string; name: string }[];
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const EVENT_LABELS: Record<string, string> = {
  note: "Note added",
  status_change: "Status changed",
  email_sent: "Email sent",
  email_failed: "Email failed",
  call: "Call logged",
  sms: "SMS sent",
  form_submit: "Form submitted",
  followup_sent: "Follow-up sent",
  appointment: "Appointment",
  revenue: "Payment received",
  system: "System",
  duplicate_merge: "Duplicate merged",
};

export async function loadCrmBoard(
  sb: SupabaseClient,
  filters: CrmFilters
): Promise<CrmBoard> {
  const window = lastNDays(90);

  const [leads, customers, companies, deals, events, invoices] = await Promise.all([
    sb
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, business_name, business_type, lead_status, lead_score, assigned_to, services_interested, last_contacted_at, next_followup_at, source, created_at, company_id, companies(id, name)"
      )
      .order("created_at", { ascending: false })
      .limit(500)
      .then((r) => unwrap(r, "leads")),
    sb
      .from("customers")
      .select("id, name, business_name, email, phone, status, owner, mrr_cents, won_at, company_id, companies(id, name)")
      .order("created_at", { ascending: false })
      .limit(500)
      .then((r) => unwrap(r, "customers")),
    sb
      .from("companies")
      .select("id, name, domain, business_type, city, state, owner")
      .order("name", { ascending: true })
      .then((r) => unwrap(r, "companies")),
    sb
      .from("deals")
      .select("id, title, stage, value_cents, billing, expected_close, owner, updated_at, company_id, lead_id, customer_id, companies(id, name), leads(first_name, last_name)")
      .order("updated_at", { ascending: false })
      .limit(500)
      .then((r) => unwrap(r, "deals")),
    sb
      .from("lead_events")
      .select("id, lead_id, type, body, created_at, actor")
      .gte("created_at", window.fromIso)
      .order("created_at", { ascending: false })
      .limit(40)
      .then((r) => (r.error ? [] : (r.data ?? []))),
    sb
      .from("invoices")
      .select("id, deal_id, status, amount_cents")
      .then((r) => (r.error ? [] : (r.data ?? []))),
  ]);

  type CompanyLite = { id: string; name: string };
  type LeadRaw = {
    id: string; first_name: string | null; last_name: string | null;
    email: string | null; phone: string | null; business_name: string | null;
    business_type: string | null; lead_status: string; lead_score: number | null;
    assigned_to: string | null; services_interested: string[] | null;
    last_contacted_at: string | null; next_followup_at: string | null;
    source: string; created_at: string; company_id: string | null;
    companies: CompanyLite | CompanyLite[] | null;
  };
  type CustomerRaw = {
    id: string; name: string; business_name: string | null; email: string | null;
    phone: string | null; status: string; owner: string | null; mrr_cents: number | null;
    won_at: string | null; company_id: string | null;
    companies: CompanyLite | CompanyLite[] | null;
  };
  type DealRaw = {
    id: string; title: string; stage: DealStage; value_cents: number | null;
    billing: string; expected_close: string | null; owner: string | null;
    updated_at: string; company_id: string | null; lead_id: string | null;
    customer_id: string | null;
    companies: CompanyLite | CompanyLite[] | null;
    leads: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  };

  const leadRows = leads as LeadRaw[];
  const customerRows = customers as CustomerRaw[];
  const companyRows = companies as { id: string; name: string; domain: string | null; business_type: string | null; city: string | null; state: string | null; owner: string | null }[];
  const dealRows = deals as DealRaw[];

  const proposalDealIds = new Set(
    (invoices as { deal_id: string | null }[]).map((i) => i.deal_id).filter((d): d is string => Boolean(d))
  );

  // ── Deals ──────────────────────────────────────────────────────────
  const allDeals: DealRow[] = dealRows.map((d) => {
    const co = one<CompanyLite>(d.companies);
    const lead = one<{ first_name: string | null; last_name: string | null }>(d.leads);
    return {
      id: d.id,
      title: d.title,
      stage: d.stage,
      stageLabel: STAGE_LABELS[d.stage] ?? d.stage,
      valueCents: d.value_cents,
      billing: d.billing,
      comparableCents: comparableCents(d.value_cents, d.billing),
      company: co ? { id: co.id, name: co.name } : null,
      contactName: lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null : null,
      expectedClose: d.expected_close,
      owner: d.owner,
      updatedAt: d.updated_at,
      hasProposal: proposalDealIds.has(d.id),
    };
  });

  const dealsByCompany = new Map<string, DealRow[]>();
  const dealsByLead = new Map<string, DealRow[]>();
  for (const d of allDeals) {
    if (d.company?.id) dealsByCompany.set(d.company.id, [...(dealsByCompany.get(d.company.id) ?? []), d]);
  }
  for (const raw of dealRows) {
    if (!raw.lead_id) continue;
    const shaped = allDeals.find((d) => d.id === raw.id)!;
    dealsByLead.set(raw.lead_id, [...(dealsByLead.get(raw.lead_id) ?? []), shaped]);
  }

  // ── Activity, and "when did we last hear from this person" ─────────
  type EventRaw = { id: string; lead_id: string; type: string; body: string | null; created_at: string; actor: string | null };
  const eventRows = events as EventRaw[];

  const lastEventByLead = new Map<string, EventRaw>();
  for (const e of eventRows) {
    if (!lastEventByLead.has(e.lead_id)) lastEventByLead.set(e.lead_id, e);
  }

  const activity: ActivityRow[] = eventRows.slice(0, 10).map((e) => ({
    id: e.id,
    type: e.type,
    label: EVENT_LABELS[e.type] ?? e.type,
    detail: e.body ? e.body.slice(0, 120) : null,
    at: e.created_at,
    leadId: e.lead_id,
    who: e.actor,
  }));

  // ── Contacts: leads and customers, one list ────────────────────────
  const contactsAll: ContactRow[] = [
    ...leadRows.map((l): ContactRow => {
      const co = one<CompanyLite>(l.companies);
      const theirDeals = dealsByLead.get(l.id) ?? [];
      const open = theirDeals.filter((d) => OPEN_STAGES.includes(d.stage));
      const lastEvent = lastEventByLead.get(l.id) ?? null;
      return {
        id: l.id,
        kind: "lead",
        name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "Unnamed",
        role: null,
        email: l.email,
        phone: l.phone,
        company: co ? { id: co.id, name: co.name } : null,
        companyName: co?.name ?? l.business_name,
        status: l.lead_status,
        // A lead with no deal still sits somewhere in the funnel.
        stage: theirDeals[0]?.stage ?? LEAD_STATUS_STAGE[l.lead_status] ?? null,
        owner: l.assigned_to,
        servicesInterested: l.services_interested ?? [],
        lastActivityAt: lastEvent?.created_at ?? l.last_contacted_at,
        lastActivityLabel: lastEvent ? (EVENT_LABELS[lastEvent.type] ?? lastEvent.type) : null,
        nextActionAt: l.next_followup_at,
        score: l.lead_score,
        openDeals: open.length,
        dealValueCents: open.reduce((t, d) => t + d.comparableCents, 0),
        source: l.source,
      };
    }),
    ...customerRows.map((c): ContactRow => {
      const co = one<CompanyLite>(c.companies);
      return {
        id: c.id,
        kind: "customer",
        name: c.name,
        role: null,
        email: c.email,
        phone: c.phone,
        company: co ? { id: co.id, name: co.name } : null,
        companyName: co?.name ?? c.business_name,
        status: c.status === "active" ? "Client" : c.status === "paused" ? "Paused" : "Churned",
        stage: "won",
        owner: c.owner,
        servicesInterested: [],
        lastActivityAt: c.won_at,
        lastActivityLabel: c.won_at ? "Became a client" : null,
        nextActionAt: null,
        score: null,
        openDeals: 0,
        dealValueCents: c.mrr_cents ?? 0,
        source: null,
      };
    }),
  ];

  // ── Companies ──────────────────────────────────────────────────────
  const clientCompanyIds = new Set(
    customerRows.filter((c) => c.status === "active" && c.company_id).map((c) => c.company_id!)
  );

  const companiesAll: CompanyRow[] = companyRows.map((c) => {
    const theirDeals = dealsByCompany.get(c.id) ?? [];
    const open = theirDeals.filter((d) => OPEN_STAGES.includes(d.stage));
    const won = theirDeals.filter((d) => d.stage === "won");
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      businessType: c.business_type,
      city: c.city,
      state: c.state,
      contacts: contactsAll.filter((p) => p.company?.id === c.id).length,
      openDeals: open.length,
      pipelineCents: open.reduce((t, d) => t + d.comparableCents, 0),
      wonCents: won.reduce((t, d) => t + d.comparableCents, 0),
      isClient: clientCompanyIds.has(c.id),
    };
  });

  // ── Filters ────────────────────────────────────────────────────────
  const needle = filters.q?.toLowerCase().trim();

  const contacts = contactsAll.filter((c) => {
    if (needle) {
      const hay = `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.companyName ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.owner && c.owner !== filters.owner) return false;
    if (filters.company && c.company?.id !== filters.company) return false;
    if (filters.stage && c.stage !== filters.stage) return false;
    if (filters.status && c.status !== filters.status) return false;
    return true;
  });

  const companiesFiltered = companiesAll.filter((c) => {
    if (needle) {
      const hay = `${c.name} ${c.domain ?? ""} ${c.businessType ?? ""} ${c.city ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.company && c.id !== filters.company) return false;
    return true;
  });

  const dealsFiltered = allDeals.filter((d) => {
    if (needle) {
      const hay = `${d.title} ${d.company?.name ?? ""} ${d.contactName ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.stage && d.stage !== filters.stage) return false;
    if (filters.owner && d.owner !== filters.owner) return false;
    if (filters.company && d.company?.id !== filters.company) return false;
    return true;
  });

  // ── The funnel ─────────────────────────────────────────────────────
  const openDeals = allDeals.filter((d) => OPEN_STAGES.includes(d.stage));
  const wonDeals = allDeals.filter((d) => d.stage === "won");
  const lostDeals = allDeals.filter((d) => d.stage === "lost");

  const stageDistribution = DEAL_STAGES.map((s) => {
    const inStage = allDeals.filter((d) => d.stage === s.key);
    return {
      key: s.key,
      label: s.label,
      count: inStage.length,
      valueCents: inStage.reduce((t, d) => t + d.comparableCents, 0),
    };
  }).filter((s) => s.count > 0);

  const funnel = DEAL_STAGES.filter((s) => s.open || s.key === "won").map((s) => {
    const inStage = allDeals.filter((d) => d.stage === s.key);
    return {
      key: s.key,
      label: s.label,
      count: inStage.length,
      valueCents: inStage.reduce((t, d) => t + d.comparableCents, 0),
    };
  });

  const closed = wonDeals.length + lostDeals.length;
  const valued = wonDeals.filter((d) => d.comparableCents > 0);

  // Every one of these is null when its denominator is zero. A 0% win rate
  // on zero closed deals is not a fact about the business.
  const metrics = {
    conversionPct:
      contactsAll.length > 0 ? (customerRows.length / contactsAll.length) * 100 : null,
    avgDealCents:
      valued.length > 0
        ? Math.round(valued.reduce((t, d) => t + d.comparableCents, 0) / valued.length)
        : null,
    winRatePct: closed > 0 ? (wonDeals.length / closed) * 100 : null,
  };

  const engaged = contactsAll.filter(
    (c) => c.lastActivityAt !== null || c.openDeals > 0 || c.kind === "customer"
  ).length;

  const owners = [
    ...new Set(
      [...contactsAll.map((c) => c.owner), ...allDeals.map((d) => d.owner)].filter(
        (o): o is string => Boolean(o)
      )
    ),
  ].sort();

  return {
    kpis: {
      contacts: contactsAll.length,
      companies: companiesAll.length,
      engaged,
      openDeals: openDeals.length,
      clients: customerRows.filter((c) => c.status === "active").length,
      pipelineCents: openDeals.reduce((t, d) => t + d.comparableCents, 0),
    },
    tabCounts: {
      contacts: contactsAll.length,
      companies: companiesAll.length,
      deals: allDeals.length,
      activity: eventRows.length,
    },
    contacts: contacts.slice(0, 50),
    companies: companiesFiltered.slice(0, 50),
    deals: dealsFiltered.slice(0, 50),
    activity,
    stageDistribution,
    funnel,
    metrics,
    owners,
    companyOptions: companyRows.map((c) => ({ id: c.id, name: c.name })),
  };
}
