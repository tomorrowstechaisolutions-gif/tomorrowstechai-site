import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Google Search Console.
 *
 * This is the connection that decides how much of the SEO screen can say
 * anything. Impressions, clicks, average position, indexed pages and every
 * keyword you rank for come from here and from nowhere else that is free.
 *
 * Until it is connected, `connection()` reports exactly that and every panel
 * built on it renders a connect prompt rather than a number. The shape below
 * is Search Console's own Search Analytics response, so connecting later is a
 * fetch loop writing into `seo_queries` — not a redesign.
 */

/** Server-to-server access: a service account added as a user on the property. */
const ENV = {
  site: "GOOGLE_SEARCH_CONSOLE_SITE_URL",
  email: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  key: "GOOGLE_SERVICE_ACCOUNT_KEY",
} as const;

export type GscConnection = {
  connected: boolean;
  property: string | null;
  missing: string[];
  reason: string;
};

export function connection(): GscConnection {
  const missing = Object.values(ENV).filter((k) => !process.env[k]);
  const property = process.env[ENV.site] ?? null;

  if (missing.length === 0) {
    return { connected: true, property, missing: [], reason: "Connected." };
  }

  return {
    connected: false,
    property,
    missing,
    reason:
      missing.length === Object.values(ENV).length
        ? "Search Console is not connected, so impressions, clicks, position and keyword data are not available."
        : `Search Console is partly configured — still missing ${missing.join(", ")}.`,
  };
}

/**
 * Google Business Profile, for the Local SEO panel.
 *
 * Separate API, separate connection, and nothing in the CRM stands in for it:
 * views, direction requests and calls-from-search exist only inside Google's
 * own product. Reported honestly rather than approximated.
 */
export function localConnection(): { connected: boolean; reason: string } {
  const connected = Boolean(process.env.GOOGLE_BUSINESS_PROFILE_ACCOUNT);
  return {
    connected,
    reason: connected
      ? "Connected."
      : "Google Business Profile is not connected. Views, calls and direction requests live inside Google and cannot be derived from anything else here.",
  };
}

export type QueryRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

export type SearchTotals = {
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  pagesWithImpressions: number;
};

export type SearchSnapshot = {
  connected: boolean;
  reason: string;
  /** Null throughout when nothing has synced. Never zero — zero is a measurement. */
  totals: SearchTotals | null;
  previousTotals: SearchTotals | null;
  queries: QueryRow[];
  /** Ranked 11-20: already ranking, just where nobody looks. */
  nearlyThere: QueryRow[];
  series: { date: string; clicks: number; impressions: number }[];
  lastSyncedAt: string | null;
};

type RawQuery = {
  date: string;
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
  synced_at: string;
};

function totalsFrom(rows: RawQuery[]): SearchTotals | null {
  if (rows.length === 0) return null;
  const clicks = rows.reduce((t, r) => t + r.clicks, 0);
  const impressions = rows.reduce((t, r) => t + r.impressions, 0);

  // Position is averaged by impressions: a keyword seen 5,000 times at
  // position 3 is not the equal of one seen twice at position 90.
  const weighted = rows.reduce((t, r) => t + (r.position ?? 0) * r.impressions, 0);

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? weighted / impressions : null,
    pagesWithImpressions: new Set(rows.filter((r) => r.impressions > 0).map((r) => r.page)).size,
  };
}

/**
 * Reads the cache, not Google.
 *
 * The dashboard must not make a Search Console round trip on every render —
 * the API is rate-limited per property and slow enough to be felt. A sync job
 * fills `seo_queries`; this reads it.
 */
export async function loadSearch(sb: SupabaseClient, days = 28): Promise<SearchSnapshot> {
  const conn = connection();

  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const previousSince = new Date(Date.now() - days * 2 * 86400_000).toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("seo_queries")
    .select("date, query, page, clicks, impressions, ctr, position, synced_at")
    .gte("date", previousSince)
    .order("impressions", { ascending: false })
    .limit(4000);

  if (error || !data || data.length === 0) {
    // No rows is expected before the connection exists — and also right after
    // connecting, before the first sync. The reason distinguishes the two.
    return {
      connected: conn.connected,
      reason: conn.connected
        ? "Connected, but no search data has been synced yet."
        : conn.reason,
      totals: null,
      previousTotals: null,
      queries: [],
      nearlyThere: [],
      series: [],
      lastSyncedAt: null,
    };
  }

  const rows = data as RawQuery[];
  const current = rows.filter((r) => r.date >= since);
  const previous = rows.filter((r) => r.date < since);

  // Collapse per-day rows into one row per query+page for the tables.
  const byQuery = new Map<string, QueryRow & { weightedPosition: number }>();
  for (const r of current) {
    const key = `${r.query} ${r.page}`;
    const existing = byQuery.get(key) ?? {
      query: r.query,
      page: r.page,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: null,
      weightedPosition: 0,
    };
    existing.clicks += r.clicks;
    existing.impressions += r.impressions;
    existing.weightedPosition += (r.position ?? 0) * r.impressions;
    byQuery.set(key, existing);
  }

  const queries: QueryRow[] = [...byQuery.values()]
    .map((q) => ({
      query: q.query,
      page: q.page,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.impressions > 0 ? q.clicks / q.impressions : 0,
      position: q.impressions > 0 ? q.weightedPosition / q.impressions : null,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const byDay = new Map<string, { clicks: number; impressions: number }>();
  for (const r of current) {
    const d = byDay.get(r.date) ?? { clicks: 0, impressions: 0 };
    d.clicks += r.clicks;
    d.impressions += r.impressions;
    byDay.set(r.date, d);
  }

  return {
    connected: conn.connected,
    reason: conn.reason,
    totals: totalsFrom(current),
    previousTotals: totalsFrom(previous),
    queries: queries.slice(0, 50),
    nearlyThere: queries
      .filter((q) => q.position !== null && q.position > 10 && q.position <= 20 && q.impressions >= 10)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 8),
    series: [...byDay.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    lastSyncedAt: rows.reduce<string | null>(
      (latest, r) => (latest === null || r.synced_at > latest ? r.synced_at : latest),
      null
    ),
  };
}
