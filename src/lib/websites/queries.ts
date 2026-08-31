import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { lastNDays } from "@/lib/dashboard/period";
import { attributionOf } from "@/lib/seo/organic";
import { needsAttention, scoreWebsite, type HealthState, type WebsiteHealth } from "./health";

/**
 * Everything the Websites screen shows.
 *
 * The shape of this file is decided by one fact: this project has Supabase,
 * Stripe, Meta and Resend credentials and NOTHING ELSE. There is no Vercel
 * token, no analytics property, no uptime monitor and no PageSpeed key. So
 * traffic, uptime and performance are typed `number | null` and are null
 * everywhere until a `website_integrations` row proves otherwise — and the
 * screen prints "Not connected" rather than a zero.
 *
 * What IS real today: the portfolio itself, who owns each site, recurring
 * revenue from Stripe via customers.mrr_cents, leads attributed by landing
 * page, renewals, and derived health.
 */

export type WebsiteStatus =
  | "live" | "development" | "waiting_on_client" | "review"
  | "maintenance" | "paused" | "issue" | "archived";

export type WebsiteType =
  | "business" | "ecommerce" | "web_app" | "saas" | "portfolio"
  | "landing_page" | "client_portal" | "membership" | "other";

export const STATUS_LABELS: Record<WebsiteStatus, string> = {
  live: "Live",
  development: "Development",
  waiting_on_client: "Waiting on client",
  review: "Review",
  maintenance: "Maintenance",
  paused: "Paused",
  issue: "Issue",
  archived: "Archived",
};

export const TYPE_LABELS: Record<WebsiteType, string> = {
  business: "Business",
  ecommerce: "Ecommerce",
  web_app: "Web App",
  saas: "SaaS",
  portfolio: "Portfolio",
  landing_page: "Landing Page",
  client_portal: "Client Portal",
  membership: "Membership",
  other: "Other",
};

export type WebsiteRow = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  status: WebsiteStatus;
  statusLabel: string;
  type: WebsiteType;
  typeLabel: string;
  thumbnailUrl: string | null;
  owner: string | null;
  launchedAt: string | null;
  updatedAt: string;

  client: { id: string; name: string } | null;
  jobId: string | null;

  hostingProvider: string | null;

  /** Recurring revenue, and where the number came from — null when unknown. */
  revenueCents: number | null;
  revenueSource: "renewal" | "subscription" | null;

  /** Null until a monitor is connected. Never zero. */
  uptimePct: number | null;
  performanceScore: number | null;
  trafficThisMonth: number | null;

  /** Real today: leads whose landing page was on this domain. */
  leadsThisMonth: number;

  health: WebsiteHealth;
  connectedProviders: string[];
};

export type RenewalRow = {
  websiteId: string | null;
  websiteName: string;
  domain: string | null;
  kind: string;
  renewsAt: string;
  amountCents: number | null;
  daysUntil: number;
};

export type DeploymentRow = {
  id: string;
  websiteId: string;
  websiteName: string;
  environment: string;
  status: string;
  deployedAt: string;
  url: string | null;
  gitBranch: string | null;
};

export type WebsiteFilters = {
  q?: string;
  tab: "all" | "live" | "development" | "maintenance" | "archived";
  client?: string;
  type?: string;
  status?: string;
  owner?: string;
  attention?: boolean;
  renewal?: "7" | "30" | "overdue";
};

export type WebsiteBoard = {
  kpis: {
    total: number;
    live: number;
    inDevelopment: number;
    hostingClients: number;
    monthlyRevenueCents: number;
    needingAttention: number;
  };
  tabCounts: Record<WebsiteFilters["tab"], number>;
  rows: WebsiteRow[];
  /** Every row before tab/filter narrowing — the panels describe the portfolio, not the filter. */
  totalMatching: number;
  healthBreakdown: { state: HealthState; label: string; count: number }[];
  byType: { type: WebsiteType; label: string; count: number }[];
  deployments: DeploymentRow[];
  renewals: RenewalRow[];
  topByLeads: { id: string; name: string; leads: number }[];
  /** Which providers have at least one connected row anywhere in the portfolio. */
  connected: { analytics: boolean; vercel: boolean; uptime: boolean; searchConsole: boolean };
  owners: string[];
  clients: { id: string; name: string }[];
};

/** Bare host: no scheme, no www, no trailing slash, lowercased. */
export function normalizeDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  let host = trimmed;
  try {
    host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    host = trimmed.replace(/^https?:\/\//, "").split("/")[0];
  }
  return host.replace(/^www\./, "").replace(/\/$/, "");
}

const DAY = 86_400_000;
const daysFromNow = (iso: string): number =>
  Math.round((new Date(iso).getTime() - Date.now()) / DAY);

export async function loadWebsiteBoard(
  sb: SupabaseClient,
  filters: WebsiteFilters
): Promise<WebsiteBoard> {
  const month = lastNDays(30);

  const [sites, integrations, renewalRows, deploymentRows, leads, seoIssues] = await Promise.all([
    sb
      .from("websites")
      .select(
        "id, name, domain, base_url, status, website_type, thumbnail_url, owner, launched_at, updated_at, hosting_provider, job_id, is_archived, customer_id, customers(id, name, business_name, mrr_cents, status)"
      )
      .order("name", { ascending: true })
      .then((r) => unwrap(r, "websites")),
    sb
      .from("website_integrations")
      .select("website_id, provider, status, error, last_synced_at")
      .then((r) => unwrap(r, "integrations")),
    sb
      .from("website_renewals")
      .select("id, website_id, kind, renews_at, amount_cents, vendor")
      .order("renews_at", { ascending: true })
      .then((r) => unwrap(r, "renewals")),
    sb
      .from("website_deployments")
      .select("id, website_id, environment, status, deployed_at, url, git_branch")
      .order("deployed_at", { ascending: false })
      .limit(40)
      .then((r) => unwrap(r, "deployments")),
    sb
      .from("leads")
      .select("id, created_at, landing_page, referrer, utm_source, utm_medium, fbclid, gclid, source")
      .gte("created_at", month.fromIso)
      .then((r) => unwrap(r, "leads")),
    // Only our own site is audited today, but the join is by path host so this
    // is already right the day a client site gets its own audit.
    sb
      .from("seo_issues")
      .select("path, severity, run_id, seo_audit_runs!inner(status)")
      .in("severity", ["critical", "high"])
      .then((r) => (r.error ? [] : (r.data ?? []))),
  ]);

  type CustomerLite = { id: string; name: string; business_name: string | null; mrr_cents: number | null; status: string };
  type SiteRaw = {
    id: string;
    name: string;
    domain: string;
    base_url: string | null;
    status: WebsiteStatus;
    website_type: WebsiteType;
    thumbnail_url: string | null;
    owner: string | null;
    launched_at: string | null;
    updated_at: string;
    hosting_provider: string | null;
    job_id: string | null;
    is_archived: boolean;
    customer_id: string | null;
    customers: CustomerLite | CustomerLite[] | null;
  };

  /** PostgREST returns an embedded row as an object or a one-element array. */
  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const siteRaw = sites as SiteRaw[];

  const integrationsBySite = new Map<string, { provider: string; status: string; error: string | null }[]>();
  for (const i of integrations as { website_id: string; provider: string; status: string; error: string | null }[]) {
    integrationsBySite.set(i.website_id, [...(integrationsBySite.get(i.website_id) ?? []), i]);
  }

  const renewalsBySite = new Map<string, { kind: string; renews_at: string; amount_cents: number | null }[]>();
  for (const r of renewalRows as { website_id: string; kind: string; renews_at: string; amount_cents: number | null }[]) {
    renewalsBySite.set(r.website_id, [...(renewalsBySite.get(r.website_id) ?? []), r]);
  }

  const deploysBySite = new Map<string, { status: string; deployed_at: string; environment: string }[]>();
  for (const d of deploymentRows as { website_id: string; status: string; deployed_at: string; environment: string }[]) {
    deploysBySite.set(d.website_id, [...(deploysBySite.get(d.website_id) ?? []), d]);
  }

  // ── Leads by the domain they landed on ─────────────────────────────
  // A lead belongs to the site it arrived through, which is a property of
  // the landing page's HOST — not of whichever client we think owns it.
  const hostOf = (url: string | null): string | null => {
    if (!url) return null;
    try {
      return new URL(url, "https://tomorrowstechai.com").hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return null;
    }
  };

  type LeadRow = {
    created_at: string;
    landing_page: string | null;
    referrer: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    fbclid: string | null;
    gclid: string | null;
    source: string;
  };

  const leadsByHost = new Map<string, number>();
  for (const l of leads as LeadRow[]) {
    const host = hostOf(l.landing_page);
    if (!host) continue;
    leadsByHost.set(host, (leadsByHost.get(host) ?? 0) + 1);
  }
  // attributionOf is imported so the per-site organic split stays available
  // to the detail screen without re-deriving the rules in two places.
  void attributionOf;

  // ── Serious SEO issues, by the host they were found on ─────────────
  const seoByHost = new Map<string, number>();
  for (const i of seoIssues as { path: string }[]) {
    const host = hostOf(i.path) ?? "tomorrowstechai.com";
    seoByHost.set(host, (seoByHost.get(host) ?? 0) + 1);
  }

  // ── Hosting revenue, without double counting ───────────────────────
  // A customer's mrr_cents is the CUSTOMER's subscription, not one site's.
  // When a client has two sites, attributing the same MRR to both would
  // double the portfolio total, so: a per-site hosting renewal wins when one
  // exists, the subscription is used only when the client owns exactly one
  // site, and otherwise the row shows nothing rather than a made-up split.
  const sitesPerCustomer = new Map<string, number>();
  for (const s of siteRaw) {
    if (!s.customer_id || s.is_archived) continue;
    sitesPerCustomer.set(s.customer_id, (sitesPerCustomer.get(s.customer_id) ?? 0) + 1);
  }

  const rowsAll: WebsiteRow[] = siteRaw.map((s) => {
    const customer = one<CustomerLite>(s.customers);
    const siteIntegrations = integrationsBySite.get(s.id) ?? [];
    const siteRenewals = renewalsBySite.get(s.id) ?? [];
    const deploys = deploysBySite.get(s.id) ?? [];
    const lastProd = deploys.find((d) => d.environment === "production") ?? null;

    const host = normalizeDomain(s.domain);
    const leadsThisMonth = leadsByHost.get(host) ?? 0;

    const hostingRenewal = siteRenewals.find((r) => r.kind === "hosting");
    let revenueCents: number | null = null;
    let revenueSource: WebsiteRow["revenueSource"] = null;
    if (hostingRenewal?.amount_cents != null) {
      revenueCents = hostingRenewal.amount_cents;
      revenueSource = "renewal";
    } else if (
      customer?.mrr_cents &&
      customer.mrr_cents > 0 &&
      s.customer_id &&
      sitesPerCustomer.get(s.customer_id) === 1
    ) {
      revenueCents = customer.mrr_cents;
      revenueSource = "subscription";
    }

    const health = scoreWebsite({
      status: s.status,
      isArchived: s.is_archived,
      integrations: siteIntegrations,
      renewals: siteRenewals.map((r) => ({ kind: r.kind, daysUntil: daysFromNow(r.renews_at) })),
      lastDeployment: lastProd
        ? { status: lastProd.status, daysAgo: Math.abs(daysFromNow(lastProd.deployed_at)) }
        : null,
      seoCriticalIssues: seoByHost.get(host) ?? null,
    });

    const connectedProviders = siteIntegrations
      .filter((i) => i.status === "connected")
      .map((i) => i.provider);

    return {
      id: s.id,
      name: s.name,
      domain: s.domain,
      baseUrl: s.base_url ?? `https://${s.domain}`,
      status: s.status,
      statusLabel: STATUS_LABELS[s.status] ?? s.status,
      type: s.website_type,
      typeLabel: TYPE_LABELS[s.website_type] ?? s.website_type,
      thumbnailUrl: s.thumbnail_url,
      owner: s.owner,
      launchedAt: s.launched_at,
      updatedAt: s.updated_at,
      client: customer ? { id: customer.id, name: customer.business_name || customer.name } : null,
      jobId: s.job_id,
      hostingProvider: s.hosting_provider,
      revenueCents,
      revenueSource,
      // Nothing writes these yet, and a zero would read as a measurement.
      uptimePct: connectedProviders.includes("uptime") ? null : null,
      performanceScore: connectedProviders.includes("pagespeed") ? null : null,
      trafficThisMonth: connectedProviders.includes("google_analytics") ? null : null,
      leadsThisMonth,
      health,
      connectedProviders,
    };
  });

  // ── Tabs and filters ───────────────────────────────────────────────
  const active = rowsAll.filter((r) => r.status !== "archived");

  const tabCounts: Record<WebsiteFilters["tab"], number> = {
    all: active.length,
    live: active.filter((r) => r.status === "live").length,
    development: active.filter((r) =>
      ["development", "review", "waiting_on_client"].includes(r.status)
    ).length,
    maintenance: active.filter((r) => r.status === "maintenance").length,
    archived: rowsAll.filter((r) => r.status === "archived").length,
  };

  const inTab = (r: WebsiteRow): boolean => {
    switch (filters.tab) {
      case "live":
        return r.status === "live";
      case "development":
        return ["development", "review", "waiting_on_client"].includes(r.status);
      case "maintenance":
        return r.status === "maintenance";
      case "archived":
        return r.status === "archived";
      default:
        return r.status !== "archived";
    }
  };

  const needle = filters.q?.toLowerCase().trim();

  const rows = rowsAll.filter((r) => {
    if (!inTab(r)) return false;
    if (needle) {
      const hay = `${r.name} ${r.domain} ${r.client?.name ?? ""} ${r.owner ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.client && r.client?.id !== filters.client) return false;
    if (filters.type && r.type !== filters.type) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.owner && r.owner !== filters.owner) return false;
    if (filters.attention && !needsAttention(r.health.state)) return false;

    if (filters.renewal) {
      const due = (renewalsBySite.get(r.id) ?? []).map((x) => daysFromNow(x.renews_at));
      if (due.length === 0) return false;
      const soonest = Math.min(...due);
      if (filters.renewal === "overdue" && soonest >= 0) return false;
      if (filters.renewal === "7" && !(soonest >= 0 && soonest <= 7)) return false;
      if (filters.renewal === "30" && !(soonest >= 0 && soonest <= 30)) return false;
    }
    return true;
  });

  // ── The KPI row ────────────────────────────────────────────────────
  // Revenue counts each PAYING CUSTOMER once, not each site, so a client
  // with three sites on one subscription does not treble the total.
  const payingCustomers = new Map<string, number>();
  for (const s of siteRaw) {
    if (s.is_archived || s.status === "archived") continue;
    const customer = one<CustomerLite>(s.customers);
    if (!customer || customer.status !== "active") continue;
    if ((customer.mrr_cents ?? 0) > 0) payingCustomers.set(customer.id, customer.mrr_cents ?? 0);
  }
  const subscriptionCents = [...payingCustomers.values()].reduce((t, v) => t + v, 0);
  // Per-site hosting renewals belonging to sites whose client is NOT already
  // counted above — otherwise the same money lands in the total twice.
  const extraHostingCents = active
    .filter((r) => r.revenueSource === "renewal" && (!r.client || !payingCustomers.has(r.client.id)))
    .reduce((t, r) => t + (r.revenueCents ?? 0), 0);

  const kpis = {
    total: active.length,
    live: tabCounts.live,
    inDevelopment: tabCounts.development,
    hostingClients: payingCustomers.size,
    monthlyRevenueCents: subscriptionCents + extraHostingCents,
    needingAttention: active.filter((r) => needsAttention(r.health.state)).length,
  };

  // ── Panels ─────────────────────────────────────────────────────────
  const HEALTH_ORDER: HealthState[] = [
    "healthy", "warning", "issue", "offline", "unmonitored", "development",
  ];
  const healthBreakdown = HEALTH_ORDER.map((state) => ({
    state,
    label: active.find((r) => r.health.state === state)?.health.label ?? state,
    count: active.filter((r) => r.health.state === state).length,
  })).filter((h) => h.count > 0);

  const byType = (Object.keys(TYPE_LABELS) as WebsiteType[])
    .map((type) => ({
      type,
      label: TYPE_LABELS[type],
      count: active.filter((r) => r.type === type).length,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const nameById = new Map(rowsAll.map((r) => [r.id, r] as const));

  const deployments: DeploymentRow[] = (
    deploymentRows as {
      id: string; website_id: string; environment: string; status: string;
      deployed_at: string; url: string | null; git_branch: string | null;
    }[]
  )
    .filter((d) => nameById.has(d.website_id))
    .slice(0, 6)
    .map((d) => ({
      id: d.id,
      websiteId: d.website_id,
      websiteName: nameById.get(d.website_id)!.name,
      environment: d.environment,
      status: d.status,
      deployedAt: d.deployed_at,
      url: d.url,
      gitBranch: d.git_branch,
    }));

  // Renewals come from two places and both are real: per-site domain/SSL/etc
  // rows, and the client's own Stripe subscription date.
  const siteRenewals: RenewalRow[] = (
    renewalRows as { website_id: string; kind: string; renews_at: string; amount_cents: number | null }[]
  )
    .filter((r) => nameById.has(r.website_id))
    .map((r) => ({
      websiteId: r.website_id,
      websiteName: nameById.get(r.website_id)!.name,
      domain: nameById.get(r.website_id)!.domain,
      kind: r.kind,
      renewsAt: r.renews_at,
      amountCents: r.amount_cents,
      daysUntil: daysFromNow(r.renews_at),
    }));

  const renewals = siteRenewals
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 8);

  const topByLeads = active
    .filter((r) => r.leadsThisMonth > 0)
    .sort((a, b) => b.leadsThisMonth - a.leadsThisMonth)
    .slice(0, 5)
    .map((r) => ({ id: r.id, name: r.name, leads: r.leadsThisMonth }));

  const anyConnected = (provider: string) =>
    (integrations as { provider: string; status: string }[]).some(
      (i) => i.provider === provider && i.status === "connected"
    );

  const owners = [...new Set(active.map((r) => r.owner).filter((o): o is string => !!o))].sort();
  const clients = [
    ...new Map(
      active.filter((r) => r.client).map((r) => [r.client!.id, r.client!] as const)
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    kpis,
    tabCounts,
    rows,
    totalMatching: rows.length,
    healthBreakdown,
    byType,
    deployments,
    renewals,
    topByLeads,
    connected: {
      analytics: anyConnected("google_analytics"),
      vercel: anyConnected("vercel"),
      uptime: anyConnected("uptime"),
      searchConsole: anyConnected("search_console"),
    },
    owners,
    clients,
  };
}
