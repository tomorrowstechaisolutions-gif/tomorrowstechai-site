import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyticsConfigured, byDimension, perDay, statusFrom, totals, type Counts, type Row, type TrafficStatus } from "@/lib/analytics/vercel-web";
import { articleUrl } from "./social-draft";

/**
 * How one Field Notes article is doing, for the editor's Performance tab:
 * traffic from Vercel Web Analytics (same source as the admin Analytics page),
 * leads whose landing page is the article, and the social posts made from it.
 */

export type ArticlePerformance = {
  path: string;
  traffic: TrafficStatus;
  last30: Counts | null;
  sincePublished: Counts | null;
  sinceLabel: string;
  daily: { day: string; pageviews: number }[];
  referrers: Row[];
  campaigns: Row[];
  leads: { id: string; name: string; business: string | null; status: string; at: string; utm: string | null }[];
  social: { id: string; title: string; status: string; platforms: string[]; at: string | null; externalUrl: string | null }[];
};

const DAY = 86_400_000;

export async function getArticlePerformance(
  supabase: SupabaseClient,
  slug: string,
  publishedAt: string | null
): Promise<ArticlePerformance> {
  const path = `/blog/${slug}`;
  const filter = `requestPath eq '${path.replace(/'/g, "''")}'`;
  const until = new Date();
  const since30 = new Date(until.getTime() - 30 * DAY);
  // "Since published", capped at a year (the analytics API's useful range).
  const pub = publishedAt ? Date.parse(publishedAt) : NaN;
  const sinceStart = new Date(Math.max(Number.isNaN(pub) ? until.getTime() - 365 * DAY : pub, until.getTime() - 365 * DAY));
  const sinceLabel = !Number.isNaN(pub) && pub > until.getTime() - 365 * DAY ? "Since published" : "Last 12 months";

  const trafficPromise = (async () => {
    if (!analyticsConfigured()) return { traffic: { state: "no-token" } as TrafficStatus };
    try {
      const [last30, sincePublished, daily, referrers, campaigns] = await Promise.all([
        totals(since30, until, filter),
        totals(sinceStart, until, filter),
        perDay(since30, until, filter),
        byDimension("referrerHostname", sinceStart, until, { limit: 8, filter }),
        byDimension("utmSource", sinceStart, until, { limit: 8, filter }),
      ]);
      return { traffic: { state: "ok" } as TrafficStatus, last30, sincePublished, daily, referrers, campaigns };
    } catch (err) {
      return { traffic: statusFrom(err) };
    }
  })();

  const [t, leadsRes, socialRes] = await Promise.all([
    trafficPromise,
    supabase
      .from("leads")
      .select("id, first_name, last_name, business_name, lead_status, created_at, utm_source, utm_campaign")
      .eq("landing_page", path)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("social_posts")
      .select("id, title, status, scheduled_at, published_at, created_at, external_url, link_url, social_post_platforms(platform)")
      .is("deleted_at", null)
      .like("link_url", `${articleUrl(slug)}%`)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Fill the 30 days so quiet days show as zero rather than vanishing.
  const byDay = new Map((("daily" in t ? t.daily : null) ?? []).map((d) => [d.day, d.pageviews]));
  const daily: ArticlePerformance["daily"] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(until.getTime() - i * DAY));
    daily.push({ day, pageviews: byDay.get(day) ?? 0 });
  }

  const base = articleUrl(slug);
  return {
    path,
    traffic: t.traffic,
    last30: "last30" in t ? t.last30 ?? null : null,
    sincePublished: "sincePublished" in t ? t.sincePublished ?? null : null,
    sinceLabel,
    daily,
    referrers: "referrers" in t ? t.referrers ?? [] : [],
    campaigns: "campaigns" in t ? (t.campaigns ?? []).filter((r) => r.key !== "(none)") : [],
    leads: (leadsRes.data ?? []).map((l) => ({
      id: l.id,
      name: `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || "(no name)",
      business: l.business_name,
      status: l.lead_status,
      at: l.created_at,
      utm: [l.utm_source, l.utm_campaign].filter(Boolean).join(" / ") || null,
    })),
    social: (socialRes.data ?? [])
      .filter((p) => (p.link_url ?? "").split(/[?#]/)[0] === base)
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        platforms: ((p.social_post_platforms ?? []) as { platform: string }[]).map((x) => x.platform),
        at: p.published_at ?? p.scheduled_at ?? p.created_at,
        externalUrl: p.external_url,
      })),
  };
}
