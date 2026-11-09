import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chicagoDate, zonedMidnightUtc } from "@/lib/time/chicago";
import { OPEN_MEETING_STATUSES } from "@/lib/meetings/config";
import { enrichMeetings } from "@/lib/meetings/queries";
import type { Meeting, MeetingWithLinks } from "@/lib/meetings/types";
import { CONSULTATION_TYPES } from "./config";
import type { HistoryFilter } from "./config";

/**
 * Reads for the Conference Center. Every number on the dashboard is a count
 * or a ratio over real `meetings`, `appointments`, `tasks` and `proposals`
 * rows. When a denominator is zero the metric is reported as null and the
 * screen says "not enough data" — it never shows an invented percentage.
 */

const DAY = 86_400_000;

function todayBounds(): { from: string; to: string; monthStart: string } {
  const today = chicagoDate();
  const start = zonedMidnightUtc(today);
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + DAY).toISOString(),
    monthStart: zonedMidnightUtc(`${today.slice(0, 7)}-01`).toISOString(),
  };
}

export type ConferenceKpis = {
  today: number;
  upcoming: number;
  pendingRequests: number;
  completedThisMonth: number;
  followUpsRequired: number;
};

export async function getConferenceKpis(sb: SupabaseClient): Promise<ConferenceKpis> {
  const { from, to, monthStart } = todayBounds();
  const nowIso = new Date().toISOString();

  const count = (r: { count: number | null; error: unknown }) => (r.error ? 0 : r.count ?? 0);

  const [today, upcoming, bookingPending, appointmentsPending, completed, followUps] = await Promise.all([
    sb.from("meetings").select("id", { count: "exact", head: true })
      .gte("start_at", from).lt("start_at", to).not("status", "in", "(cancelled,rescheduled)"),
    sb.from("meetings").select("id", { count: "exact", head: true })
      .gt("start_at", nowIso).in("status", OPEN_MEETING_STATUSES),
    // Bookings from the public page that nobody has confirmed yet.
    sb.from("meetings").select("id", { count: "exact", head: true })
      .eq("source", "booking").eq("status", "scheduled").gt("start_at", nowIso),
    // The website's older booking log (0001), still counted where it lives.
    sb.from("appointments").select("id", { count: "exact", head: true })
      .eq("status", "scheduled").gt("scheduled_at", nowIso),
    sb.from("meetings").select("id", { count: "exact", head: true })
      .eq("status", "completed").gte("start_at", monthStart),
    sb.from("meetings").select("id", { count: "exact", head: true })
      .eq("follow_up_required", true).eq("status", "completed"),
  ]);

  return {
    today: count(today),
    upcoming: count(upcoming),
    pendingRequests: count(bookingPending) + count(appointmentsPending),
    completedThisMonth: count(completed),
    followUpsRequired: count(followUps),
  };
}

/** Open conferences that have not ended yet, soonest first. */
export async function listUpcomingConferences(sb: SupabaseClient, limit = 25): Promise<MeetingWithLinks[]> {
  const { data } = await sb
    .from("meetings").select("*")
    .in("status", OPEN_MEETING_STATUSES)
    .gt("end_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(limit);
  return enrichMeetings(sb, (data ?? []) as Meeting[]);
}

export type ConsultationRequest =
  | { kind: "booking"; meeting: MeetingWithLinks }
  | {
      kind: "appointment";
      id: string;
      leadId: string | null;
      leadName: string | null;
      scheduledAt: string;
      source: string | null;
      notes: string | null;
    };

/** New public bookings awaiting confirmation, plus the legacy appointment log. */
export async function listConsultationRequests(sb: SupabaseClient): Promise<ConsultationRequest[]> {
  const nowIso = new Date().toISOString();
  const [bookings, appointments] = await Promise.all([
    sb.from("meetings").select("*")
      .eq("source", "booking").eq("status", "scheduled").gt("start_at", nowIso)
      .order("start_at", { ascending: true }).limit(25),
    sb.from("appointments").select("id, lead_id, scheduled_at, source, notes")
      .eq("status", "scheduled").gt("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true }).limit(25),
  ]);

  const enriched = bookings.error ? [] : await enrichMeetings(sb, (bookings.data ?? []) as Meeting[]);

  type ApptRow = { id: string; lead_id: string | null; scheduled_at: string; source: string | null; notes: string | null };
  const apptRows = (appointments.error ? [] : (appointments.data ?? [])) as ApptRow[];
  const leadIds = Array.from(new Set(apptRows.map((a) => a.lead_id).filter((v): v is string => Boolean(v))));
  const names = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data } = await sb.from("leads").select("id, first_name, last_name, business_name").in("id", leadIds);
    for (const row of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; business_name: string | null }[]) {
      names.set(row.id, [row.first_name, row.last_name].filter(Boolean).join(" ") || row.business_name || "Lead");
    }
  }

  return [
    ...enriched.map((meeting) => ({ kind: "booking" as const, meeting })),
    ...apptRows.map((a) => ({
      kind: "appointment" as const,
      id: a.id,
      leadId: a.lead_id,
      leadName: a.lead_id ? names.get(a.lead_id) ?? null : null,
      scheduledAt: a.scheduled_at,
      source: a.source,
      notes: a.notes,
    })),
  ];
}

export type HistoryOptions = {
  filter: HistoryFilter;
  search?: string;
  provider?: string;
  page?: number;
};

export const HISTORY_PAGE_SIZE = 25;

/** Completed, missed and cancelled conferences, newest first. */
export async function listConferenceHistory(
  sb: SupabaseClient,
  options: HistoryOptions
): Promise<{ rows: MeetingWithLinks[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const offset = (page - 1) * HISTORY_PAGE_SIZE;

  let query = sb.from("meetings").select("*", { count: "exact" });

  switch (options.filter) {
    case "completed": query = query.eq("status", "completed"); break;
    case "no_show": query = query.eq("status", "no_show"); break;
    case "cancelled": query = query.in("status", ["cancelled", "rescheduled"]); break;
    default: query = query.in("status", ["completed", "no_show", "cancelled", "rescheduled"]);
  }

  if (options.provider && ["zoom", "google_meet", "phone", "in_person"].includes(options.provider)) {
    query = query.eq("provider", options.provider);
  }

  const term = (options.search ?? "").trim();
  if (term) {
    const safe = term.replace(/[%,()*]/g, " ").slice(0, 80);
    query = query.or(
      `title.ilike.%${safe}%,attendee_name.ilike.%${safe}%,attendee_email.ilike.%${safe}%`
    );
  }

  const { data, count } = await query
    .order("start_at", { ascending: false })
    .range(offset, offset + HISTORY_PAGE_SIZE - 1);

  return { rows: await enrichMeetings(sb, (data ?? []) as Meeting[]), total: count ?? 0 };
}

// ── Analytics ────────────────────────────────────────────────────────

export type Ratio = { value: number | null; numerator: number; denominator: number };

function ratio(numerator: number, denominator: number): Ratio {
  return { value: denominator > 0 ? numerator / denominator : null, numerator, denominator };
}

export type ConferenceAnalytics = {
  windowDays: number;
  booked: number;
  completed: number;
  noShowRate: Ratio;
  followUpCompletion: Ratio;
  consultationToProposal: Ratio;
  proposalToCustomer: Ratio;
};

const WON_PROPOSAL = new Set(["accepted", "signed", "payment_pending", "paid", "converted"]);

/**
 * Sales metrics over a window, computed from rows.
 *
 *   booked                   consultation meetings created in the window
 *   completed                of those, completed
 *   no-show rate             no_show / (completed + no_show), past ones only
 *   follow-up completion     follow-up tasks from meetings, done / created
 *   consultation → proposal  consulted leads that got a proposal afterwards
 *   proposal → customer      those proposals that were accepted, signed or paid
 */
export async function getConferenceAnalytics(
  sb: SupabaseClient,
  windowDays = 90
): Promise<ConferenceAnalytics> {
  const since = new Date(Date.now() - windowDays * DAY).toISOString();

  const { data: meetingsData } = await sb
    .from("meetings")
    .select("id, lead_id, customer_id, status, start_at, follow_up_task_id, meeting_type")
    .in("meeting_type", CONSULTATION_TYPES)
    .gte("created_at", since)
    .limit(2000);

  type Row = {
    id: string; lead_id: string | null; customer_id: string | null; status: string;
    start_at: string; follow_up_task_id: string | null; meeting_type: string;
  };
  const rows = (meetingsData ?? []) as Row[];

  const booked = rows.length;
  const completedRows = rows.filter((r) => r.status === "completed");
  const noShows = rows.filter((r) => r.status === "no_show").length;

  // Follow-up completion across ALL meetings in the window, not only consultations.
  const { data: fuData } = await sb
    .from("meetings")
    .select("follow_up_task_id")
    .not("follow_up_task_id", "is", null)
    .gte("created_at", since)
    .limit(2000);
  const taskIds = ((fuData ?? []) as { follow_up_task_id: string }[]).map((r) => r.follow_up_task_id);
  let tasksDone = 0;
  if (taskIds.length > 0) {
    const { count } = await sb.from("tasks").select("id", { count: "exact", head: true })
      .in("id", taskIds).eq("status", "completed");
    tasksDone = count ?? 0;
  }

  // Consultation → proposal: for each consulted lead, the earliest completed
  // consultation, then any proposal for that lead created after it.
  const firstConsult = new Map<string, number>();
  for (const r of completedRows) {
    if (!r.lead_id) continue;
    const at = new Date(r.start_at).getTime();
    const prev = firstConsult.get(r.lead_id);
    if (prev === undefined || at < prev) firstConsult.set(r.lead_id, at);
  }

  let leadsWithProposal = 0;
  let proposalsCount = 0;
  let proposalsWon = 0;
  const leadIds = Array.from(firstConsult.keys());
  if (leadIds.length > 0) {
    const { data: proposals } = await sb
      .from("proposals")
      .select("lead_id, status, created_at")
      .in("lead_id", leadIds)
      .eq("kind", "proposal")
      .limit(2000);
    const hit = new Set<string>();
    for (const p of (proposals ?? []) as { lead_id: string; status: string; created_at: string }[]) {
      const consultAt = firstConsult.get(p.lead_id);
      if (consultAt === undefined || new Date(p.created_at).getTime() < consultAt) continue;
      hit.add(p.lead_id);
      proposalsCount += 1;
      if (WON_PROPOSAL.has(p.status)) proposalsWon += 1;
    }
    leadsWithProposal = hit.size;
  }

  return {
    windowDays,
    booked,
    completed: completedRows.length,
    noShowRate: ratio(noShows, completedRows.length + noShows),
    followUpCompletion: ratio(tasksDone, taskIds.length),
    consultationToProposal: ratio(leadsWithProposal, leadIds.length),
    proposalToCustomer: ratio(proposalsWon, proposalsCount),
  };
}

// ── Contacts for the pickers ─────────────────────────────────────────

export type ConferenceContactOption = {
  key: string;
  kind: "lead" | "client";
  leadId: string | null;
  customerId: string | null;
  companyId: string | null;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
};

/** Recent leads and clients with an email address, for "invite from CRM". */
export async function conferenceContacts(sb: SupabaseClient): Promise<ConferenceContactOption[]> {
  const [leads, customers] = await Promise.all([
    sb.from("leads")
      .select("id, first_name, last_name, business_name, email, phone, company_id")
      .eq("do_not_contact", false)
      .order("updated_at", { ascending: false })
      .limit(200),
    sb.from("customers")
      .select("id, lead_id, name, business_name, email, phone, company_id")
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  type LeadRow = { id: string; first_name: string | null; last_name: string | null; business_name: string | null; email: string | null; phone: string | null; company_id: string | null };
  type CustomerRow = { id: string; lead_id: string | null; name: string | null; business_name: string | null; email: string | null; phone: string | null; company_id: string | null };

  const clientRows = (customers.data ?? []) as CustomerRow[];
  const convertedLeads = new Set(clientRows.map((c) => c.lead_id).filter(Boolean));

  return [
    ...clientRows.map((c) => ({
      key: `client:${c.id}`,
      kind: "client" as const,
      leadId: c.lead_id,
      customerId: c.id,
      companyId: c.company_id,
      name: c.name || c.business_name || "Client",
      company: c.business_name,
      email: c.email,
      phone: c.phone,
    })),
    ...((leads.data ?? []) as LeadRow[])
      .filter((l) => !convertedLeads.has(l.id))
      .map((l) => ({
        key: `lead:${l.id}`,
        kind: "lead" as const,
        leadId: l.id,
        customerId: null,
        companyId: l.company_id,
        name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.business_name || "Lead",
        company: l.business_name,
        email: l.email,
        phone: l.phone,
      })),
  ];
}
