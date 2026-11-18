import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chicagoDate, zonedMidnightUtc } from "@/lib/time/chicago";
import { EXCLUDED_STATUSES, JUNK_FILTER, REVENUE_CATEGORIES } from "@/lib/supabase/types";
import { loadFinanceOverview } from "@/lib/finance/overview";
import { bankClientRevenue } from "@/lib/clients/bank-match";

/**
 * Lead analytics: where leads come from, how far each one gets, how fast
 * they're answered, and which sources turn into paying clients.
 *
 * Spam and Test leads are excluded everywhere (counted only so the page can
 * say how many were hidden). "How far a lead got" is the furthest stage it
 * ever reached — read from its status history — so a lead that was Qualified
 * and then Lost still counts as qualified. Revenue follows a lead into the
 * client record it became (customers.lead_id), using the same client revenue
 * the Clients page shows (Mercury deposits when the bank feed is on).
 */

export type LeadRange = "30d" | "90d" | "ytd" | "12m" | "all";
export const LEAD_RANGE_LABELS: Record<LeadRange, string> = { "30d": "30 days", "90d": "90 days", ytd: "Year to date", "12m": "12 months", all: "All time" };
export type Dimension = "channel" | "campaign" | "service" | "landing";
export const DIMENSION_LABELS: Record<Dimension, string> = { channel: "Channel", campaign: "Campaign", service: "Service wanted", landing: "Landing page" };

/** Funnel order. Contact Attempted counts as reached-out, not as reached. */
const RANK: Record<string, number> = {
  New: 0, "Follow Up Later": 0, "Contact Attempted": 1, Contacted: 2, Qualified: 3, "Demo Scheduled": 4, "Proposal/Checkout Sent": 5, Won: 6,
};
export const STAGES = [
  { key: "leads", label: "Leads", min: 0 },
  { key: "contacted", label: "Talked to", min: 2 },
  { key: "qualified", label: "Qualified", min: 3 },
  { key: "proposal", label: "Proposal sent", min: 5 },
  { key: "won", label: "Won", min: 6 },
] as const;

export type BreakdownRow = {
  key: string;
  leads: number;
  contacted: number;
  qualified: number;
  won: number;
  revenueCents: number;
  spendCents: number | null;
};

export type LeadAnalytics = {
  range: LeadRange;
  dimension: Dimension;
  from: string;
  to: string;
  total: number;
  previousTotal: number | null;
  hidden: number;
  funnel: Array<{ key: string; label: string; count: number }>;
  won: number;
  lost: number;
  open: number;
  medianResponseMins: number | null;
  respondedCount: number;
  revenueCents: number;
  linkedClients: number;
  spendCents: number;
  breakdown: BreakdownRow[];
  trend: Array<{ label: string; count: number }>;
  trendUnit: "week" | "month";
  lostReasons: Array<{ key: string; count: number }>;
  statusNow: Array<{ key: string; count: number }>;
  recent: Array<{ id: string; name: string; channel: string; status: string; created: string; reached: string }>;
};

type Lead = {
  id: string; created_at: string; first_name: string | null; last_name: string | null; business_name: string | null;
  source: string | null; campaign: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  fbclid: string | null; gclid: string | null; landing_page: string | null; services_interested: string[] | null;
  lead_status: string; lost_reason: string | null;
};

const CHANNEL_NAMES: Record<string, string> = {
  "contact-form": "Website form", website: "Website", facebook: "Facebook", fb: "Facebook", instagram: "Instagram", ig: "Instagram",
  whatsapp: "WhatsApp", google: "Google", linkedin: "LinkedIn", x: "X", twitter: "X", referral: "Referral", email: "Email",
  "meta-lead-ad": "Meta lead ad", meta: "Meta ads", tiktok: "TikTok", youtube: "YouTube", phone: "Phone", sms: "Text",
};
const title = (s: string) => s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

function channelOf(l: Lead): string {
  if (l.gclid) return "Google ads";
  const raw = (l.utm_source || l.source || "").trim().toLowerCase();
  if (l.fbclid && (!raw || raw === "facebook" || raw === "instagram")) return l.utm_medium?.match(/paid|cpc|ad/) ? "Meta ads" : CHANNEL_NAMES[raw] ?? "Facebook";
  if (!raw) return "Unknown";
  return CHANNEL_NAMES[raw] ?? title(raw);
}
const campaignOf = (l: Lead) => (l.campaign || l.utm_campaign || "").trim() || "No campaign";
const landingOf = (l: Lead) => {
  const p = (l.landing_page || "").trim();
  if (!p) return "Unknown";
  try { return new URL(p, "https://www.tomorrowstechai.com").pathname || "/"; } catch { return p.slice(0, 60); }
};
const servicesOf = (l: Lead) => {
  const list = (l.services_interested ?? []).map((s) => title(s.toLowerCase())).filter(Boolean);
  return list.length ? [...new Set(list)] : ["Not stated"];
};

function rangeStart(range: LeadRange, today: string): string | null {
  const [y, m, d] = today.split("-").map(Number);
  if (range === "all") return null;
  if (range === "ytd") return `${y}-01-01`;
  const back = range === "30d" ? 29 : range === "90d" ? 89 : 364;
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export async function loadLeadAnalytics(sb: SupabaseClient, range: LeadRange, dimension: Dimension): Promise<LeadAnalytics> {
  const today = chicagoDate();
  const from = rangeStart(range, today);
  const fromIso = from ? zonedMidnightUtc(from).toISOString() : null;
  const LEAD_COLS = "id, created_at, first_name, last_name, business_name, source, campaign, utm_source, utm_medium, utm_campaign, fbclid, gclid, landing_page, services_interested, lead_status, lost_reason";

  let leadsQ = sb.from("leads").select(LEAD_COLS).not("lead_status", "in", JUNK_FILTER).order("created_at", { ascending: true }).limit(10000);
  let junkQ = sb.from("leads").select("id", { count: "exact", head: true }).in("lead_status", EXCLUDED_STATUSES);
  let spendQ = sb.from("campaign_spend").select("date, campaign, spend_cents");
  if (fromIso) { leadsQ = leadsQ.gte("created_at", fromIso); junkQ = junkQ.gte("created_at", fromIso); spendQ = spendQ.gte("date", from!); }

  // Previous period of the same length, for the change on the Leads tile.
  let prevQ: PromiseLike<{ count: number | null }> | null = null;
  if (from && range !== "ytd") {
    const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
    const prevFrom = new Date(Date.parse(`${from}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
    prevQ = sb.from("leads").select("id", { count: "exact", head: true }).not("lead_status", "in", JUNK_FILTER)
      .gte("created_at", zonedMidnightUtc(prevFrom).toISOString()).lt("created_at", fromIso!);
  }

  const [leadsR, junkR, spendR, prevR, customersR] = await Promise.all([
    leadsQ, junkQ, spendQ, prevQ ?? Promise.resolve({ count: null }),
    sb.from("customers").select("id, name, business_name, lead_id").not("lead_id", "is", null),
  ]);
  if (leadsR.error) throw new Error(leadsR.error.message);
  const leads = (leadsR.data ?? []) as Lead[];
  const ids = leads.map((l) => l.id);

  // Status history + first response, in chunks so a big range stays one URL.
  const events: Array<{ lead_id: string; created_at: string; type: string; body: string | null }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from("lead_events").select("lead_id, created_at, type, body")
      .in("lead_id", ids.slice(i, i + 200)).in("type", ["status_change", "email_sent", "followup_sent", "note", "call", "sms_sent"]);
    if (error) throw new Error(error.message);
    events.push(...(data ?? []));
  }
  const byLead = new Map<string, typeof events>();
  for (const e of events) byLead.set(e.lead_id, [...(byLead.get(e.lead_id) ?? []), e]);

  // Revenue a lead turned into, through the client it became.
  const customers = customersR.data ?? [];
  const revenueByLead = new Map<string, number>();
  if (customers.length) {
    // Same client as the rest of this loader, so it also works from a cron (no cookies).
    const fin = await loadFinanceOverview(sb, "12m");
    let rows: Array<{ customer_id: string; amount_cents: number }> = [];
    if (fin.source === "bank") {
      const { data: services } = await sb.from("client_services").select("customer_id, status, catalog_items(category)").in("customer_id", customers.map((c) => c.id));
      const { data: allCustomers } = await sb.from("customers").select("id, name, business_name");
      rows = bankClientRevenue(fin.bankTxns, allCustomers ?? [], (services ?? []) as never, REVENUE_CATEGORIES);
    } else {
      const { data } = await sb.from("revenue_events").select("customer_id, amount_cents").in("customer_id", customers.map((c) => c.id));
      rows = (data ?? []) as typeof rows;
    }
    const leadOfCustomer = new Map(customers.map((c) => [c.id, c.lead_id as string]));
    for (const r of rows) {
      const lead = leadOfCustomer.get(r.customer_id);
      if (lead) revenueByLead.set(lead, (revenueByLead.get(lead) ?? 0) + r.amount_cents);
    }
  }

  const rankOf = (s: string) => RANK[s] ?? 0;
  const enriched = leads.map((l) => {
    const evs = (byLead.get(l.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    let reached = rankOf(l.lead_status);
    for (const e of evs) {
      if (e.type !== "status_change" || !e.body) continue;
      const to = e.body.split("->")[1]?.replace(/\(.*$/, "").replace(/\.$/, "").trim();
      if (to) reached = Math.max(reached, rankOf(to));
    }
    const first = evs.find((e) => e.created_at >= l.created_at);
    const responseMins = first ? (Date.parse(first.created_at) - Date.parse(l.created_at)) / 60_000 : null;
    return { l, reached, responseMins, revenue: revenueByLead.get(l.id) ?? 0 };
  });

  const count = (min: number) => enriched.filter((e) => e.reached >= min).length;

  // Breakdown by the chosen dimension. A lead wanting two services counts in both.
  const keysOf = (l: Lead) => dimension === "channel" ? [channelOf(l)] : dimension === "campaign" ? [campaignOf(l)] : dimension === "landing" ? [landingOf(l)] : servicesOf(l);
  const spend = (spendR.data ?? []) as Array<{ campaign: string | null; spend_cents: number }>;
  const spendCents = spend.reduce((t, s) => t + (s.spend_cents ?? 0), 0);
  const spendByCampaign = new Map<string, number>();
  for (const s of spend) { const k = s.campaign || "No campaign"; spendByCampaign.set(k, (spendByCampaign.get(k) ?? 0) + s.spend_cents); }

  const rows = new Map<string, BreakdownRow>();
  for (const e of enriched) {
    for (const key of keysOf(e.l)) {
      const r = rows.get(key) ?? { key, leads: 0, contacted: 0, qualified: 0, won: 0, revenueCents: 0, spendCents: null };
      r.leads++;
      if (e.reached >= 2) r.contacted++;
      if (e.reached >= 3) r.qualified++;
      if (e.reached >= 6) r.won++;
      r.revenueCents += e.revenue;
      rows.set(key, r);
    }
  }
  if (dimension === "campaign") for (const [k, cents] of spendByCampaign) {
    const r = rows.get(k) ?? { key: k, leads: 0, contacted: 0, qualified: 0, won: 0, revenueCents: 0, spendCents: null };
    r.spendCents = (r.spendCents ?? 0) + cents;
    rows.set(k, r);
  }

  // Trend: weekly up to ~6 months, monthly beyond.
  const start = from ?? (leads[0] ? chicagoDate(new Date(leads[0].created_at)) : today);
  const spanDays = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000;
  const trendUnit: "week" | "month" = spanDays > 190 ? "month" : "week";
  const bucket = (day: string) => {
    if (trendUnit === "month") return day.slice(0, 7);
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
    return d.toISOString().slice(0, 10);
  };
  const buckets = new Map<string, number>();
  for (let cur = bucket(start); cur <= today; ) {
    buckets.set(cur, 0);
    const d = new Date(`${cur.length === 7 ? `${cur}-01` : cur}T12:00:00Z`);
    if (trendUnit === "month") d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCDate(d.getUTCDate() + 7);
    cur = trendUnit === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
  }
  for (const l of leads) { const k = bucket(chicagoDate(new Date(l.created_at))); buckets.set(k, (buckets.get(k) ?? 0) + 1); }
  const trend = [...buckets.entries()].map(([k, c]) => ({
    label: trendUnit === "month"
      ? new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
      : new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    count: c,
  }));

  const tally = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].map(([key, c]) => ({ key, count: c })).sort((a, b) => b.count - a.count);
  };
  const stageName = (r: number) => Object.entries(RANK).filter(([k, v]) => v === r && k !== "Follow Up Later")[0]?.[0] ?? "New";
  const responses = enriched.map((e) => e.responseMins).filter((m): m is number => m !== null && m >= 0);
  const revenueCents = enriched.reduce((t, e) => t + e.revenue, 0);

  return {
    range,
    dimension,
    from: from ?? start,
    to: today,
    total: leads.length,
    previousTotal: prevR.count ?? null,
    hidden: junkR.count ?? 0,
    funnel: STAGES.map((s) => ({ key: s.key, label: s.label, count: count(s.min) })),
    won: leads.filter((l) => l.lead_status === "Won").length,
    lost: leads.filter((l) => l.lead_status === "Lost").length,
    open: leads.filter((l) => l.lead_status !== "Won" && l.lead_status !== "Lost").length,
    medianResponseMins: median(responses),
    respondedCount: responses.length,
    revenueCents,
    linkedClients: customers.filter((c) => leads.some((l) => l.id === c.lead_id)).length,
    spendCents,
    breakdown: [...rows.values()].sort((a, b) => b.leads - a.leads || b.revenueCents - a.revenueCents),
    trend,
    trendUnit,
    lostReasons: tally(leads.filter((l) => l.lead_status === "Lost").map((l) => (l.lost_reason || "No reason given").trim())),
    statusNow: tally(leads.map((l) => l.lead_status)),
    recent: [...enriched].reverse().slice(0, 8).map((e) => ({
      id: e.l.id,
      name: e.l.business_name || [e.l.first_name, e.l.last_name].filter(Boolean).join(" ") || "Lead",
      channel: channelOf(e.l),
      status: e.l.lead_status,
      created: chicagoDate(new Date(e.l.created_at)),
      reached: stageName(e.reached),
    })),
  };
}
