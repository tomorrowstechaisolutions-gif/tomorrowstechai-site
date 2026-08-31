import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { lastNDays } from "@/lib/dashboard/period";
import { needsAttention, scoreWebsite, type HealthState } from "@/lib/websites/health";
import { computeProfit, type CostLine, type Profitability } from "./profit";

/**
 * Everything the Hosting screen shows.
 *
 * There is no hosting_accounts table. A hosting account IS a website that we
 * host — the same row the Websites screen reads — joined to the client who
 * pays for it, the invoices that billed them, the renewals that expire, the
 * costs it incurs and the incidents recorded against it. Asking a different
 * question of the same rows is the entire point; a second table would only
 * create a second version of the truth.
 *
 * What is real here today: accounts, plans, recurring revenue, MRR, ARR,
 * renewals, failed payments, incidents and derived health. What is not:
 * uptime, backups and deploy status, because no monitor, backup system or
 * Vercel token exists. Those render "Not connected", never a number.
 */

export type BillingState = "active" | "past_due" | "none" | "trial";

export type HostingRow = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  status: string;
  thumbnailUrl: string | null;
  owner: string | null;

  client: { id: string; name: string } | null;

  plan: { id: string; name: string; listCents: number } | null;
  /** What they are actually charged, which can differ from the list price. */
  priceCents: number | null;
  priceSource: "renewal" | "subscription" | null;

  provider: string | null;
  nextBillingAt: string | null;
  billing: BillingState;
  pastDueCents: number;

  /** Null until something is watching. Never zero. */
  uptimePct: number | null;
  lastBackupAt: string | null;
  deployStatus: string | null;
  sslState: "valid" | "expiring" | "expired" | "unknown";
  domainExpiresAt: string | null;

  openIncidents: number;
  worstIncident: "critical" | "high" | "medium" | "low" | null;

  health: { state: HealthState; label: string; reasons: { label: string; detail: string }[] };
  profit: Profitability;
};

export type IncidentRow = {
  id: string;
  websiteId: string;
  websiteName: string;
  domain: string;
  kind: string;
  severity: string;
  status: string;
  title: string;
  detail: string | null;
  detectedAt: string;
  source: string;
};

export type FailedPaymentRow = {
  id: string;
  customerId: string | null;
  clientName: string;
  amountCents: number;
  status: string;
  billedAt: string | null;
  receiptUrl: string | null;
};

export type HostingFilters = {
  q?: string;
  tab: "all" | "active" | "suspended" | "pending" | "cancelled";
  plan?: string;
  provider?: string;
  billing?: string;
  health?: string;
  attention?: boolean;
  renewal?: "7" | "30" | "overdue";
};

export type HostingBoard = {
  kpis: {
    clients: number;
    mrrCents: number;
    arrCents: number;
    activePlans: number;
    renewalsDue: number;
    renewalsDueCents: number;
    sitesWithIssues: number;
    arpuCents: number | null;
  };
  tabCounts: Record<HostingFilters["tab"], number>;
  rows: HostingRow[];
  planDistribution: { name: string; count: number; mrrCents: number }[];
  providerUsage: { name: string; count: number }[];
  renewals: {
    websiteId: string; websiteName: string; domain: string;
    kind: string; renewsAt: string; amountCents: number | null; daysUntil: number;
  }[];
  failedPayments: FailedPaymentRow[];
  incidents: IncidentRow[];
  deployments: { id: string; websiteName: string; environment: string; status: string; deployedAt: string; gitBranch: string | null }[];
  /** Ranked by margin, but only accounts whose margin is actually known. */
  profitable: { id: string; name: string; marginPct: number; grossCents: number }[];
  lowMargin: { id: string; name: string; marginPct: number; grossCents: number }[];
  costsKnown: number;
  monitoring: { uptime: boolean; deployments: boolean; backups: boolean };
  providers: string[];
  plans: { id: string; name: string }[];
};

const DAY = 86_400_000;
const daysFromNow = (iso: string): number => Math.round((new Date(iso).getTime() - Date.now()) / DAY);
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function loadHostingBoard(
  sb: SupabaseClient,
  filters: HostingFilters
): Promise<HostingBoard> {
  const window = lastNDays(90);

  const [sites, plans, costs, incidents, renewalRows, integrations, deployRows, invoiceRows] =
    await Promise.all([
      sb
        .from("websites")
        .select(
          "id, name, domain, base_url, status, thumbnail_url, owner, hosting_provider, hosting_plan_id, customer_id, is_archived, customers(id, name, business_name, mrr_cents, status, stripe_subscription_id, renews_at, renewal_amount_cents)"
        )
        .eq("is_archived", false)
        .order("name", { ascending: true })
        .then((r) => unwrap(r, "hosting accounts")),
      sb
        .from("catalog_items")
        .select("id, name, from_cents")
        .eq("category", "hosting")
        .order("position", { ascending: true })
        .then((r) => unwrap(r, "plans")),
      sb
        .from("website_costs")
        .select("website_id, label, category, amount_cents, interval, vendor, effective_to")
        .is("effective_to", null)
        .then((r) => unwrap(r, "costs")),
      sb
        .from("website_incidents")
        .select("id, website_id, kind, severity, status, title, detail, detected_at, source")
        .in("status", ["open", "acknowledged"])
        .order("detected_at", { ascending: false })
        .then((r) => unwrap(r, "incidents")),
      sb
        .from("website_renewals")
        .select("website_id, kind, renews_at, amount_cents")
        .order("renews_at", { ascending: true })
        .then((r) => unwrap(r, "renewals")),
      sb
        .from("website_integrations")
        .select("website_id, provider, status, error")
        .then((r) => unwrap(r, "integrations")),
      sb
        .from("website_deployments")
        .select("id, website_id, environment, status, deployed_at, git_branch")
        .order("deployed_at", { ascending: false })
        .limit(30)
        .then((r) => unwrap(r, "deployments")),
      // Hosting invoices only. A one-off launch fee is not recurring revenue
      // and must not land in MRR.
      sb
        .from("invoices")
        .select("id, customer_id, status, amount_cents, hosting_cents, billing, paid_at, sent_at, receipt_url, created_at")
        .gte("created_at", window.fromIso)
        .then((r) => unwrap(r, "invoices")),
    ]);

  type CustomerLite = {
    id: string; name: string; business_name: string | null; mrr_cents: number | null;
    status: string; stripe_subscription_id: string | null;
    renews_at: string | null; renewal_amount_cents: number | null;
  };
  type SiteRaw = {
    id: string; name: string; domain: string; base_url: string | null; status: string;
    thumbnail_url: string | null; owner: string | null; hosting_provider: string | null;
    hosting_plan_id: string | null; customer_id: string | null; is_archived: boolean;
    customers: CustomerLite | CustomerLite[] | null;
  };

  const siteRaw = sites as SiteRaw[];
  const planRows = plans as { id: string; name: string; from_cents: number }[];
  const planById = new Map(planRows.map((p) => [p.id, p] as const));

  const costsBySite = new Map<string, CostLine[]>();
  for (const c of costs as { website_id: string; label: string; category: string; amount_cents: number; interval: CostLine["interval"]; vendor: string | null }[]) {
    costsBySite.set(c.website_id, [
      ...(costsBySite.get(c.website_id) ?? []),
      { label: c.label, category: c.category, amountCents: c.amount_cents, interval: c.interval, vendor: c.vendor },
    ]);
  }

  const incidentsBySite = new Map<string, { severity: string }[]>();
  for (const i of incidents as { website_id: string; severity: string }[]) {
    incidentsBySite.set(i.website_id, [...(incidentsBySite.get(i.website_id) ?? []), i]);
  }

  const renewalsBySite = new Map<string, { kind: string; renews_at: string; amount_cents: number | null }[]>();
  for (const r of renewalRows as { website_id: string; kind: string; renews_at: string; amount_cents: number | null }[]) {
    renewalsBySite.set(r.website_id, [...(renewalsBySite.get(r.website_id) ?? []), r]);
  }

  const integrationsBySite = new Map<string, { provider: string; status: string; error: string | null }[]>();
  for (const i of integrations as { website_id: string; provider: string; status: string; error: string | null }[]) {
    integrationsBySite.set(i.website_id, [...(integrationsBySite.get(i.website_id) ?? []), i]);
  }

  const deploysBySite = new Map<string, { status: string; deployed_at: string; environment: string }[]>();
  for (const d of deployRows as { website_id: string; status: string; deployed_at: string; environment: string }[]) {
    deploysBySite.set(d.website_id, [...(deploysBySite.get(d.website_id) ?? []), d]);
  }

  type InvoiceRaw = {
    id: string; customer_id: string | null; status: string; amount_cents: number | null;
    hosting_cents: number | null; billing: string | null; paid_at: string | null;
    sent_at: string | null; receipt_url: string | null; created_at: string;
  };
  const invoices = invoiceRows as InvoiceRaw[];

  const FAILED = ["failed", "past_due", "uncollectible", "expired"];
  const pastDueByCustomer = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.customer_id || !FAILED.includes(inv.status)) continue;
    const amount = inv.amount_cents ?? inv.hosting_cents ?? 0;
    pastDueByCustomer.set(inv.customer_id, (pastDueByCustomer.get(inv.customer_id) ?? 0) + amount);
  }

  // Same rule as the Websites screen: a per-site hosting renewal wins, the
  // client's subscription is used only when they own exactly one site, and
  // otherwise the price is unknown rather than split by guesswork.
  const sitesPerCustomer = new Map<string, number>();
  for (const s of siteRaw) {
    if (!s.customer_id) continue;
    sitesPerCustomer.set(s.customer_id, (sitesPerCustomer.get(s.customer_id) ?? 0) + 1);
  }

  const rowsAll: HostingRow[] = siteRaw.map((s) => {
    const customer = one<CustomerLite>(s.customers);
    const siteRenewals = renewalsBySite.get(s.id) ?? [];
    const siteIntegrations = integrationsBySite.get(s.id) ?? [];
    const siteIncidents = incidentsBySite.get(s.id) ?? [];
    const deploys = deploysBySite.get(s.id) ?? [];
    const lastProd = deploys.find((d) => d.environment === "production") ?? null;

    const hostingRenewal = siteRenewals.find((r) => r.kind === "hosting");
    let priceCents: number | null = null;
    let priceSource: HostingRow["priceSource"] = null;
    if (hostingRenewal?.amount_cents != null) {
      priceCents = hostingRenewal.amount_cents;
      priceSource = "renewal";
    } else if (
      customer?.mrr_cents &&
      customer.mrr_cents > 0 &&
      s.customer_id &&
      sitesPerCustomer.get(s.customer_id) === 1
    ) {
      priceCents = customer.mrr_cents;
      priceSource = "subscription";
    }

    // SSL and domain state come from renewal rows, which is the only place
    // this system has ever been told when they expire.
    const ssl = siteRenewals.find((r) => r.kind === "ssl");
    const sslDays = ssl ? daysFromNow(ssl.renews_at) : null;
    const sslState: HostingRow["sslState"] =
      sslDays === null ? "unknown" : sslDays < 0 ? "expired" : sslDays <= 30 ? "expiring" : "valid";

    const domainRenewal = siteRenewals.find((r) => r.kind === "domain");

    const pastDueCents = s.customer_id ? (pastDueByCustomer.get(s.customer_id) ?? 0) : 0;
    const billing: BillingState =
      pastDueCents > 0
        ? "past_due"
        : customer?.stripe_subscription_id
          ? "active"
          : (priceCents ?? 0) > 0
            ? "active"
            : "none";

    const health = scoreWebsite({
      status: s.status,
      isArchived: s.is_archived,
      integrations: siteIntegrations,
      renewals: siteRenewals.map((r) => ({ kind: r.kind, daysUntil: daysFromNow(r.renews_at) })),
      lastDeployment: lastProd
        ? { status: lastProd.status, daysAgo: Math.abs(daysFromNow(lastProd.deployed_at)) }
        : null,
      seoCriticalIssues: null,
    });

    // Hosting adds two signals the Websites screen does not carry: money owed
    // and recorded incidents. Both belong in the reason list a person reads.
    const reasons = health.reasons.map((r) => ({ label: r.label, detail: r.detail }));
    if (pastDueCents > 0) {
      reasons.unshift({
        label: "Payment past due",
        detail: `${(pastDueCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} outstanding.`,
      });
    }
    for (const i of siteIncidents) {
      reasons.unshift({ label: "Open incident", detail: `Severity ${i.severity}.` });
    }

    const severities = siteIncidents.map((i) => i.severity);
    const worst: HostingRow["worstIncident"] =
      severities.includes("critical") ? "critical"
      : severities.includes("high") ? "high"
      : severities.includes("medium") ? "medium"
      : severities.includes("low") ? "low"
      : null;

    // An account with money owed or a live incident is not healthy, whatever
    // the infrastructure says.
    const state: HealthState =
      pastDueCents > 0 || worst === "critical" || worst === "high"
        ? "issue"
        : worst
          ? "warning"
          : health.state;

    const plan = s.hosting_plan_id ? (planById.get(s.hosting_plan_id) ?? null) : null;

    return {
      id: s.id,
      name: s.name,
      domain: s.domain,
      baseUrl: s.base_url ?? `https://${s.domain}`,
      status: s.status,
      thumbnailUrl: s.thumbnail_url,
      owner: s.owner,
      client: customer ? { id: customer.id, name: customer.business_name || customer.name } : null,
      plan: plan ? { id: plan.id, name: plan.name, listCents: plan.from_cents } : null,
      priceCents,
      priceSource,
      provider: s.hosting_provider,
      nextBillingAt: customer?.renews_at ?? hostingRenewal?.renews_at ?? null,
      billing,
      pastDueCents,
      // Nothing writes these. A zero would read as a measurement.
      uptimePct: null,
      lastBackupAt: null,
      deployStatus: lastProd?.status ?? null,
      sslState,
      domainExpiresAt: domainRenewal?.renews_at ?? null,
      openIncidents: siteIncidents.length,
      worstIncident: worst,
      health: { state, label: state === health.state ? health.label : state === "issue" ? "Issue" : "Warning", reasons },
      profit: computeProfit({
        revenueCents: priceCents,
        costs: costsBySite.get(s.id) ?? [],
        billedThroughStripe: Boolean(customer?.stripe_subscription_id),
      }),
    };
  });

  // ── Tabs and filters ───────────────────────────────────────────────
  const tabCounts: Record<HostingFilters["tab"], number> = {
    all: rowsAll.length,
    active: rowsAll.filter((r) => r.status === "live").length,
    suspended: rowsAll.filter((r) => r.status === "paused" || r.status === "issue").length,
    pending: rowsAll.filter((r) =>
      ["development", "review", "waiting_on_client"].includes(r.status)
    ).length,
    cancelled: rowsAll.filter((r) => r.status === "archived").length,
  };

  const inTab = (r: HostingRow): boolean => {
    switch (filters.tab) {
      case "active": return r.status === "live";
      case "suspended": return r.status === "paused" || r.status === "issue";
      case "pending": return ["development", "review", "waiting_on_client"].includes(r.status);
      case "cancelled": return r.status === "archived";
      default: return true;
    }
  };

  const needle = filters.q?.toLowerCase().trim();

  const rows = rowsAll.filter((r) => {
    if (!inTab(r)) return false;
    if (needle) {
      const hay = `${r.name} ${r.domain} ${r.client?.name ?? ""} ${r.plan?.name ?? ""} ${r.provider ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.plan && r.plan?.id !== filters.plan) return false;
    if (filters.provider && r.provider !== filters.provider) return false;
    if (filters.billing && r.billing !== filters.billing) return false;
    if (filters.health && r.health.state !== filters.health) return false;
    if (filters.attention && !needsAttention(r.health.state) && r.pastDueCents === 0) return false;
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

  // ── Money ──────────────────────────────────────────────────────────
  // MRR counts each PAYING CLIENT once. A client with three hosted sites on
  // one subscription is one subscription, and counting it three times is the
  // single easiest way to make this dashboard lie about the business.
  const payingCustomers = new Map<string, number>();
  for (const s of siteRaw) {
    const customer = one<CustomerLite>(s.customers);
    if (!customer || customer.status !== "active") continue;
    if ((customer.mrr_cents ?? 0) > 0) payingCustomers.set(customer.id, customer.mrr_cents ?? 0);
  }
  const subscriptionCents = [...payingCustomers.values()].reduce((t, v) => t + v, 0);
  const extraHostingCents = rowsAll
    .filter((r) => r.priceSource === "renewal" && (!r.client || !payingCustomers.has(r.client.id)))
    .reduce((t, r) => t + (r.priceCents ?? 0), 0);

  const mrrCents = subscriptionCents + extraHostingCents;
  const clients = new Set(rowsAll.filter((r) => r.client).map((r) => r.client!.id)).size;

  const allRenewals = rowsAll.flatMap((r) =>
    (renewalsBySite.get(r.id) ?? []).map((x) => ({
      websiteId: r.id,
      websiteName: r.name,
      domain: r.domain,
      kind: x.kind,
      renewsAt: x.renews_at,
      amountCents: x.amount_cents,
      daysUntil: daysFromNow(x.renews_at),
    }))
  );
  const dueSoon = allRenewals.filter((r) => r.daysUntil <= 30);

  const sitesWithIssues = rowsAll.filter(
    (r) => needsAttention(r.health.state) || r.pastDueCents > 0 || r.openIncidents > 0
  ).length;

  // ── Panels ─────────────────────────────────────────────────────────
  const planDistribution = planRows
    .map((p) => {
      const on = rowsAll.filter((r) => r.plan?.id === p.id);
      return {
        name: p.name,
        count: on.length,
        mrrCents: on.reduce((t, r) => t + (r.priceCents ?? 0), 0),
      };
    })
    .filter((p) => p.count > 0);

  const unassigned = rowsAll.filter((r) => !r.plan).length;
  if (unassigned > 0) planDistribution.push({ name: "No plan assigned", count: unassigned, mrrCents: 0 });

  const providers = [...new Set(rowsAll.map((r) => r.provider).filter((p): p is string => Boolean(p)))];
  const providerUsage = providers
    .map((name) => ({ name, count: rowsAll.filter((r) => r.provider === name).length }))
    .sort((a, b) => b.count - a.count);

  const failedPayments: FailedPaymentRow[] = invoices
    .filter((inv) => FAILED.includes(inv.status))
    .slice(0, 6)
    .map((inv) => {
      const site = rowsAll.find((r) => r.client?.id === inv.customer_id);
      return {
        id: inv.id,
        customerId: inv.customer_id,
        clientName: site?.client?.name ?? "Unknown client",
        amountCents: inv.amount_cents ?? inv.hosting_cents ?? 0,
        status: inv.status,
        billedAt: inv.sent_at ?? inv.created_at,
        receiptUrl: inv.receipt_url,
      };
    });

  const nameById = new Map(rowsAll.map((r) => [r.id, r] as const));

  const incidentRows: IncidentRow[] = (
    incidents as { id: string; website_id: string; kind: string; severity: string; status: string; title: string; detail: string | null; detected_at: string; source: string }[]
  )
    .filter((i) => nameById.has(i.website_id))
    .slice(0, 8)
    .map((i) => ({
      id: i.id,
      websiteId: i.website_id,
      websiteName: nameById.get(i.website_id)!.name,
      domain: nameById.get(i.website_id)!.domain,
      kind: i.kind,
      severity: i.severity,
      status: i.status,
      title: i.title,
      detail: i.detail,
      detectedAt: i.detected_at,
      source: i.source,
    }));

  const deployments = (deployRows as { id: string; website_id: string; environment: string; status: string; deployed_at: string; git_branch: string | null }[])
    .filter((d) => nameById.has(d.website_id))
    .slice(0, 6)
    .map((d) => ({
      id: d.id,
      websiteName: nameById.get(d.website_id)!.name,
      environment: d.environment,
      status: d.status,
      deployedAt: d.deployed_at,
      gitBranch: d.git_branch,
    }));

  // Only accounts whose margin is actually KNOWN can be ranked by it.
  const withMargin = rowsAll
    .filter((r) => r.profit.marginPct !== null && r.profit.grossCents !== null)
    .map((r) => ({ id: r.id, name: r.name, marginPct: r.profit.marginPct!, grossCents: r.profit.grossCents! }));

  const anyIntegration = (provider: string) =>
    (integrations as { provider: string; status: string }[]).some(
      (i) => i.provider === provider && i.status === "connected"
    );

  return {
    kpis: {
      clients,
      mrrCents,
      arrCents: mrrCents * 12,
      activePlans: rowsAll.filter((r) => r.plan && r.status === "live").length,
      renewalsDue: dueSoon.length,
      renewalsDueCents: dueSoon.reduce((t, r) => t + (r.amountCents ?? 0), 0),
      sitesWithIssues,
      arpuCents: clients > 0 ? Math.round(mrrCents / clients) : null,
    },
    tabCounts,
    rows,
    planDistribution,
    providerUsage,
    renewals: allRenewals.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 8),
    failedPayments,
    incidents: incidentRows,
    deployments,
    profitable: [...withMargin].sort((a, b) => b.marginPct - a.marginPct).slice(0, 5),
    lowMargin: [...withMargin].sort((a, b) => a.marginPct - b.marginPct).slice(0, 5),
    costsKnown: rowsAll.filter((r) => r.profit.costCents !== null).length,
    monitoring: {
      uptime: anyIntegration("uptime"),
      deployments: anyIntegration("vercel"),
      backups: false,
    },
    providers,
    plans: planRows.map((p) => ({ id: p.id, name: p.name })),
  };
}
