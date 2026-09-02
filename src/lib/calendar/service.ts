import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Priority } from "@/lib/supabase/types";
import type { CalendarCategory, EventStatus } from "./config";
import { expandOccurrences } from "./recurrence";
import type {
  CalendarEvent, CalendarItem, CalendarSource, CalendarWindow,
} from "./types";

/**
 * getCalendarItems — the whole point of this feature.
 *
 * Nine tables already know when things happen. This reads them where they
 * live, inside one date window, and normalises them into a single shape.
 * Nothing is copied: there is exactly one row anywhere in the database that
 * says when the Key Konnect site launches, and it is the one on `jobs`.
 *
 * Every query is bounded by the window, so a week view costs a week however
 * many years of history exist.
 *
 * Adding a tenth source means writing one loader and adding it to the array
 * in getCalendarItems. Nothing else changes.
 */

const HOUR = 3600_000;

type Raw = Omit<CalendarItem, "clientName" | "projectName" | "proposalNumber">;

function item(input: {
  source: CalendarSource;
  sourceId: string;
  title: string;
  subtitle?: string | null;
  start: string;
  end?: string | null;
  allDay?: boolean;
  category: CalendarCategory;
  status?: EventStatus;
  priority?: Priority;
  clientId?: string | null;
  projectId?: string | null;
  proposalId?: string | null;
  leadId?: string | null;
  taskId?: string | null;
  assignedTo?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  href?: string | null;
  reschedulable?: boolean;
}): Raw {
  return {
    id: `${input.source}:${input.sourceId}`,
    source: input.source,
    sourceId: input.sourceId,
    title: input.title,
    subtitle: input.subtitle ?? null,
    start: input.start,
    end: input.end ?? null,
    allDay: input.allDay ?? false,
    category: input.category,
    status: input.status ?? "scheduled",
    priority: input.priority ?? "medium",
    clientId: input.clientId ?? null,
    projectId: input.projectId ?? null,
    proposalId: input.proposalId ?? null,
    leadId: input.leadId ?? null,
    taskId: input.taskId ?? null,
    assignedTo: input.assignedTo ?? null,
    location: input.location ?? null,
    meetingUrl: input.meetingUrl ?? null,
    notes: input.notes ?? null,
    href: input.href ?? null,
    reschedulable: input.reschedulable ?? false,
  };
}

/** A `date` column becomes noon UTC, so it lands on the right Chicago day. */
function fromDate(day: string): string {
  return `${day}T12:00:00.000Z`;
}

// ── 1 · calendar_events — the only rows the calendar owns ────────────

async function loadEvents(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  // Two queries rather than one `or`: a recurring event that started years
  // ago still belongs in this week, so it cannot be found by a range scan.
  const [{ data: inWindow }, { data: recurring }] = await Promise.all([
    sb.from("calendar_events").select("*")
      .is("recurrence_rule", null)
      .gte("start_at", win.fromIso).lt("start_at", win.toIso)
      .limit(500),
    sb.from("calendar_events").select("*")
      .not("recurrence_rule", "is", null)
      .lt("start_at", win.toIso)
      .limit(200),
  ]);

  const rows = [...((inWindow ?? []) as CalendarEvent[]), ...((recurring ?? []) as CalendarEvent[])];
  const windowFrom = new Date(win.fromIso);
  const windowTo = new Date(win.toIso);
  const out: Raw[] = [];

  for (const row of rows) {
    const start = new Date(row.start_at);
    const durationMs = row.end_at
      ? new Date(row.end_at).getTime() - start.getTime()
      : row.all_day ? 0 : HOUR;

    const occurrences = expandOccurrences({
      start,
      durationMs,
      rule: row.recurrence_rule,
      recurrenceUntil: row.recurrence_until ? new Date(row.recurrence_until) : null,
      windowFrom,
      windowTo,
    });

    for (const at of occurrences) {
      // A repeated occurrence carries the date in its id, so two Mondays of
      // the same standing meeting are two rows the UI can key on.
      const suffix = row.recurrence_rule ? `@${at.toISOString().slice(0, 10)}` : "";
      out.push(item({
        source: "event",
        sourceId: `${row.id}${suffix}`,
        title: row.title,
        subtitle: row.description?.split("\n")[0] ?? null,
        start: at.toISOString(),
        end: durationMs > 0 ? new Date(at.getTime() + durationMs).toISOString() : null,
        allDay: row.all_day,
        category: row.event_type,
        status: row.status,
        priority: row.priority,
        clientId: row.client_id,
        projectId: row.project_id,
        proposalId: row.proposal_id,
        leadId: row.lead_id,
        taskId: row.task_id,
        assignedTo: row.assigned_to,
        location: row.location,
        meetingUrl: row.meeting_url,
        notes: row.description,
        // A single occurrence of a repeating series cannot be moved on its
        // own — that needs an exception row, which this does not yet have.
        reschedulable: !row.recurrence_rule,
      }));
    }
  }

  return out;
}

// ── 2 · tasks ───────────────────────────────────────────────────────

/** A task's business area decides which calendar colour it wears. */
const TASK_CATEGORY: Record<string, CalendarCategory> = {
  launch: "launch",
  content: "content",
  sales: "sales_followup",
  proposal: "proposal",
  hosting: "hosting",
  domain: "domain",
  internal: "internal",
};

async function loadTasks(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  const { data } = await sb
    .from("tasks")
    .select("id, title, notes, type, status, priority, due_at, due_time, estimated_hours, owner, customer_id, job_id, proposal_id, lead_id")
    .eq("is_template", false)
    .not("status", "in", "(canceled)")
    .gte("due_at", win.fromIso)
    .lt("due_at", win.toIso)
    .limit(500);

  type Row = {
    id: string; title: string; notes: string | null; type: string;
    status: string; priority: Priority; due_at: string; due_time: string | null;
    estimated_hours: number | null; owner: string | null;
    customer_id: string | null; job_id: string | null;
    proposal_id: string | null; lead_id: string | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    // A task with a time on it is a block of work. One without is a deadline,
    // and belongs in the all-day strip rather than pinned to an invented hour.
    const timed = Boolean(row.due_time);
    const start = new Date(row.due_at);
    const durationMs = Math.max(0.5, row.estimated_hours ?? 1) * HOUR;

    return item({
      source: "task",
      sourceId: row.id,
      title: row.title,
      subtitle: row.notes?.split("\n")[0] ?? null,
      start: timed ? start.toISOString() : row.due_at,
      end: timed ? new Date(start.getTime() + durationMs).toISOString() : null,
      allDay: !timed,
      category: TASK_CATEGORY[row.type] ?? "task",
      status: row.status === "completed" ? "completed"
            : row.status === "in_progress" ? "in_progress"
            : row.status === "waiting" || row.status === "blocked" ? "waiting"
            : "scheduled",
      priority: row.priority,
      clientId: row.customer_id,
      projectId: row.job_id,
      proposalId: row.proposal_id,
      leadId: row.lead_id,
      taskId: row.id,
      assignedTo: row.owner,
      notes: row.notes,
      href: `/admin/tasks?task=${row.id}`,
      reschedulable: true,
    });
  });
}

// ── 3 · jobs — kickoff, target delivery, launch ─────────────────────

async function loadJobs(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  const { data } = await sb
    .from("jobs")
    .select("id, title, business_name, stage, customer_id, started_at, due_at, launched_at")
    .or(
      [
        `and(started_at.gte.${win.fromIso},started_at.lt.${win.toIso})`,
        `and(due_at.gte.${win.fromIso},due_at.lt.${win.toIso})`,
        `and(launched_at.gte.${win.fromIso},launched_at.lt.${win.toIso})`,
      ].join(",")
    )
    .limit(300);

  type Row = {
    id: string; title: string; business_name: string | null; stage: string;
    customer_id: string | null; started_at: string | null;
    due_at: string | null; launched_at: string | null;
  };

  const out: Raw[] = [];
  const within = (at: string | null) =>
    Boolean(at && at >= win.fromIso && at < win.toIso);

  for (const row of (data ?? []) as Row[]) {
    const done = row.stage === "Complete";

    if (within(row.started_at)) {
      out.push(item({
        source: "job_start", sourceId: row.id,
        title: "Project Kickoff", subtitle: row.business_name ?? row.title,
        start: row.started_at as string, allDay: true,
        category: "project", status: done ? "completed" : "scheduled",
        clientId: row.customer_id, projectId: row.id,
        href: `/admin/jobs/${row.id}`, reschedulable: true,
      }));
    }
    if (within(row.due_at)) {
      out.push(item({
        source: "job_due", sourceId: row.id,
        title: `Target delivery: ${row.business_name ?? row.title}`,
        subtitle: `Stage: ${row.stage}`,
        start: row.due_at as string, allDay: true,
        category: "milestone", status: done ? "completed" : "scheduled",
        priority: "high",
        clientId: row.customer_id, projectId: row.id,
        href: `/admin/jobs/${row.id}`, reschedulable: true,
      }));
    }
    if (within(row.launched_at)) {
      out.push(item({
        source: "job_launch", sourceId: row.id,
        title: `Website Launch: ${row.business_name ?? row.title}`,
        subtitle: row.title,
        start: row.launched_at as string, allDay: true,
        category: "launch", status: "completed", priority: "critical",
        clientId: row.customer_id, projectId: row.id,
        href: `/admin/jobs/${row.id}`, reschedulable: true,
      }));
    }
  }

  return out;
}

// ── 4 · proposals — when one stops being open ───────────────────────

async function loadProposals(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  const fromDay = win.fromIso.slice(0, 10);
  const toDay = win.toIso.slice(0, 10);

  const { data } = await sb
    .from("proposals")
    .select("id, proposal_number, title, client_business_name, valid_until, status, owner, customer_id, lead_id, total_cents")
    // Only proposals still in play. A signed, paid or declined one has no
    // follow-up left to do, and leaving its date on the calendar would be
    // exactly the stale event the spec warns about.
    .in("status", ["sent", "viewed", "accepted"])
    .gte("valid_until", fromDay)
    .lt("valid_until", toDay)
    .limit(200);

  type Row = {
    id: string; proposal_number: string; title: string;
    client_business_name: string | null; valid_until: string; status: string;
    owner: string | null; customer_id: string | null; lead_id: string | null;
    total_cents: number;
  };

  return ((data ?? []) as Row[]).map((row) => item({
    source: "proposal",
    sourceId: row.id,
    title: `Follow up: ${row.client_business_name ?? row.title}`,
    subtitle: `${row.proposal_number} · $${(row.total_cents / 100).toLocaleString("en-US")} · expires`,
    start: fromDate(row.valid_until),
    allDay: true,
    category: "proposal",
    priority: "high",
    clientId: row.customer_id,
    proposalId: row.id,
    leadId: row.lead_id,
    assignedTo: row.owner,
    href: `/admin/proposals/${row.id}`,
    // The expiry date is a commercial term on a document that may already
    // have been sent. Changing it belongs on the proposal, not by dragging.
    reschedulable: false,
  }));
}

// ── 5 · leads — the next follow-up somebody set ─────────────────────

async function loadLeadFollowups(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  const { data } = await sb
    .from("leads")
    .select("id, first_name, last_name, business_name, lead_status, next_followup_at, owner")
    .not("lead_status", "in", "(Won,Lost)")
    .eq("do_not_contact", false)
    .gte("next_followup_at", win.fromIso)
    .lt("next_followup_at", win.toIso)
    .limit(300);

  type Row = {
    id: string; first_name: string | null; last_name: string | null;
    business_name: string | null; lead_status: string;
    next_followup_at: string; owner: string | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || "lead";
    return item({
      source: "lead_followup",
      sourceId: row.id,
      title: `Follow up: ${name}`,
      subtitle: row.business_name ?? row.lead_status,
      start: row.next_followup_at,
      end: new Date(new Date(row.next_followup_at).getTime() + HOUR / 2).toISOString(),
      category: "sales_followup",
      assignedTo: row.owner,
      leadId: row.id,
      href: `/admin/leads/${row.id}`,
      reschedulable: true,
    });
  });
}

// ── 6 · lead_followups — the automated 24h/72h sequence ─────────────

async function loadFollowupSteps(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  const { data } = await sb
    .from("lead_followups")
    .select("id, lead_id, step, channel, due_at, status, leads(first_name, last_name, business_name)")
    .eq("status", "pending")
    .gte("due_at", win.fromIso)
    .lt("due_at", win.toIso)
    .limit(200);

  type LeadLite = { first_name: string | null; last_name: string | null; business_name: string | null };
  type Row = {
    id: string; lead_id: string; step: string; channel: string;
    due_at: string; leads: LeadLite | LeadLite[] | null;
  };

  const labels: Record<string, string> = {
    confirmation: "Confirmation email",
    followup_24h: "24-hour follow-up",
    followup_72h: "72-hour follow-up",
  };

  return ((data ?? []) as Row[]).map((row) => {
    const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ")
      || lead?.business_name || "a lead";
    return item({
      source: "followup_step",
      sourceId: row.id,
      title: `${labels[row.step] ?? row.step} — ${name}`,
      subtitle: `Automated ${row.channel}`,
      start: row.due_at,
      allDay: false,
      category: "sales_followup",
      leadId: row.lead_id,
      href: `/admin/leads/${row.lead_id}`,
      // The sequence engine owns this date. Dragging it here would put the
      // calendar and the cron in disagreement about when the email goes.
      reschedulable: false,
    });
  });
}

// ── 7 · appointments — meetings booked through the site ─────────────

async function loadAppointments(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  const { data } = await sb
    .from("appointments")
    .select("id, lead_id, scheduled_at, status, source, notes, leads(first_name, last_name, business_name)")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", win.fromIso)
    .lt("scheduled_at", win.toIso)
    .limit(200);

  type LeadLite = { first_name: string | null; last_name: string | null; business_name: string | null };
  type Row = {
    id: string; lead_id: string | null; scheduled_at: string;
    status: string; source: string; notes: string | null;
    leads: LeadLite | LeadLite[] | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ")
      || lead?.business_name || "Client";
    return item({
      source: "appointment",
      sourceId: row.id,
      title: `Call ${name}`,
      subtitle: lead?.business_name ?? `Booked via ${row.source}`,
      start: row.scheduled_at,
      end: new Date(new Date(row.scheduled_at).getTime() + HOUR).toISOString(),
      category: "meeting",
      status: row.status === "completed" ? "completed"
            : row.status === "cancelled" || row.status === "no_show" ? "canceled"
            : "scheduled",
      leadId: row.lead_id,
      notes: row.notes,
      href: row.lead_id ? `/admin/leads/${row.lead_id}` : null,
      reschedulable: true,
    });
  });
}

// ── 8 · social_posts — the content calendar ─────────────────────────

async function loadContent(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  const { data } = await sb
    .from("social_posts")
    .select("id, platform, body, scheduled_at, published_at, status, campaign")
    .or(
      [
        `and(scheduled_at.gte.${win.fromIso},scheduled_at.lt.${win.toIso})`,
        `and(published_at.gte.${win.fromIso},published_at.lt.${win.toIso})`,
      ].join(",")
    )
    .limit(300);

  type Row = {
    id: string; platform: string; body: string;
    scheduled_at: string | null; published_at: string | null;
    status: string; campaign: string | null;
  };

  const platforms: Record<string, string> = {
    facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn",
    tiktok: "TikTok", youtube: "YouTube", google_business: "Google Business",
  };

  return ((data ?? []) as Row[])
    .map((row) => {
      const at = row.published_at ?? row.scheduled_at;
      if (!at || at < win.fromIso || at >= win.toIso) return null;
      return item({
        source: "content",
        sourceId: row.id,
        title: `${platforms[row.platform] ?? row.platform} post`,
        subtitle: row.body.slice(0, 90) || row.campaign,
        start: at,
        end: new Date(new Date(at).getTime() + HOUR / 2).toISOString(),
        category: "content",
        status: row.status === "published" ? "completed"
              : row.status === "failed" ? "waiting" : "scheduled",
        notes: row.body,
        href: "/admin/marketing/content",
        // Published is history. Only something still waiting to go can move.
        reschedulable: row.status === "scheduled" || row.status === "draft",
      });
    })
    .filter((row): row is Raw => row !== null);
}

// ── 9 · renewals — domains, hosting, SSL and subscriptions ──────────

async function loadRenewals(sb: SupabaseClient, win: CalendarWindow): Promise<Raw[]> {
  const fromDay = win.fromIso.slice(0, 10);
  const toDay = win.toIso.slice(0, 10);

  const [{ data: renewals }, { data: subscriptions }] = await Promise.all([
    sb.from("website_renewals")
      .select("id, website_id, kind, renews_at, amount_cents, vendor, websites(name, domain, customer_id)")
      .gte("renews_at", fromDay).lt("renews_at", toDay)
      .limit(200),
    sb.from("customers")
      .select("id, business_name, name, renews_at, renewal_amount_cents")
      .eq("status", "active")
      .not("renews_at", "is", null)
      .gte("renews_at", fromDay).lt("renews_at", toDay)
      .limit(200),
  ]);

  type SiteLite = { name: string | null; domain: string | null; customer_id: string | null };
  type RenewalRow = {
    id: string; website_id: string; kind: string; renews_at: string;
    amount_cents: number | null; vendor: string | null;
    websites: SiteLite | SiteLite[] | null;
  };
  type SubRow = {
    id: string; business_name: string | null; name: string | null;
    renews_at: string; renewal_amount_cents: number | null;
  };

  const labels: Record<string, string> = {
    domain: "Domain renewal", hosting: "Hosting renewal", ssl: "SSL expires",
    maintenance: "Maintenance renewal", saas: "SaaS renewal", support: "Support renewal",
  };

  const out: Raw[] = ((renewals ?? []) as RenewalRow[]).map((row) => {
    const site = Array.isArray(row.websites) ? row.websites[0] : row.websites;
    return item({
      source: "renewal",
      sourceId: row.id,
      title: `${labels[row.kind] ?? "Renewal"}: ${site?.domain ?? site?.name ?? "site"}`,
      subtitle: [row.vendor, row.amount_cents ? `$${(row.amount_cents / 100).toFixed(0)}` : null]
        .filter(Boolean).join(" · ") || null,
      start: fromDate(row.renews_at),
      allDay: true,
      category: row.kind === "domain" ? "domain" : "hosting",
      clientId: site?.customer_id ?? null,
      href: "/admin/hosting",
      // A registrar's expiry date is a fact, not a plan.
      reschedulable: false,
    });
  });

  for (const row of (subscriptions ?? []) as SubRow[]) {
    out.push(item({
      source: "renewal",
      sourceId: `customer-${row.id}`,
      title: `Subscription renews: ${row.business_name ?? row.name ?? "client"}`,
      subtitle: row.renewal_amount_cents
        ? `$${(row.renewal_amount_cents / 100).toFixed(0)}`
        : null,
      start: fromDate(row.renews_at),
      allDay: true,
      category: "hosting",
      clientId: row.id,
      href: `/admin/clients/${row.id}`,
      reschedulable: false,
    }));
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// The aggregator
// ═══════════════════════════════════════════════════════════════════════

export type CalendarQuery = {
  /** Filter keys from CALENDAR_FILTERS that are switched ON. Empty = all. */
  categories?: CalendarCategory[];
  /** Only items assigned to these people. Empty = everyone. */
  owners?: string[];
  /** True when "My Schedule" is the only thing ticked. */
  mineOnly?: string | null;
};

/**
 * Everything happening in a window, from every source, in one array.
 *
 * The nine loaders run in parallel and none of them can break the others: a
 * source that throws contributes nothing rather than emptying the calendar.
 * A table that does not exist yet in some environment behaves the same way.
 */
export async function getCalendarItems(
  sb: SupabaseClient,
  win: CalendarWindow,
  query: CalendarQuery = {}
): Promise<CalendarItem[]> {
  const loaders: [string, Promise<Raw[]>][] = [
    ["events", loadEvents(sb, win)],
    ["tasks", loadTasks(sb, win)],
    ["jobs", loadJobs(sb, win)],
    ["proposals", loadProposals(sb, win)],
    ["leads", loadLeadFollowups(sb, win)],
    ["followups", loadFollowupSteps(sb, win)],
    ["appointments", loadAppointments(sb, win)],
    ["content", loadContent(sb, win)],
    ["renewals", loadRenewals(sb, win)],
  ];

  const settled = await Promise.allSettled(loaders.map(([, promise]) => promise));
  const raw: Raw[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") raw.push(...result.value);
    else console.error(`Calendar source "${loaders[index][0]}" failed:`, result.reason);
  });

  const filtered = raw.filter((row) => {
    if (query.categories && query.categories.length > 0
        && !query.categories.includes(row.category)) return false;
    if (query.mineOnly && row.assignedTo !== query.mineOnly) return false;
    if (query.owners && query.owners.length > 0) {
      // "Unassigned" is a real answer, not a missing one.
      const key = row.assignedTo ?? "__unassigned__";
      if (!query.owners.includes(key)) return false;
    }
    return true;
  });

  return enrich(sb, filtered);
}

/** Names for the ids the loaders collected, in three queries rather than N. */
async function enrich(sb: SupabaseClient, rows: Raw[]): Promise<CalendarItem[]> {
  const ids = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((value): value is string => Boolean(value))));

  const clientIds = ids(rows.map((row) => row.clientId));
  const projectIds = ids(rows.map((row) => row.projectId));
  const proposalIds = ids(rows.map((row) => row.proposalId));

  const [clients, projects, proposals] = await Promise.all([
    clientIds.length === 0 ? Promise.resolve(new Map<string, string>()) :
      sb.from("customers").select("id, business_name, name").in("id", clientIds)
        .then((r) => new Map(((r.data ?? []) as { id: string; business_name: string | null; name: string | null }[])
          .map((row) => [row.id, row.business_name || row.name || ""]))),
    projectIds.length === 0 ? Promise.resolve(new Map<string, string>()) :
      sb.from("jobs").select("id, title, business_name").in("id", projectIds)
        .then((r) => new Map(((r.data ?? []) as { id: string; title: string | null; business_name: string | null }[])
          .map((row) => [row.id, row.title || row.business_name || ""]))),
    proposalIds.length === 0 ? Promise.resolve(new Map<string, string>()) :
      sb.from("proposals").select("id, proposal_number").in("id", proposalIds)
        .then((r) => new Map(((r.data ?? []) as { id: string; proposal_number: string }[])
          .map((row) => [row.id, row.proposal_number]))),
  ]);

  return rows
    .map((row) => ({
      ...row,
      clientName: row.clientId ? clients.get(row.clientId) || null : null,
      projectName: row.projectId ? projects.get(row.projectId) || null : null,
      proposalNumber: row.proposalId ? proposals.get(row.proposalId) || null : null,
    }))
    .sort((a, b) => {
      // All-day items sit above the timed grid, so they sort first.
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.localeCompare(b.start);
    });
}

/** One item by its composite id, for the detail drawer. */
export function findItem(items: CalendarItem[], id: string): CalendarItem | null {
  return items.find((item) => item.id === id) ?? null;
}

/**
 * The two panels under the grid.
 *
 * Deliberately a separate, small window rather than a filter over whatever
 * the grid happens to be showing — "Today" has to say today even when you are
 * looking at next month.
 */
export async function loadTodayAndUpcoming(
  sb: SupabaseClient,
  today: string
): Promise<{ today: CalendarItem[]; upcoming: CalendarItem[] }> {
  const { startOfDay, addDays } = await import("./window");

  const todayWindow: CalendarWindow = {
    fromIso: startOfDay(today).toISOString(),
    toIso: startOfDay(addDays(today, 1)).toISOString(),
    days: [today],
    label: "Today",
  };
  const aheadWindow: CalendarWindow = {
    fromIso: startOfDay(addDays(today, 1)).toISOString(),
    toIso: startOfDay(addDays(today, 15)).toISOString(),
    days: [],
    label: "Coming up",
  };

  const [todayItems, aheadItems] = await Promise.all([
    getCalendarItems(sb, todayWindow),
    getCalendarItems(sb, aheadWindow),
  ]);

  // Coming Up is the things that matter, not everything with a date. A
  // fortnight of every routine task would bury the launch it sits next to.
  const IMPORTANT: CalendarCategory[] = [
    "launch", "milestone", "meeting", "proposal", "sales_followup", "project",
  ];
  const upcoming = aheadItems
    .filter((row) =>
      row.status !== "completed" && row.status !== "canceled" &&
      (IMPORTANT.includes(row.category) ||
        row.priority === "critical" || row.priority === "high"))
    .slice(0, 8);

  return {
    today: todayItems.filter((row) => row.status !== "canceled"),
    upcoming,
  };
}

/** Events today — what the sidebar badge counts. */
export async function loadTodayCount(sb: SupabaseClient, today: string): Promise<number> {
  const { startOfDay, addDays } = await import("./window");
  const items = await getCalendarItems(sb, {
    fromIso: startOfDay(today).toISOString(),
    toIso: startOfDay(addDays(today, 1)).toISOString(),
    days: [today],
    label: "Today",
  });
  return items.filter((row) => row.status !== "completed" && row.status !== "canceled").length;
}

/** Everyone who has something scheduled, for the team filter. */
export async function loadCalendarPeople(sb: SupabaseClient): Promise<string[]> {
  const [tasks, events] = await Promise.all([
    sb.from("tasks").select("owner").eq("is_template", false)
      .not("owner", "is", null).limit(500),
    sb.from("calendar_events").select("assigned_to")
      .not("assigned_to", "is", null).limit(500),
  ]);

  return Array.from(new Set([
    ...((tasks.data ?? []) as { owner: string | null }[]).map((row) => row.owner),
    ...((events.data ?? []) as { assigned_to: string | null }[]).map((row) => row.assigned_to),
  ].filter((value): value is string => Boolean(value)))).sort();
}
