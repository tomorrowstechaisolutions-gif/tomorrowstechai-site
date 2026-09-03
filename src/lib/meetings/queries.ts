import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_TZ, chicagoDate, zonedMidnightUtc } from "@/lib/time/chicago";
import { CLOSED_MEETING_STATUSES, OPEN_MEETING_STATUSES } from "./config";
import type { MeetingTab } from "./config";
import type { Meeting, MeetingContact, MeetingKpis, MeetingWithLinks } from "./types";

/**
 * Reads for the Meetings Center and for the panels on every record.
 *
 * Filtering, ordering and paging all happen in Postgres. The KPI cards are
 * head-only counts — four numbers cost four counts, not four fetches of rows
 * nobody renders. The same rule the Tasks board follows.
 */

const DAY = 86_400_000;

function dayBoundsUtc(day: string): { from: string; to: string } {
  const start = zonedMidnightUtc(day);
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + DAY).toISOString(),
  };
}

const SELECT = "*";

// ── Enrichment ───────────────────────────────────────────────────────

/**
 * Names for the ids a page of meetings points at, in four queries rather
 * than four per row.
 */
export async function enrichMeetings(
  sb: SupabaseClient,
  rows: Meeting[]
): Promise<MeetingWithLinks[]> {
  const pick = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((v): v is string => Boolean(v))));

  const leadIds = pick(rows.map((r) => r.lead_id));
  const customerIds = pick(rows.map((r) => r.customer_id));
  const jobIds = pick(rows.map((r) => r.job_id));
  const proposalIds = pick(rows.map((r) => r.proposal_id));

  type LeadRow = { id: string; first_name: string | null; last_name: string | null; business_name: string | null };
  type CustomerRow = { id: string; name: string | null; business_name: string | null };
  type JobRow = { id: string; title: string | null; business_name: string | null };
  type ProposalRow = { id: string; proposal_number: string };

  const [leads, customers, jobs, proposals] = await Promise.all([
    leadIds.length === 0 ? Promise.resolve(new Map<string, LeadRow>()) :
      sb.from("leads").select("id, first_name, last_name, business_name").in("id", leadIds)
        .then((r) => new Map(((r.data ?? []) as LeadRow[]).map((row) => [row.id, row]))),
    customerIds.length === 0 ? Promise.resolve(new Map<string, CustomerRow>()) :
      sb.from("customers").select("id, name, business_name").in("id", customerIds)
        .then((r) => new Map(((r.data ?? []) as CustomerRow[]).map((row) => [row.id, row]))),
    jobIds.length === 0 ? Promise.resolve(new Map<string, JobRow>()) :
      sb.from("jobs").select("id, title, business_name").in("id", jobIds)
        .then((r) => new Map(((r.data ?? []) as JobRow[]).map((row) => [row.id, row]))),
    proposalIds.length === 0 ? Promise.resolve(new Map<string, ProposalRow>()) :
      sb.from("proposals").select("id, proposal_number").in("id", proposalIds)
        .then((r) => new Map(((r.data ?? []) as ProposalRow[]).map((row) => [row.id, row]))),
  ]);

  return rows.map((row) => {
    const lead = row.lead_id ? leads.get(row.lead_id) : undefined;
    const customer = row.customer_id ? customers.get(row.customer_id) : undefined;
    const job = row.job_id ? jobs.get(row.job_id) : undefined;
    const proposal = row.proposal_id ? proposals.get(row.proposal_id) : undefined;

    const leadName = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || null;

    return {
      ...row,
      contactName: customer?.name || leadName || row.attendee_name || null,
      companyName: customer?.business_name || lead?.business_name || job?.business_name || null,
      contactHref: row.customer_id
        ? `/admin/clients/${row.customer_id}`
        : row.lead_id ? `/admin/leads/${row.lead_id}` : null,
      proposalNumber: proposal?.proposal_number ?? null,
      projectName: job?.title || job?.business_name || null,
    };
  });
}

// ── The Meetings Center ──────────────────────────────────────────────

export async function getMeetingKpis(sb: SupabaseClient): Promise<MeetingKpis> {
  const today = chicagoDate();
  const { from, to } = dayBoundsUtc(today);
  const monthStart = zonedMidnightUtc(`${today.slice(0, 7)}-01`).toISOString();
  const nowIso = new Date().toISOString();

  // Four head-only counts. Nothing here fetches a row it will not render.
  const [today_, upcoming, completed, followUps] = await Promise.all([
    sb.from("meetings").select("id", { count: "exact", head: true })
      .gte("start_at", from).lt("start_at", to).neq("status", "cancelled"),
    sb.from("meetings").select("id", { count: "exact", head: true })
      .gt("start_at", nowIso).in("status", OPEN_MEETING_STATUSES),
    sb.from("meetings").select("id", { count: "exact", head: true })
      .eq("status", "completed").gte("start_at", monthStart),
    sb.from("meetings").select("id", { count: "exact", head: true })
      .eq("follow_up_required", true).neq("status", "cancelled"),
  ]);

  return {
    today: today_.count ?? 0,
    upcoming: upcoming.count ?? 0,
    completedThisMonth: completed.count ?? 0,
    followUpsRequired: followUps.count ?? 0,
  };
}

export type MeetingListOptions = {
  tab: MeetingTab;
  search?: string;
  limit?: number;
};

export async function listMeetings(
  sb: SupabaseClient,
  options: MeetingListOptions
): Promise<MeetingWithLinks[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
  const nowIso = new Date().toISOString();
  const { from, to } = dayBoundsUtc(chicagoDate());

  let query = sb.from("meetings").select(SELECT);

  switch (options.tab) {
    case "today":
      query = query.gte("start_at", from).lt("start_at", to)
        .not("status", "in", "(cancelled)")
        .order("start_at", { ascending: true });
      break;
    case "upcoming":
      query = query.gt("start_at", nowIso).in("status", OPEN_MEETING_STATUSES)
        .order("start_at", { ascending: true });
      break;
    case "past":
      query = query.lt("start_at", nowIso).in("status", ["completed", "no_show", "in_progress", "scheduled", "confirmed"])
        .order("start_at", { ascending: false });
      break;
    case "followup":
      query = query.eq("follow_up_required", true).neq("status", "cancelled")
        .order("follow_up_date", { ascending: true, nullsFirst: false });
      break;
    case "cancelled":
      query = query.in("status", ["cancelled", "rescheduled"])
        .order("start_at", { ascending: false });
      break;
  }

  const term = (options.search ?? "").trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    query = query.or(
      `title.ilike.%${safe}%,attendee_name.ilike.%${safe}%,attendee_email.ilike.%${safe}%,internal_notes.ilike.%${safe}%`
    );
  }

  const { data } = await query.limit(limit);
  return enrichMeetings(sb, (data ?? []) as Meeting[]);
}

export async function getMeetingById(
  sb: SupabaseClient,
  id: string
): Promise<MeetingWithLinks | null> {
  const { data } = await sb.from("meetings").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const [enriched] = await enrichMeetings(sb, [data as Meeting]);
  return enriched ?? null;
}

/** The raw row, for actions that are about to change it. */
export async function getMeetingRow(sb: SupabaseClient, id: string): Promise<Meeting | null> {
  const { data } = await sb.from("meetings").select(SELECT).eq("id", id).maybeSingle();
  return (data as Meeting | null) ?? null;
}

// ── Per-record panels ────────────────────────────────────────────────

export type RecordMeetings = {
  upcoming: MeetingWithLinks[];
  past: MeetingWithLinks[];
  next: MeetingWithLinks | null;
  last: MeetingWithLinks | null;
  total: number;
};

const EMPTY: RecordMeetings = { upcoming: [], past: [], next: null, last: null, total: 0 };

export async function meetingsForRecord(
  sb: SupabaseClient,
  column: "lead_id" | "customer_id" | "job_id" | "proposal_id",
  value: string | null | undefined
): Promise<RecordMeetings> {
  if (!value) return EMPTY;

  const { data } = await sb
    .from("meetings").select(SELECT).eq(column, value)
    .order("start_at", { ascending: false }).limit(50);

  const rows = await enrichMeetings(sb, (data ?? []) as Meeting[]);
  const now = Date.now();

  const upcoming = rows
    .filter((m) => new Date(m.start_at).getTime() >= now && !CLOSED_MEETING_STATUSES.includes(m.status))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = rows.filter((m) => !upcoming.includes(m));

  return {
    upcoming,
    past,
    next: upcoming[0] ?? null,
    last: past[0] ?? null,
    total: rows.length,
  };
}

// ── Who the meeting is with ──────────────────────────────────────────

function initialsOf(name: string | null, company: string | null): string {
  const source = (name || company || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Turns whichever record the button was pressed on into one contact card.
 *
 * A proposal knows its client and its lead; a project knows its customer.
 * Resolving all of that here means the scheduling form takes one prop and
 * every entry point looks identical to it.
 */
export async function resolveContact(
  sb: SupabaseClient,
  input: {
    leadId?: string | null;
    customerId?: string | null;
    jobId?: string | null;
    proposalId?: string | null;
  }
): Promise<MeetingContact | null> {
  let leadId = input.leadId ?? null;
  let customerId = input.customerId ?? null;
  let companyId: string | null = null;
  const jobId = input.jobId ?? null;
  const proposalId = input.proposalId ?? null;

  if (proposalId) {
    const { data } = await sb
      .from("proposals")
      .select("lead_id, customer_id, company_id, job_id, client_contact_name, client_business_name, client_email, client_phone")
      .eq("id", proposalId).maybeSingle();
    if (data) {
      leadId = leadId ?? (data.lead_id as string | null);
      customerId = customerId ?? (data.customer_id as string | null);
      companyId = (data.company_id as string | null) ?? null;
      if (data.client_email || data.client_contact_name) {
        return {
          leadId, customerId, companyId, jobId: jobId ?? (data.job_id as string | null), proposalId,
          name: (data.client_contact_name as string | null) ?? null,
          company: (data.client_business_name as string | null) ?? null,
          email: (data.client_email as string | null) ?? null,
          phone: (data.client_phone as string | null) ?? null,
          href: customerId ? `/admin/clients/${customerId}` : leadId ? `/admin/leads/${leadId}` : null,
          initials: initialsOf(
            (data.client_contact_name as string | null) ?? null,
            (data.client_business_name as string | null) ?? null
          ),
        };
      }
    }
  }

  if (jobId && !customerId) {
    const { data } = await sb.from("jobs").select("customer_id, lead_id").eq("id", jobId).maybeSingle();
    customerId = customerId ?? (data?.customer_id as string | null) ?? null;
    leadId = leadId ?? (data?.lead_id as string | null) ?? null;
  }

  if (customerId) {
    const { data } = await sb
      .from("customers").select("id, name, business_name, email, phone, lead_id, company_id")
      .eq("id", customerId).maybeSingle();
    if (data) {
      return {
        leadId: leadId ?? (data.lead_id as string | null),
        customerId,
        companyId: (data.company_id as string | null) ?? null,
        jobId, proposalId,
        name: (data.name as string | null) ?? null,
        company: (data.business_name as string | null) ?? null,
        email: (data.email as string | null) ?? null,
        phone: (data.phone as string | null) ?? null,
        href: `/admin/clients/${customerId}`,
        initials: initialsOf((data.name as string | null) ?? null, (data.business_name as string | null) ?? null),
      };
    }
  }

  if (leadId) {
    const { data } = await sb
      .from("leads").select("id, first_name, last_name, business_name, email, phone, company_id")
      .eq("id", leadId).maybeSingle();
    if (data) {
      const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
      return {
        leadId, customerId, companyId: (data.company_id as string | null) ?? null, jobId, proposalId,
        name,
        company: (data.business_name as string | null) ?? null,
        email: (data.email as string | null) ?? null,
        phone: (data.phone as string | null) ?? null,
        href: `/admin/leads/${leadId}`,
        initials: initialsOf(name, (data.business_name as string | null) ?? null),
      };
    }
  }

  return null;
}

/** Everyone schedulable, for the "change the contact" picker. */
export async function schedulableContacts(sb: SupabaseClient): Promise<{
  clients: { id: string; name: string }[];
  leads: { id: string; name: string }[];
}> {
  const [clients, leads] = await Promise.all([
    sb.from("customers").select("id, name, business_name").order("business_name").limit(200),
    sb.from("leads").select("id, first_name, last_name, business_name")
      .order("created_at", { ascending: false }).limit(200),
  ]);

  return {
    clients: ((clients.data ?? []) as { id: string; name: string | null; business_name: string | null }[])
      .map((row) => ({ id: row.id, name: row.business_name || row.name || "Client" })),
    leads: ((leads.data ?? []) as { id: string; first_name: string | null; last_name: string | null; business_name: string | null }[])
      .map((row) => ({
        id: row.id,
        name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.business_name || "Lead",
      })),
  };
}

/** Meetings that already overlap a proposed slot, so a clash is visible. */
export async function conflictsIn(
  sb: SupabaseClient,
  startAt: string,
  endAt: string,
  ignoreId?: string | null
): Promise<MeetingWithLinks[]> {
  let query = sb
    .from("meetings").select(SELECT)
    .lt("start_at", endAt).gt("end_at", startAt)
    .in("status", OPEN_MEETING_STATUSES);
  if (ignoreId) query = query.neq("id", ignoreId);

  const { data } = await query.limit(10);
  return enrichMeetings(sb, (data ?? []) as Meeting[]);
}

export { BUSINESS_TZ };
