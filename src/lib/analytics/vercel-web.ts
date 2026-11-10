import "server-only";

/**
 * Vercel Web Analytics, read server-side for the admin Analytics page.
 *
 * Needs VERCEL_ANALYTICS_TOKEN: a Vercel access token (Account Settings ->
 * Tokens) scoped to the team. Never sent to the browser. Project and team IDs
 * are not secrets; they default to this site's and can be overridden.
 *
 * Docs: https://vercel.com/docs/analytics/web-analytics-api
 * - GET /v1/query/web-analytics/visits/count      -> { data: { pageviews, visitors } }
 * - GET /v1/query/web-analytics/visits/aggregate  -> { data: [{ <dimension>, pageviews, visitors }] }
 */

const API = "https://api.vercel.com/v1/query/web-analytics/visits";
const PROJECT_ID = process.env.VERCEL_ANALYTICS_PROJECT_ID || "prj_x31QpQbBZAlUpzLd0HS9Ctq5bxSc";
const TEAM_ID = process.env.VERCEL_ANALYTICS_TEAM_ID || "team_ei55NWvmcUuMarnRkBtCNORr";

export type Dimension =
  | "requestPath"
  | "referrerHostname"
  | "utmSource"
  | "utmCampaign"
  | "country"
  | "deviceType";

export type Counts = { pageviews: number; visitors: number };
export type Row = Counts & { key: string };

export type TrafficStatus =
  | { state: "ok" }
  | { state: "no-token" }
  | { state: "not-enabled" }
  | { state: "error"; message: string };

export function analyticsConfigured(): boolean {
  return Boolean(process.env.VERCEL_ANALYTICS_TOKEN);
}

class AnalyticsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call(path: "count" | "aggregate", params: Record<string, string | string[]>) {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token) throw new AnalyticsError(0, "no-token");
  const q = new URLSearchParams({ projectId: PROJECT_ID, teamId: TEAM_ID });
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.set(k, v);
  }
  const res = await fetch(`${API}/${path}?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Ten minutes is fresh enough for a dashboard and keeps API calls low.
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {}
    throw new AnalyticsError(res.status, message);
  }
  return (await res.json()) as { data: unknown };
}

/** pageviews/visitors from an item, tolerating `count` as a fallback name. */
function counts(item: Record<string, unknown>): Counts {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const pageviews = n(item.pageviews) || n(item.pageViews) || n(item.count) || n(item.total);
  const visitors = n(item.visitors) || n(item.devices);
  return { pageviews, visitors };
}

export function statusFrom(err: unknown): TrafficStatus {
  if (err instanceof AnalyticsError) {
    if (err.message === "no-token") return { state: "no-token" };
    if (err.status === 404) return { state: "not-enabled" };
    if (err.status === 401 || err.status === 403)
      return { state: "error", message: "The Vercel token was rejected. Check that it is valid and scoped to the team." };
    return { state: "error", message: `Vercel Web Analytics: ${err.message.replace(/\.+$/, "")}.` };
  }
  return { state: "error", message: err instanceof Error ? err.message : "Unknown error" };
}

export async function totals(since: Date, until: Date, filter?: string): Promise<Counts> {
  const body = await call("count", {
    since: since.toISOString(),
    until: until.toISOString(),
    ...(filter ? { filter } : {}),
  });
  return counts((body.data ?? {}) as Record<string, unknown>);
}

export async function byDimension(
  dimension: Dimension,
  since: Date,
  until: Date,
  opts: { limit?: number; filter?: string } = {}
): Promise<Row[]> {
  const body = await call("aggregate", {
    by: dimension,
    since: since.toISOString(),
    until: until.toISOString(),
    limit: String(opts.limit ?? 10),
    ...(opts.filter ? { filter: opts.filter } : {}),
  });
  const items = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
  return items
    .map((it) => ({ key: String(it[dimension] ?? "") || "(none)", ...counts(it) }))
    .sort((a, b) => b.pageviews - a.pageviews);
}

export async function perDay(since: Date, until: Date): Promise<{ day: string; pageviews: number; visitors: number }[]> {
  const body = await call("aggregate", {
    by: "day",
    since: since.toISOString(),
    until: until.toISOString(),
    limit: "100",
  });
  const items = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
  return items
    .map((it) => ({ day: String(it.timestamp ?? it.day ?? "").slice(0, 10), ...counts(it) }))
    .filter((d) => d.day)
    .sort((a, b) => a.day.localeCompare(b.day));
}
