/**
 * The parts of the Search Console sync that are plain logic: reading the
 * service-account key out of the environment, choosing the date window, and
 * turning Google's rows into seo_queries rows. No network and no database, so
 * all of it is unit-tested.
 */

export type ServiceKey = { clientEmail: string; privateKey: string };

/**
 * GOOGLE_SERVICE_ACCOUNT_KEY may hold either the private key on its own or the
 * whole JSON file Google downloads. Both are accepted, because pasting the
 * file is what people actually do. Vercel stores newlines in a PEM as the two
 * characters `\n`, so those are turned back into real newlines.
 */
export function parseServiceKey(email: string | undefined, key: string | undefined): ServiceKey | null {
  const raw = (key ?? "").trim();
  if (!raw) return null;

  let clientEmail = (email ?? "").trim();
  let privateKey = raw;

  if (raw.startsWith("{")) {
    try {
      const json = JSON.parse(raw) as { client_email?: unknown; private_key?: unknown };
      if (typeof json.private_key !== "string") return null;
      privateKey = json.private_key;
      if (!clientEmail && typeof json.client_email === "string") clientEmail = json.client_email;
    } catch {
      return null;
    }
  }

  privateKey = privateKey.replace(/\\n/g, "\n").trim();
  if (!clientEmail || !privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) return null;
  return { clientEmail, privateKey };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Which days to ask Google for.
 *
 * The first run reaches back 90 days so the screen has a previous period to
 * compare with. After that each run re-pulls the last 10 days: Search Console
 * data arrives two to three days late and is revised for a few days after, so
 * a short overlap picks up both the new days and the corrections.
 */
export function syncWindow(today: Date, hasData: boolean): { startDate: string; endDate: string; days: number } {
  const days = hasData ? 10 : 90;
  return { startDate: day(new Date(today.getTime() - days * 86_400_000)), endDate: day(today), days };
}

/** One row of Google's searchAnalytics.query response, dimensions [date, query, page]. */
export type ApiRow = {
  keys?: unknown;
  clicks?: unknown;
  impressions?: unknown;
  ctr?: unknown;
  position?: unknown;
};

export type QueryRecord = {
  date: string;
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
  source: "search_console";
  synced_at: string;
};

/** A page URL as a site path. Anything that is not a URL is kept as given. */
export function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url;
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Google's rows as seo_queries rows.
 *
 * Pages are stored as paths, so the http, https, www and bare-domain versions
 * of one page (a domain property reports all of them) land on the same key.
 * Rows that collide are merged here — clicks and impressions add, position is
 * averaged by impressions — because one upsert cannot touch the same key twice.
 * Malformed rows are dropped rather than guessed at.
 */
export function toRecords(rows: ApiRow[], syncedAt: string): QueryRecord[] {
  const merged = new Map<string, QueryRecord & { weighted: number }>();

  for (const row of rows) {
    const keys = Array.isArray(row.keys) ? row.keys : [];
    const [date, query, page] = keys;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (typeof query !== "string" || !query || typeof page !== "string") continue;

    const clicks = Math.round(num(row.clicks));
    const impressions = Math.round(num(row.impressions));
    const path = pagePath(page);
    const key = `${date}\u0000${query}\u0000${path}`;

    const existing = merged.get(key);
    if (existing) {
      existing.clicks += clicks;
      existing.impressions += impressions;
      existing.weighted += num(row.position) * impressions;
    } else {
      merged.set(key, {
        date, query: query.slice(0, 500), page: path.slice(0, 500),
        clicks, impressions, ctr: 0, position: null,
        source: "search_console", synced_at: syncedAt,
        weighted: num(row.position) * impressions,
      });
    }
  }

  return [...merged.values()].map(({ weighted, ...r }) => ({
    ...r,
    ctr: r.impressions > 0 ? Math.round((r.clicks / r.impressions) * 10_000) / 10_000 : 0,
    position: r.impressions > 0 ? Math.round((weighted / r.impressions) * 100) / 100 : null,
  }));
}

/** What Google's error body says, in a sentence a person can act on. */
export function explainGoogleError(status: number, message: string, site: string, email: string): string {
  if (status === 403) {
    return `Google refused access to ${site}. In Search Console, add ${email} as a user on that property, and check the Search Console API is enabled in the Cloud project.`;
  }
  if (status === 404) {
    return `Google has no property called ${site}. Check GOOGLE_SEARCH_CONSOLE_SITE_URL matches the property exactly (for example https://www.example.com/ or sc-domain:example.com).`;
  }
  if (status === 400 || status === 401) return `Google rejected the request: ${message}`;
  return `Google answered ${status}: ${message}`;
}
