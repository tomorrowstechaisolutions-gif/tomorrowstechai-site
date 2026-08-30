import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { chicagoDate, monthToDate, todayPeriod } from "./period";

/**
 * Section 7 — Website performance.
 *
 * GA4 and the Meta Pixel are BROWSER-side tags. Nothing on this deployment
 * reads an analytics API from the server, so visitor and page-view counts do
 * not exist here — and this panel says so rather than printing a number it
 * cannot stand behind.
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

  const analyticsConnected = ANALYTICS_ENV.some((k) => Boolean(process.env[k]));
  const leadsToday = byDay.get(day.fromDate) ?? 0;

  return {
    analyticsConnected,
    visitorsToday: null,
    visitorsMonth: null,
    pageViews: null,
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
