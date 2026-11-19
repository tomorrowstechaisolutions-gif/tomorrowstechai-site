import type { SupabaseClient } from "@supabase/supabase-js";
import { parseReport, type AppReport, type ReportEventKind } from "./report-contract";
import type { LatestReport } from "./report-rollup";
import type { IntegrationStatus } from "./types";

/**
 * Reads for the report screens. Database only: nothing here calls a
 * product. The pull (report.ts) is the only thing that does, so a product
 * being down can never slow a page.
 *
 * Every function takes the REQUEST-SCOPED client, so RLS applies.
 */

export type ReportConnection = {
  appId: string;
  slug: string;
  name: string;
  status: IntegrationStatus;
  error: string | null;
  lastCheckedAt: string | null;
  endpointUrl: string | null;
  keyEnv: string | null;
};

/** Held is the priority product and leads every list. */
function byPriority<T extends { slug: string; name: string }>(a: T, b: T): number {
  if (a.slug === "held") return -1;
  if (b.slug === "held") return 1;
  return a.name.localeCompare(b.name);
}

type AppRef = { slug: string; name: string };

type ConnectionRow = {
  app_id: string;
  status: IntegrationStatus;
  error: string | null;
  last_checked_at: string | null;
  metadata: Record<string, unknown> | null;
  apps: AppRef | AppRef[] | null;
};

function toConnection(row: ConnectionRow): ReportConnection {
  const app = Array.isArray(row.apps) ? row.apps[0] : row.apps;
  const meta = row.metadata ?? {};
  return {
    appId: row.app_id,
    slug: app?.slug ?? "",
    name: app?.name ?? "App",
    status: row.status,
    error: row.error,
    lastCheckedAt: row.last_checked_at,
    endpointUrl: typeof meta.endpoint_url === "string" ? meta.endpoint_url : null,
    keyEnv: typeof meta.key_env === "string" ? meta.key_env : null,
  };
}

/** Every product with a report connection, connected or not. */
export async function loadReportIntegrations(sb: SupabaseClient): Promise<ReportConnection[]> {
  const { data, error } = await sb
    .from("app_integrations")
    .select("app_id, status, error, last_checked_at, metadata, apps!inner(slug, name, is_archived)")
    .eq("provider", "report")
    .eq("apps.is_archived", false);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ConnectionRow[]).map(toConnection).sort(byPriority);
}

type ReportRow = { pulled_at: string; payload: unknown };

/** A stored payload passed validation once; it is re-checked on the way out. */
function readPayload(row: ReportRow | null): (AppReport & { pulledAt: string }) | null {
  if (!row) return null;
  const parsed = parseReport(row.payload);
  return parsed.ok ? { ...parsed.report, pulledAt: row.pulled_at } : null;
}

async function latestRow(sb: SupabaseClient, appId: string): Promise<ReportRow | null> {
  const { data, error } = await sb
    .from("app_reports")
    .select("pulled_at, payload")
    .eq("app_id", appId)
    .order("pulled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ReportRow | null) ?? null;
}

/** The newest stored report for each connected product. Held first. */
export async function loadLatestReports(
  sb: SupabaseClient,
  connections: ReportConnection[]
): Promise<LatestReport[]> {
  const rows = await Promise.all(connections.map((c) => latestRow(sb, c.appId)));
  const out: LatestReport[] = [];
  connections.forEach((c, i) => {
    const report = readPayload(rows[i]);
    if (!report) return;
    out.push({
      appId: c.appId,
      slug: c.slug,
      name: c.name,
      pulledAt: report.pulledAt,
      livemode: report.livemode,
      currency: report.currency,
      metrics: report.metrics,
    });
  });
  return out;
}

export type BusinessEvent = {
  id: string;
  kind: ReportEventKind;
  occurredAt: string;
  summary: string;
  plan: string | null;
  amountCents: number | null;
  url: string | null;
};

export type BusinessDay = { day: string; users_total: number | null; mrr_cents: number | null };

export type Business = {
  integration: Omit<ReportConnection, "appId" | "slug" | "name"> | null;
  report: (AppReport & { pulledAt: string }) | null;
  events: BusinessEvent[];
  /** Last 30 days, oldest first. A day with no good pull is simply absent. */
  daily: BusinessDay[];
  /** Hosts a reported link is allowed to point at: the app's own. */
  allowedHosts: string[];
};

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : "https://" + value;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

type EventRow = {
  external_id: string;
  kind: ReportEventKind;
  occurred_at: string;
  summary: string;
  plan: string | null;
  amount_cents: number | null;
  url: string | null;
};

/** Everything the Business tab shows for one app. */
export async function loadBusiness(sb: SupabaseClient, appId: string): Promise<Business> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [connection, report, events, daily, domains, environments] = await Promise.all([
    sb
      .from("app_integrations")
      .select("app_id, status, error, last_checked_at, metadata, apps(slug, name)")
      .eq("app_id", appId)
      .eq("provider", "report")
      .limit(1)
      .maybeSingle(),
    latestRow(sb, appId),
    sb
      .from("app_report_events")
      .select("external_id, kind, occurred_at, summary, plan, amount_cents, url")
      .eq("app_id", appId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    sb
      .from("app_metrics_daily")
      .select("day, users_total, mrr_cents")
      .eq("app_id", appId)
      .gte("day", since)
      .order("day", { ascending: true }),
    sb.from("app_domains").select("domain").eq("app_id", appId),
    sb.from("app_environments").select("url").eq("app_id", appId).eq("is_production", true),
  ]);

  for (const result of [connection, events, daily, domains, environments]) {
    if (result.error) throw new Error(result.error.message);
  }

  const integration = connection.data ? toConnection(connection.data as unknown as ConnectionRow) : null;

  const hosts = new Set<string>();
  for (const row of (domains.data ?? []) as { domain: string | null }[]) {
    const host = hostOf(row.domain);
    if (host) hosts.add(host);
  }
  for (const row of (environments.data ?? []) as { url: string | null }[]) {
    const host = hostOf(row.url);
    if (host) hosts.add(host);
  }

  return {
    integration: integration
      ? {
          status: integration.status,
          error: integration.error,
          lastCheckedAt: integration.lastCheckedAt,
          endpointUrl: integration.endpointUrl,
          keyEnv: integration.keyEnv,
        }
      : null,
    report: readPayload(report),
    events: ((events.data ?? []) as EventRow[]).map((row) => ({
      id: row.external_id,
      kind: row.kind,
      occurredAt: row.occurred_at,
      summary: row.summary,
      plan: row.plan,
      amountCents: row.amount_cents,
      url: row.url,
    })),
    daily: ((daily.data ?? []) as BusinessDay[]).map((row) => ({
      day: row.day,
      users_total: row.users_total,
      mrr_cents: row.mrr_cents,
    })),
    allowedHosts: [...hosts],
  };
}
