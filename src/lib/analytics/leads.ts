import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lead-side numbers for the admin Analytics page, from the leads table.
 * Read through the request-scoped client, so RLS (admin only) applies.
 */

export type LeadRow = {
  created_at: string;
  source: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  landing_page: string | null;
  lead_status: string;
};

export type LeadStats = {
  total: number;
  won: number;
  open: number;
  perDay: { day: string; count: number }[];
  bySource: { key: string; count: number }[];
  byLanding: { key: string; count: number }[];
  byUtm: { key: string; count: number }[];
  byStatus: { key: string; count: number }[];
};

function tally(rows: LeadRow[], pick: (r: LeadRow) => string | null, limit = 8) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (pick(r) || "").trim() || "(none)";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Central-time calendar day, so a lead at 9pm Monday counts on Monday. */
function chicagoDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso));
}

export async function leadStats(supabase: SupabaseClient, since: Date, until: Date, days: string[]): Promise<LeadStats> {
  const { data, error } = await supabase
    .from("leads")
    .select("created_at, source, utm_source, utm_campaign, landing_page, lead_status")
    .gte("created_at", since.toISOString())
    .lte("created_at", until.toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`Could not load leads: ${error.message}`);
  const rows = (data ?? []) as LeadRow[];

  const perDayMap = new Map(days.map((d) => [d, 0]));
  for (const r of rows) {
    const d = chicagoDay(r.created_at);
    if (perDayMap.has(d)) perDayMap.set(d, (perDayMap.get(d) ?? 0) + 1);
  }

  return {
    total: rows.length,
    won: rows.filter((r) => r.lead_status === "Won").length,
    open: rows.filter((r) => r.lead_status !== "Won" && r.lead_status !== "Lost").length,
    perDay: [...perDayMap.entries()].map(([day, count]) => ({ day, count })),
    bySource: tally(rows, (r) => r.source),
    byLanding: tally(rows, (r) => r.landing_page),
    byUtm: tally(rows, (r) => (r.utm_source ? `${r.utm_source}${r.utm_campaign ? ` / ${r.utm_campaign}` : ""}` : null)),
    byStatus: tally(rows, (r) => r.lead_status, 10),
  };
}
