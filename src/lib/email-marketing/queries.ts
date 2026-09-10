import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { loadSendingHealth, type SendingHealth } from "./health";
import {
  ACTIVE_CAMPAIGN_STATUS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  rate,
  type CampaignStatus,
  type CampaignType,
} from "./types";

/**
 * Everything the Email Marketing board shows, in ONE round of queries.
 *
 * §47: the dashboard does not load every recipient, does not call the
 * provider per row, and does not recalculate in the browser. Per-campaign
 * counters come from the email_campaign_stats VIEW — one row per campaign,
 * aggregated in Postgres — and the only provider touch on this path is
 * reading whether an API key exists in the environment.
 *
 * The rule that runs through every number here: A RATE IS NULL WHEN NOTHING
 * WAS SENT. "0% open rate" on a campaign that has not gone out is a lie
 * about the business, and rate() returns null rather than telling it.
 *
 * And the other one, from §1: marketing only. Transactional mail never
 * enters these tables, so nothing here can be polluted by receipts,
 * proposals or password resets.
 */

const DAY = 86_400_000;

export type CampaignRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  campaignType: CampaignType;
  campaignTypeLabel: string;
  status: CampaignStatus;
  statusLabel: string;
  subject: string | null;

  client: { id: string; name: string } | null;
  audience: { id: string; name: string; size: number | null } | null;

  owner: string | null;
  approvalMode: string;
  approvalStatus: string;

  /** Counts, straight from the aggregate view. */
  targeted: number;
  skipped: number;
  sent: number;
  delivered: number;
  bounced: number;
  unsubscribes: number;
  pending: number;
  uniqueOpens: number;
  uniqueClicks: number;

  /** Null until something was actually sent. Never zero-as-unknown. */
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;

  scheduledAt: string | null;
  timezone: string;
  sentAt: string | null;
  failureReason: string | null;
  isArchived: boolean;
  updatedAt: string;
  createdAt: string;
};

export type EmailFilters = {
  q?: string;
  tab: "campaigns" | "sequences" | "audiences" | "templates" | "analytics";
  client?: string;
  status?: string;
  type?: string;
  audience?: string;
  owner?: string;
  days: 7 | 30 | 90 | 365;
  sort: "updated" | "scheduled" | "open" | "click" | "sent" | "client";
  view: "table" | "cards";
};

export type EmailAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
};

export type EmailBoard = {
  kpis: {
    activeCampaigns: number;
    totalCampaigns: number;
    sentThisMonth: number;
    sentLastMonth: number;
    openRate: number | null;
    clickRate: number | null;
    newSubscribers: number;
    unsubscribes: number;
    bounces: number;
    /** Bounces + unsubscribes as a share of what was sent. Null when none. */
    unhealthyRate: number | null;
  };
  campaigns: CampaignRow[];
  /** Non-archived campaigns before any filter, for the empty-state test. */
  totalCampaigns: number;
  alerts: EmailAlert[];
  health: SendingHealth;
  audienceGrowth: {
    totalSubscribers: number;
    newThisMonth: number;
    unsubscribed: number;
    netGrowth: number;
    months: { label: string; added: number }[];
  };
  topCampaign: {
    id: string;
    name: string;
    clientName: string | null;
    audienceName: string | null;
    sent: number;
    openRate: number | null;
    clickRate: number | null;
    conversions: number;
  } | null;
  counts: {
    sequences: number;
    activeSequences: number;
    pausedSequences: number;
    audiences: number;
    templates: number;
    suppressed: number;
  };
  clients: { id: string; name: string }[];
  audiences: { id: string; name: string }[];
  owners: string[];
  empty: boolean;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type CustomerLite = { id: string; name: string | null; business_name: string | null };
type AudienceLite = { id: string; name: string; cached_size: number | null };

type CampaignRaw = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  campaign_type: CampaignType;
  status: CampaignStatus;
  subject: string | null;
  owner: string | null;
  approval_mode: string;
  approval_status: string;
  scheduled_at: string | null;
  timezone: string;
  sent_at: string | null;
  failure_reason: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  audience_id: string | null;
  customers: CustomerLite | CustomerLite[] | null;
  email_audiences: AudienceLite | AudienceLite[] | null;
};

type StatsRaw = {
  campaign_id: string;
  targeted: number; skipped: number; sent: number; delivered: number;
  bounced: number; complained: number; failed: number; pending: number;
  unique_opens: number; total_opens: number;
  unique_clicks: number; total_clicks: number; unsubscribes: number;
  last_sent_at: string | null;
};

export async function loadEmailBoard(
  sb: SupabaseClient,
  filters: EmailFilters
): Promise<EmailBoard> {
  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString();
  const windowStart = new Date(now - filters.days * DAY).toISOString();
  const sixMonthsAgo = new Date(now - 182 * DAY).toISOString();

  const [
    campaigns, stats, health, sequences, audienceRows, templates,
    suppressions, monthSends, lastMonthSends, members, newLeads, conversions,
  ] = await Promise.all([
    sb
      .from("email_campaigns")
      .select(
        "id, name, slug, description, campaign_type, status, subject, owner, approval_mode, approval_status, scheduled_at, timezone, sent_at, failure_reason, is_archived, created_at, updated_at, customer_id, audience_id, customers(id, name, business_name), email_audiences(id, name, cached_size)"
      )
      .order("updated_at", { ascending: false })
      .limit(500)
      .then((r) => unwrap<CampaignRaw[]>(r, "campaigns")),
    sb.from("email_campaign_stats").select("*").then((r) => unwrap<StatsRaw[]>(r, "campaign stats")),
    loadSendingHealth(sb),
    sb
      .from("email_sequences")
      .select("id, name, status, is_archived")
      .then((r) => unwrap<{ id: string; name: string; status: string; is_archived: boolean }[]>(r, "sequences")),
    sb
      .from("email_audiences")
      .select("id, name, is_archived")
      .eq("is_archived", false)
      .order("name")
      .then((r) => unwrap<{ id: string; name: string }[]>(r, "audiences")),
    sb
      .from("email_templates")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false),
    sb.from("email_suppressions").select("id", { count: "exact", head: true }),
    sb
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", monthStart)
      .in("status", ["sent", "delivered", "bounced", "complained"]),
    sb
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", lastMonthStart)
      .lt("sent_at", monthStart)
      .in("status", ["sent", "delivered", "bounced", "complained"]),
    sb
      .from("email_audience_members")
      .select("added_at, subscribed")
      .gte("added_at", sixMonthsAgo)
      .then((r) => unwrap<{ added_at: string; subscribed: boolean }[]>(r, "audience members")),
    sb
      .from("leads")
      .select("created_at, email_consent")
      .gte("created_at", sixMonthsAgo)
      .eq("email_consent", true)
      .then((r) => unwrap<{ created_at: string; email_consent: boolean }[]>(r, "opted-in leads")),
    // Conversions are attributed invoices — real rows in the billing system,
    // never a number this module invents. §31.
    sb
      .from("invoices")
      .select("email_campaign_id, status")
      .not("email_campaign_id", "is", null)
      .then((r) => unwrap<{ email_campaign_id: string; status: string }[]>(r, "attributed invoices")),
  ]);

  const statsBy = new Map(stats.map((s) => [s.campaign_id, s] as const));
  const conversionsBy = new Map<string, number>();
  for (const invoice of conversions) {
    conversionsBy.set(invoice.email_campaign_id, (conversionsBy.get(invoice.email_campaign_id) ?? 0) + 1);
  }

  const rowsAll: CampaignRow[] = campaigns.map((c) => {
    const s = statsBy.get(c.id);
    const customer = one<CustomerLite>(c.customers);
    const audience = one<AudienceLite>(c.email_audiences);

    const sent = s?.sent ?? 0;
    const delivered = s?.delivered ?? 0;
    const uniqueOpens = s?.unique_opens ?? 0;
    const uniqueClicks = s?.unique_clicks ?? 0;

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      campaignType: c.campaign_type,
      campaignTypeLabel: CAMPAIGN_TYPE_LABELS[c.campaign_type] ?? c.campaign_type,
      status: c.status,
      statusLabel: CAMPAIGN_STATUS_LABELS[c.status] ?? c.status,
      subject: c.subject,
      client: customer
        ? { id: customer.id, name: customer.business_name || customer.name || "Client" }
        : null,
      audience: audience ? { id: audience.id, name: audience.name, size: audience.cached_size } : null,
      owner: c.owner,
      approvalMode: c.approval_mode,
      approvalStatus: c.approval_status,
      targeted: s?.targeted ?? 0,
      skipped: s?.skipped ?? 0,
      sent,
      delivered,
      bounced: s?.bounced ?? 0,
      unsubscribes: s?.unsubscribes ?? 0,
      pending: s?.pending ?? 0,
      uniqueOpens,
      uniqueClicks,
      // Delivered is the denominator for engagement, not sent: a message
      // that bounced was never in front of anybody and counting it drags
      // every rate down for a reason that has nothing to do with the copy.
      deliveryRate: rate(delivered, sent),
      openRate: rate(uniqueOpens, delivered),
      clickRate: rate(uniqueClicks, delivered),
      scheduledAt: c.scheduled_at,
      timezone: c.timezone,
      sentAt: c.sent_at,
      failureReason: c.failure_reason,
      isArchived: c.is_archived,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    };
  });

  const active = rowsAll.filter((r) => !r.isArchived);

  // ── Filtering ──────────────────────────────────────────────────────
  const needle = filters.q?.toLowerCase().trim();
  const rows = active
    .filter((r) => {
      if (needle) {
        const hay = [r.name, r.subject, r.description, r.client?.name, r.audience?.name, r.owner]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filters.client && r.client?.id !== filters.client) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.type && r.campaignType !== filters.type) return false;
      if (filters.audience && r.audience?.id !== filters.audience) return false;
      if (filters.owner && r.owner !== filters.owner) return false;
      // The date window applies to when it went out or is going out. A draft
      // has neither, so it is always shown — hiding drafts behind a date
      // filter is how people lose work they have not finished.
      const stamp = r.sentAt ?? r.scheduledAt;
      if (stamp && stamp < windowStart) return false;
      return true;
    })
    .sort(sorter(filters.sort));

  // ── KPIs ───────────────────────────────────────────────────────────
  const windowCampaigns = active.filter((r) => (r.sentAt ?? r.createdAt) >= windowStart);
  const windowDelivered = windowCampaigns.reduce((sum, r) => sum + r.delivered, 0);
  const windowOpens = windowCampaigns.reduce((sum, r) => sum + r.uniqueOpens, 0);
  const windowClicks = windowCampaigns.reduce((sum, r) => sum + r.uniqueClicks, 0);
  const windowBounces = windowCampaigns.reduce((sum, r) => sum + r.bounced, 0);
  const windowUnsubs = windowCampaigns.reduce((sum, r) => sum + r.unsubscribes, 0);
  const windowSent = windowCampaigns.reduce((sum, r) => sum + r.sent, 0);

  const membersThisMonth = members.filter((m) => m.added_at >= monthStart).length;
  const leadsThisMonth = newLeads.filter((l) => l.created_at >= monthStart).length;

  const kpis = {
    activeCampaigns: active.filter((r) => ACTIVE_CAMPAIGN_STATUS.includes(r.status)).length,
    totalCampaigns: active.length,
    sentThisMonth: monthSends.count ?? 0,
    sentLastMonth: lastMonthSends.count ?? 0,
    openRate: rate(windowOpens, windowDelivered),
    clickRate: rate(windowClicks, windowDelivered),
    newSubscribers: membersThisMonth + leadsThisMonth,
    unsubscribes: windowUnsubs,
    bounces: windowBounces,
    unhealthyRate: rate(windowBounces + windowUnsubs, windowSent),
  };

  // ── Needs attention ────────────────────────────────────────────────
  const alerts: EmailAlert[] = [];

  for (const reason of health.reasons) {
    if (reason.severity === "info") continue;
    alerts.push({
      id: `health:${reason.label}`,
      severity: reason.severity,
      title: reason.label,
      detail: reason.detail,
      href: "/admin/marketing/email?tab=analytics",
    });
  }

  for (const campaign of active) {
    if (campaign.status === "failed") {
      alerts.push({
        id: `failed:${campaign.id}`,
        severity: "critical",
        title: `${campaign.name} failed to send`,
        detail: campaign.failureReason ?? "No reason was recorded.",
        href: `/admin/marketing/email/campaigns/${campaign.id}`,
      });
    }
    if (campaign.status === "scheduled" && !campaign.audience) {
      alerts.push({
        id: `noaudience:${campaign.id}`,
        severity: "critical",
        title: `${campaign.name} is scheduled with no audience`,
        detail: "It will fail when its send time arrives. Choose an audience or unschedule it.",
        href: `/admin/marketing/email/campaigns/${campaign.id}?tab=audience`,
      });
    }
    if (campaign.status === "waiting_approval") {
      alerts.push({
        id: `approval:${campaign.id}`,
        severity: "warning",
        title: `${campaign.name} is waiting for ${campaign.approvalMode} approval`,
        detail: "It cannot be scheduled or sent until it is approved.",
        href: `/admin/marketing/email/campaigns/${campaign.id}`,
      });
    }
    if (campaign.approvalStatus === "changes_requested") {
      alerts.push({
        id: `changes:${campaign.id}`,
        severity: "warning",
        title: `${campaign.name} has changes requested`,
        detail: "Somebody reviewed this and asked for edits before it goes out.",
        href: `/admin/marketing/email/campaigns/${campaign.id}`,
      });
    }
  }

  for (const sequence of sequences) {
    if (sequence.status === "paused" && !sequence.is_archived) {
      alerts.push({
        id: `seqpaused:${sequence.id}`,
        severity: "warning",
        title: `${sequence.name} is paused`,
        detail: "Nobody enrolled in this sequence is receiving anything while it is paused.",
        href: `/admin/marketing/email?tab=sequences`,
      });
    }
  }

  alerts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  // ── Audience growth ────────────────────────────────────────────────
  const monthBuckets: { label: string; added: number }[] = [];
  for (let back = 5; back >= 0; back -= 1) {
    const start = new Date(new Date().getFullYear(), new Date().getMonth() - back, 1);
    const end = new Date(new Date().getFullYear(), new Date().getMonth() - back + 1, 1);
    const iso = (d: Date) => d.toISOString();
    const added =
      members.filter((m) => m.added_at >= iso(start) && m.added_at < iso(end)).length +
      newLeads.filter((l) => l.created_at >= iso(start) && l.created_at < iso(end)).length;
    monthBuckets.push({ label: start.toLocaleDateString("en-US", { month: "short" }), added });
  }

  const suppressedCount = suppressions.count ?? 0;
  const subscribedMembers = members.filter((m) => m.subscribed).length;

  const audienceGrowth = {
    // Everyone we hold an opted-in address for: list members plus consenting
    // leads. Counted from real rows, not a stored subscriber number.
    totalSubscribers: subscribedMembers + newLeads.length,
    newThisMonth: kpis.newSubscribers,
    unsubscribed: suppressedCount,
    netGrowth: kpis.newSubscribers - windowUnsubs,
    months: monthBuckets,
  };

  // ── Top performing ─────────────────────────────────────────────────
  // Ranked by open rate among campaigns that ACTUALLY WENT OUT to enough
  // people to mean something. A campaign sent to four people that two opened
  // is not a 50% winner, and putting it at the top of this panel would send
  // somebody off to copy the wrong thing.
  const ranked = active
    .filter((r) => r.status === "sent" && r.delivered >= 20 && r.openRate !== null)
    .sort((a, b) => (b.openRate ?? 0) - (a.openRate ?? 0));
  const best = ranked[0] ?? null;

  const topCampaign = best
    ? {
        id: best.id,
        name: best.name,
        clientName: best.client?.name ?? null,
        audienceName: best.audience?.name ?? null,
        sent: best.sent,
        openRate: best.openRate,
        clickRate: best.clickRate,
        conversions: conversionsBy.get(best.id) ?? 0,
      }
    : null;

  const clients = [
    ...new Map(active.filter((r) => r.client).map((r) => [r.client!.id, r.client!] as const)).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const owners = [...new Set(active.map((r) => r.owner).filter((v): v is string => Boolean(v)))].sort();

  return {
    kpis,
    campaigns: rows,
    totalCampaigns: active.length,
    alerts: alerts.slice(0, 8),
    health,
    audienceGrowth,
    topCampaign,
    counts: {
      sequences: sequences.filter((s) => !s.is_archived).length,
      activeSequences: sequences.filter((s) => s.status === "active").length,
      pausedSequences: sequences.filter((s) => s.status === "paused").length,
      audiences: audienceRows.length,
      templates: templates.count ?? 0,
      suppressed: suppressedCount,
    },
    clients,
    audiences: audienceRows,
    owners,
    empty: rowsAll.length === 0,
  };
}

function severityRank(severity: EmailAlert["severity"]): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}

function sorter(sort: EmailFilters["sort"]): (a: CampaignRow, b: CampaignRow) => number {
  switch (sort) {
    case "scheduled":
      return (a, b) => (a.scheduledAt ?? "￿").localeCompare(b.scheduledAt ?? "￿");
    case "open":
      // Null sorts last, not as zero: "never sent" and "nobody opened it"
      // are different facts and only one of them is a measurement.
      return (a, b) => (b.openRate ?? -1) - (a.openRate ?? -1) || a.name.localeCompare(b.name);
    case "click":
      return (a, b) => (b.clickRate ?? -1) - (a.clickRate ?? -1) || a.name.localeCompare(b.name);
    case "sent":
      return (a, b) => b.sent - a.sent || a.name.localeCompare(b.name);
    case "client":
      return (a, b) =>
        (a.client?.name ?? "￿").localeCompare(b.client?.name ?? "￿") || a.name.localeCompare(b.name);
    default:
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt);
  }
}
