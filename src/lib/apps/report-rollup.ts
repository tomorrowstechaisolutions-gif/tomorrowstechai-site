import type { ReportMetrics } from "./report-contract";

/**
 * The arithmetic and the safety rule behind the report screens. Pure, so the
 * decisions that could put a wrong number or a hostile link on the page are
 * tested without a database.
 */

/** A report is evidence for three hours. After that it is shown as stale. */
export const FRESH_MS = 3 * 60 * 60 * 1000;

export type LatestReport = {
  appId: string;
  slug: string;
  name: string;
  /** When WE fetched it. Freshness is never judged on the product's clock. */
  pulledAt: string;
  livemode: boolean;
  currency: string;
  metrics: ReportMetrics;
};

export function isFresh(pulledAt: string, now: Date): boolean {
  const at = Date.parse(pulledAt);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < FRESH_MS;
}

export type PortfolioRollup = {
  mrrCents: number | null;
  paid: number | null;
  users: number | null;
  new24h: number | null;
  /** How many products the totals actually include. */
  reporting: number;
  /** How many products have a report connection at all. */
  of: number;
};

/**
 * Adds a metric across reports. Null in, null out, unless at least one
 * report measured it, in which case the unmeasured ones are simply absent
 * from the sum rather than counted as zero.
 */
function sum(reports: LatestReport[], key: keyof ReportMetrics): number | null {
  let total: number | null = null;
  for (const report of reports) {
    const value = report.metrics[key];
    if (value === null) continue;
    total = (total ?? 0) + value;
  }
  return total;
}

/**
 * The portfolio totals. Only reports that are fresh, live and in USD are
 * counted: a stale number is not today's number, test-mode money is not
 * money, and cents in two currencies do not add.
 */
export function rollup(reports: LatestReport[], connectedApps: number, now: Date): PortfolioRollup {
  const counted = reports.filter(
    (report) => isFresh(report.pulledAt, now) && report.livemode && report.currency === "usd"
  );
  return {
    mrrCents: sum(counted, "mrr_cents"),
    paid: sum(counted, "paid_total"),
    users: sum(counted, "users_total"),
    new24h: sum(counted, "users_new_24h"),
    reporting: counted.length,
    of: connectedApps,
  };
}

/**
 * An event's link is something a product SENT us, so it is treated as
 * untrusted: it becomes a clickable link only when it is https and its host
 * is exactly one of the app's own hosts. Anything else is shown as text.
 * Returns the normalised URL, or null when it must not be a link.
 */
export function safeEventUrl(url: string | null, allowedHosts: string[]): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const allowed = allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(parsed.hostname.toLowerCase())) return null;
  return parsed.toString();
}
