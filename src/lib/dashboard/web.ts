import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { chicagoDate, monthToDate, todayPeriod } from "./period";
import { JUNK_FILTER } from "@/lib/supabase/types";
import { analyticsConfigured, totals } from "@/lib/analytics/vercel-web";

/**
 * Section 7 — Website performance.
 *
 * GA4 and the Meta Pixel are BROWSER-side tags and cannot be read back from
 * the server. Visitor and page-view counts come from Vercel Web Analytics,
 * the same cookieless feed the Analytics page reads, so this panel and that
 * page show the same numbers. When that feed is not set up or does not
 * answer, the counts are null and the panel says so rather than printing a
 * number it cannot stand behind.
 *
 * What is real: every lead row carries its landing page, referrer and UTMs,
 * and paid landing-page views are reported on campaign_spend. That is enough
 * to answer "where are leads actually coming from", which is the question the
 * card is there to answer.
 */

/** Env that would give the server a real analytics feed. None set = not connected. */
const ANALYTICS_ENV = [
  "GA_PROPERTY_ID",
  "GOOGLE_ANALYTICS_PROPERTY_ID",
  "PLAUSIBLE_API_KEY",
  "UMAMI_API_KEY",
];

export type NamedCount = { label: string; count: number; share: number | null };

export type WebSnapshot = {
  /** False until a server-side analytics source is configured. */
  analyticsConnected: boolean;
  /** Null whenever analyticsConnected is false. Never a placeholder zero. */
  visitorsToday: number | null;
  visitorsMonth: number | null;
  pageViews: number | null;
  /** Paid landing-page views from campaign_spend. Real, but paid traffic only. */
  paidLandingViews: number;
  leadsToday: number;
  leadsMonth: number;
  /** Leads ÷ paid landing-page views. Null when there were no views. */
  conversionRate: number | null;
  topLandingPages: NamedCount[];
  topSources: NamedCount[];
  topServices: NamedCount[];
  /** Daily leads this month, oldest first. */
  series: { date: string; count: number }[];
};

function rank(counts: Map<string, number>, total: number, limit = 5): NamedCount[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count,
      share: total > 0 ? count / total : null,
    }));
}

/** "https://tomorrowstechai.com/services?x=1" → "/services". */
function pathOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, "https://tomorrowstechai.com").pathname || "/";
  } catch {
    return url.startsWith("/") ? url.split("?")[0] : null;
  }
}

/** "https://www.google.com/search" → "google.com". */
function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function loadWeb(sb: SupabaseClient): Promise<WebSnapshot> {
  const { current } = monthToDate();
  const day = todayPeriod();

  const [leads, spend] = await Promise.all([
    sb
      .from("leads")
      .select("created_at, landing_page, referrer, utm_source, source, services_interested")
      .not("lead_status", "in", JUNK_FILTER)
      .gte("created_at", current.fromIso)
      .lt("created_at", current.toIso)
      .then((r) => unwrap(r, "leads (web)")),
    sb
      .from("campaign_spend")
      .select("landing_page_views")
      .gte("date", current.fromDate)
      .lte("date", current.toDate)
      .then((r) => unwrap(r, "landing page views")),
  ]);

  type Row = {
    created_at: string;
    landing_page: string | null;
    referrer: string | null;
    utm_source: string | null;
    source: string;
    services_interested: string[] | null;
  };
  const rows = leads as Row[];

  const pages = new Map<string, number>();
  const sources = new Map<string, number>();
  const services = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const l of rows) {
    const page = pathOf(l.landing_page);
    if (page) pages.set(page, (pages.get(page) ?? 0) + 1);

    // Best available attribution, in order of how much we trust it.
    const src = l.utm_source || hostOf(l.referrer) || l.source || "direct";
    sources.set(src, (sources.get(src) ?? 0) + 1);

    for (const s of l.services_interested ?? []) {
      services.set(s, (services.get(s) ?? 0) + 1);
    }

    const d = chicagoDate(new Date(l.created_at));
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }

  const paidLandingViews = (spend as { landing_page_views: number }[]).reduce(
    (t, s) => t + s.landing_page_views,
    0
  );

  const series: { date: string; count: number }[] = [];
  const [y, m] = current.fromDate.split("-").map(Number);
  const lastDay = Number(current.toDate.slice(8, 10));
  for (let d = 1; d <= lastDay; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    series.push({ date: key, count: byDay.get(key) ?? 0 });
  }

  const leadsToday = byDay.get(day.fromDate) ?? 0;

  // Traffic, from the feed the Analytics page uses. A failure here must not
  // take the lead figures down with it: the counts just stay unknown.
  let visitorsToday: number | null = null;
  let visitorsMonth: number | null = null;
  let pageViews: number | null = null;
  if (analyticsConfigured()) {
    try {
      const now = new Date();
      const [month, today] = await Promise.all([
        totals(new Date(current.fromIso), now),
        totals(new Date(day.fromIso), now),
      ]);
      visitorsMonth = month.visitors;
      pageViews = month.pageviews;
      visitorsToday = today.visitors;
    } catch (err) {
      console.error("[dashboard/web] traffic unavailable:", err instanceof Error ? err.message : err);
    }
  }
  const analyticsConnected = visitorsMonth !== null || ANALYTICS_ENV.some((k) => Boolean(process.env[k]));

  return {
    analyticsConnected,
    visitorsToday,
    visitorsMonth,
    pageViews,
    paidLandingViews,
    leadsToday,
    leadsMonth: rows.length,
    conversionRate: paidLandingViews > 0 ? rows.length / paidLandingViews : null,
    topLandingPages: rank(pages, rows.length),
    topSources: rank(sources, rows.length),
    topServices: rank(services, rows.length, 6),
    series,
  };
}
