import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { deltaPct, monthToDate } from "@/lib/dashboard/period";
import { SERVICE_LABELS } from "@/lib/dashboard/services";
import { scoreClient, type ClientHealth } from "./health";
import type { RevenueCategory } from "@/lib/supabase/types";

/**
 * Everything the Clients screen shows, from six queries.
 *
 * The whole customer list is fetched, then filtered and paginated in memory.
 * That is a deliberate choice at this scale: the aggregates in the right-hand
 * rail — revenue by service, locations, the health breakdown — are over ALL
 * clients, not the visible page, so the rows have to be in hand anyway.
 * Past a few thousand clients this becomes a set of SQL views; the seam is
 * this function and nothing above it needs to change.
 */

export type ClientStatus = "active" | "paused" | "churned";

export type ClientRow = {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  businessType: string | null;
  city: string | null;
  state: string | null;
  owner: string | null;
  tags: string[];
  status: ClientStatus;
  wonAt: string;
  churnedAt: string | null;
  mrrCents: number;
  renewsAt: string | null;
  renewalAmountCents: number;
  /** Everything they have ever paid. */
  lifetimeCents: number;
  /** Service lines they have actually bought, most spent first. */
  services: { key: RevenueCategory; label: string }[];
  projectCount: number;
  activeProjectCount: number;
  latestRating: number | null;
  lastActivityAt: string | null;
  health: ClientHealth;
  href: string;
};

export type ClientKpi = {
  key: string;
  label: string;
  value: number;
  format: "money" | "count" | "rating";
  delta: number | null;
  hint: string | null;
};

export type NamedShare = { label: string; value: number; share: number };

export type RenewalRow = {
  id: string;
  businessName: string;
  what: string;
  renewsAt: string;
  amountCents: number;
  daysAway: number;
  href: string;
};

export type ClientActivityItem = {
  id: string;
  client: string;
  clientId: string;
  title: string;
  at: string;
  kind: "revenue" | "invoice" | "project" | "rating" | "won";
};

export type ClientsBoard = {
  kpis: ClientKpi[];
  rows: ClientRow[];
  /** Counts for the tab strip, before the tab filter is applied. */
  tabCounts: { all: number; active: number; paused: number; churned: number };
  total: number;
  page: number;
  pageCount: number;
  revenueByService: NamedShare[];
  revenueTotalCents: number;
  locations: NamedShare[];
  healthBreakdown: { band: string; label: string; count: number; share: number }[];
  renewals: RenewalRow[];
  topByRevenue: { id: string; name: string; cents: number; share: number; href: string }[];
  activity: ClientActivityItem[];
  satisfaction: {
    average: number | null;
    delta: number | null;
    counts: { rating: number; count: number; share: number }[];
    responses: number;
  };
  owners: string[];
  serviceOptions: { key: RevenueCategory; label: string }[];
  tagOptions: string[];
};

export type ClientFilters = {
  q?: string;
  tab?: "all" | "active" | "paused" | "churned";
  service?: string;
  owner?: string;
  tag?: string;
  health?: "excellent" | "good" | "average" | "poor";
  page?: number;
};

const PAGE_SIZE = 10;
const DAY = 86400_000;

export async function loadClientsBoard(
  sb: SupabaseClient,
  filters: ClientFilters = {}
): Promise<ClientsBoard> {
  const { current, previous } = monthToDate();
  const now = Date.now();

  const [customers, revenue, invoices, jobs, ratings, jobEvents] = await Promise.all([
    sb
      .from("customers")
      .select(
        "id, name, business_name, email, phone, business_type, city, state, owner, tags, status, won_at, churned_at, mrr_cents, renews_at, renewal_amount_cents, updated_at, lead_id"
      )
      .order("won_at", { ascending: false })
      .then((r) => unwrap(r, "customers")),
    sb
      .from("revenue_events")
      .select("customer_id, category, amount_cents, occurred_at, description")
      .not("customer_id", "is", null)
      .then((r) => unwrap(r, "client revenue")),
    sb
      .from("invoices")
      .select("id, customer_id, kind, status, amount_cents, launch_cents, description, sent_at, paid_at, expires_at")
      .not("customer_id", "is", null)
      .then((r) => unwrap(r, "client invoices")),
    sb
      .from("jobs")
      .select("id, customer_id, title, stage, due_at, completed_at, created_at")
      .not("customer_id", "is", null)
      .then((r) => unwrap(r, "client jobs")),
    sb
      .from("client_satisfaction")
      .select("customer_id, rating, recorded_at, occasion")
      .order("recorded_at", { ascending: false })
      .then((r) => unwrap(r, "satisfaction")),
    sb
      .from("job_events")
      .select("job_id, kind, body, created_at")
      .order("created_at", { ascending: false })
      .limit(120)
      .then((r) => unwrap(r, "job events")),
  ]);

  type CustomerRaw = {
    id: string;
    name: string | null;
    business_name: string | null;
    email: string;
    phone: string | null;
    business_type: string | null;
    city: string | null;
    state: string | null;
    owner: string | null;
    tags: string[] | null;
    status: ClientStatus;
    won_at: string;
    churned_at: string | null;
    mrr_cents: number;
    renews_at: string | null;
    renewal_amount_cents: number;
    updated_at: string;
    lead_id: string | null;
  };
  type RevenueRaw = {
    customer_id: string;
    category: RevenueCategory;
    amount_cents: number;
    occurred_at: string;
    description: string | null;
  };
  type InvoiceRaw = {
    id: string;
    customer_id: string;
    kind: "launch" | "upsell";
    status: string;
    amount_cents: number;
    launch_cents: number;
    description: string | null;
    sent_at: string;
    paid_at: string | null;
    expires_at: string | null;
  };
  type JobRaw = {
    id: string;
    customer_id: string;
    title: string;
    stage: string;
    due_at: string | null;
    completed_at: string | null;
    created_at: string;
  };
  type RatingRaw = {
    customer_id: string;
    rating: number;
    recorded_at: string;
    occasion: string;
  };

  const customerRows = customers as CustomerRaw[];
  const revenueRows = revenue as RevenueRaw[];
  const invoiceRows = invoices as InvoiceRaw[];
  const jobRows = jobs as JobRaw[];
  const ratingRows = ratings as RatingRaw[];

  /* ── Group everything by client, once ──────────────────────────── */
  const byClient = new Map<
    string,
    {
      revenue: RevenueRaw[];
      invoices: InvoiceRaw[];
      jobs: JobRaw[];
      ratings: RatingRaw[];
    }
  >();
  for (const c of customerRows) {
    byClient.set(c.id, { revenue: [], invoices: [], jobs: [], ratings: [] });
  }
  for (const r of revenueRows) byClient.get(r.customer_id)?.revenue.push(r);
  for (const i of invoiceRows) byClient.get(i.customer_id)?.invoices.push(i);
  for (const j of jobRows) byClient.get(j.customer_id)?.jobs.push(j);
  for (const r of ratingRows) byClient.get(r.customer_id)?.ratings.push(r);

  const jobToCustomer = new Map(jobRows.map((j) => [j.id, j.customer_id]));

  const invoiceValue = (i: InvoiceRaw) =>
    i.kind === "launch" ? i.launch_cents : i.amount_cents;

  /* ── Build a row per client ────────────────────────────────────── */
  const all: ClientRow[] = customerRows.map((c) => {
    const bundle = byClient.get(c.id)!;

    const lifetimeCents = bundle.revenue.reduce((t, r) => t + r.amount_cents, 0);

    const spendByService = new Map<RevenueCategory, number>();
    for (const r of bundle.revenue) {
      spendByService.set(r.category, (spendByService.get(r.category) ?? 0) + r.amount_cents);
    }
    const services = [...spendByService.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => ({ key, label: SERVICE_LABELS[key] ?? key }));

    const openInvoices = bundle.invoices
      .filter((i) => i.status === "sent")
      .map((i) => ({
        daysOut: Math.floor((now - new Date(i.sent_at).getTime()) / DAY),
        expired: i.expires_at !== null && new Date(i.expires_at).getTime() < now,
      }));

    const openJobs = bundle.jobs.filter((j) => j.completed_at === null && j.stage !== "Complete");
    const projectHealth = openJobs.map((j) => ({
      daysLate: j.due_at === null ? 0 : Math.floor((now - new Date(j.due_at).getTime()) / DAY),
    }));

    // Latest activity across everything that touches this account.
    const stamps: string[] = [
      c.won_at,
      ...bundle.revenue.map((r) => r.occurred_at),
      ...bundle.invoices.map((i) => i.paid_at ?? i.sent_at),
      ...bundle.jobs.map((j) => j.created_at),
      ...bundle.ratings.map((r) => r.recorded_at),
    ].filter(Boolean);
    for (const e of jobEvents as { job_id: string; created_at: string }[]) {
      if (jobToCustomer.get(e.job_id) === c.id) stamps.push(e.created_at);
    }
    const lastActivityAt = stamps.length
      ? stamps.reduce((a, b) => (a > b ? a : b))
      : null;

    // Ratings arrive newest-first from the query, so index 0 is the latest.
    const latestRating = bundle.ratings.length > 0 ? bundle.ratings[0].rating : null;

    const daysSinceActivity = lastActivityAt
      ? Math.floor((now - new Date(lastActivityAt).getTime()) / DAY)
      : null;

    const health = scoreClient({
      status: c.status,
      openInvoices,
      projects: projectHealth,
      daysSinceActivity,
      latestRating,
    });

    return {
      id: c.id,
      businessName: c.business_name || c.name || c.email,
      contactName: c.name,
      email: c.email,
      phone: c.phone,
      businessType: c.business_type,
      city: c.city,
      state: c.state,
      owner: c.owner,
      tags: c.tags ?? [],
      status: c.status,
      wonAt: c.won_at,
      churnedAt: c.churned_at,
      mrrCents: c.mrr_cents,
      renewsAt: c.renews_at,
      renewalAmountCents: c.renewal_amount_cents,
      lifetimeCents,
      services,
      projectCount: bundle.jobs.length,
      activeProjectCount: openJobs.length,
      latestRating,
      lastActivityAt,
      health,
      href: `/admin/clients/${c.id}`,
    };
  });

  /* ── KPIs ──────────────────────────────────────────────────────── */
  const active = all.filter((c) => c.status === "active");
  const paused = all.filter((c) => c.status === "paused");
  const churned = all.filter((c) => c.status === "churned");

  // How many clients existed at the end of the comparison window. won_at is a
  // real timestamp, so this is a fact rather than a reconstruction.
  const clientsAtPrevEnd = all.filter((c) => c.wonAt < previous.toIso).length;

  const revenueThisMonth = revenueRows
    .filter((r) => r.occurred_at >= current.fromIso && r.occurred_at < current.toIso)
    .reduce((t, r) => t + r.amount_cents, 0);
  const revenuePrevMonth = revenueRows
    .filter((r) => r.occurred_at >= previous.fromIso && r.occurred_at < previous.toIso)
    .reduce((t, r) => t + r.amount_cents, 0);

  const lifetimeTotal = revenueRows.reduce((t, r) => t + r.amount_cents, 0);
  const mrrTotal = active.reduce((t, c) => t + c.mrrCents, 0);
  const projectsInProgress = all.reduce((t, c) => t + c.activeProjectCount, 0);

  const wonThisMonth = all.filter(
    (c) => c.wonAt >= current.fromIso && c.wonAt < current.toIso
  ).length;

  // Satisfaction: the average of each client's most recent rating, so one
  // enthusiastic client rated five times does not outvote everyone else.
  const rated = all.filter((c) => c.latestRating !== null);
  const satisfactionAvg =
    rated.length > 0
      ? rated.reduce((t, c) => t + (c.latestRating ?? 0), 0) / rated.length
      : null;

  const ratingsThisMonth = ratingRows.filter(
    (r) => r.recorded_at >= current.fromIso && r.recorded_at < current.toIso
  );
  const ratingsPrevMonth = ratingRows.filter(
    (r) => r.recorded_at >= previous.fromIso && r.recorded_at < previous.toIso
  );
  const avgOf = (rows: RatingRaw[]) =>
    rows.length > 0 ? rows.reduce((t, r) => t + r.rating, 0) / rows.length : null;
  const avgNow = avgOf(ratingsThisMonth);
  const avgPrev = avgOf(ratingsPrevMonth);

  const kpis: ClientKpi[] = [
    {
      key: "total",
      label: "Total clients",
      value: all.length,
      format: "count",
      delta: deltaPct(all.length, clientsAtPrevEnd),
      hint: wonThisMonth > 0 ? `+${wonThisMonth} won this month` : "None won yet this month",
    },
    {
      key: "active",
      label: "Active clients",
      value: active.length,
      format: "count",
      delta: null,
      hint:
        paused.length > 0
          ? `${paused.length} payment${paused.length === 1 ? "" : "s"} failing`
          : churned.length > 0
            ? `${churned.length} churned all time`
            : "All paying",
    },
    {
      key: "revenue",
      label: "Total revenue",
      value: lifetimeTotal,
      format: "money",
      delta: deltaPct(revenueThisMonth, revenuePrevMonth),
      hint: "All time",
    },
    {
      key: "mrr",
      label: "MRR",
      value: mrrTotal,
      format: "money",
      delta: null,
      hint: `${active.length} subscription${active.length === 1 ? "" : "s"}`,
    },
    {
      key: "projects",
      label: "Projects in progress",
      value: projectsInProgress,
      format: "count",
      delta: null,
      hint:
        projectsInProgress > 0
          ? `Across ${all.filter((c) => c.activeProjectCount > 0).length} clients`
          : "Nothing in delivery",
    },
    {
      key: "satisfaction",
      label: "Satisfaction",
      value: satisfactionAvg ?? 0,
      format: "rating",
      delta: avgNow !== null && avgPrev !== null ? deltaPct(avgNow, avgPrev) : null,
      hint:
        rated.length > 0
          ? `${rated.length} of ${all.length} clients rated`
          : "No one asked yet",
    },
  ];

  /* ── Rail: revenue by service ──────────────────────────────────── */
  const serviceTotals = new Map<RevenueCategory, number>();
  for (const r of revenueRows) {
    serviceTotals.set(r.category, (serviceTotals.get(r.category) ?? 0) + r.amount_cents);
  }
  const revenueByService: NamedShare[] = [...serviceTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      label: SERVICE_LABELS[key] ?? key,
      value,
      share: lifetimeTotal > 0 ? value / lifetimeTotal : 0,
    }));

  /* ── Rail: locations ───────────────────────────────────────────── */
  const locationTotals = new Map<string, number>();
  let located = 0;
  for (const c of all) {
    if (!c.city && !c.state) continue;
    located++;
    const label = [c.city, c.state].filter(Boolean).join(", ");
    locationTotals.set(label, (locationTotals.get(label) ?? 0) + 1);
  }
  const ranked = [...locationTotals.entries()].sort((a, b) => b[1] - a[1]);
  const topLocations = ranked.slice(0, 4);
  const otherCount = ranked.slice(4).reduce((t, [, n]) => t + n, 0);
  const locations: NamedShare[] = [
    ...topLocations.map(([label, value]) => ({
      label,
      value,
      share: located > 0 ? value / located : 0,
    })),
    ...(otherCount > 0
      ? [{ label: "Other", value: otherCount, share: located > 0 ? otherCount / located : 0 }]
      : []),
  ];

  /* ── Rail: health breakdown ────────────────────────────────────── */
  const bandOrder = [
    { band: "excellent", label: "Excellent (80-100)" },
    { band: "good", label: "Good (60-79)" },
    { band: "average", label: "Average (40-59)" },
    { band: "poor", label: "Poor (0-39)" },
  ];
  const healthBreakdown = bandOrder.map((b) => {
    const count = all.filter((c) => c.health.band === b.band).length;
    return { ...b, count, share: all.length > 0 ? count / all.length : 0 };
  });

  /* ── Rail: upcoming renewals ───────────────────────────────────── */
  const renewals: RenewalRow[] = all
    .filter((c) => c.status === "active" && c.renewsAt !== null)
    .map((c) => ({
      id: c.id,
      businessName: c.businessName,
      what:
        c.services.length > 0
          ? c.services.map((s) => s.label).slice(0, 2).join(" + ")
          : "Hosting & management",
      renewsAt: c.renewsAt!,
      amountCents: c.renewalAmountCents || c.mrrCents,
      daysAway: Math.ceil((new Date(c.renewsAt!).getTime() - now) / DAY),
      href: c.href,
    }))
    .filter((r) => r.daysAway <= 60)
    .sort((a, b) => a.renewsAt.localeCompare(b.renewsAt))
    .slice(0, 5);

  /* ── Bottom: top clients by revenue ────────────────────────────── */
  const topByRevenue = all
    .filter((c) => c.lifetimeCents > 0)
    .sort((a, b) => b.lifetimeCents - a.lifetimeCents)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.businessName,
      cents: c.lifetimeCents,
      share: lifetimeTotal > 0 ? c.lifetimeCents / lifetimeTotal : 0,
      href: c.href,
    }));

  /* ── Bottom: recent client activity ────────────────────────────── */
  const nameFor = new Map(all.map((c) => [c.id, c.businessName]));
  const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

  const activity: ClientActivityItem[] = [
    ...revenueRows.map((r) => ({
      id: `rev:${r.customer_id}:${r.occurred_at}`,
      clientId: r.customer_id,
      client: nameFor.get(r.customer_id) ?? "Unknown client",
      title: `${money(r.amount_cents)} booked — ${r.description ?? SERVICE_LABELS[r.category] ?? r.category}`,
      at: r.occurred_at,
      kind: "revenue" as const,
    })),
    ...invoiceRows.map((i) => ({
      id: `inv:${i.id}`,
      clientId: i.customer_id,
      client: nameFor.get(i.customer_id) ?? "Unknown client",
      title:
        i.status === "paid"
          ? `Invoice paid — ${money(invoiceValue(i))}`
          : `Checkout link sent — ${money(invoiceValue(i))}`,
      at: i.paid_at ?? i.sent_at,
      kind: "invoice" as const,
    })),
    ...jobRows.map((j) => ({
      id: `job:${j.id}`,
      clientId: j.customer_id,
      client: nameFor.get(j.customer_id) ?? "Unknown client",
      title:
        j.completed_at !== null
          ? `Project "${j.title}" completed`
          : `Project "${j.title}" at ${j.stage}`,
      at: j.completed_at ?? j.created_at,
      kind: "project" as const,
    })),
    ...ratingRows.map((r) => ({
      id: `rat:${r.customer_id}:${r.recorded_at}`,
      clientId: r.customer_id,
      client: nameFor.get(r.customer_id) ?? "Unknown client",
      title: `Rated ${r.rating} out of 5 at ${r.occasion.replace(/_/g, " ")}`,
      at: r.recorded_at,
      kind: "rating" as const,
    })),
    ...all.map((c) => ({
      id: `won:${c.id}`,
      clientId: c.id,
      client: c.businessName,
      title: "New lead converted to client",
      at: c.wonAt,
      kind: "won" as const,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  /* ── Bottom: satisfaction distribution ─────────────────────────── */
  const distribution = [5, 4, 3, 2, 1].map((rating) => {
    const count = rated.filter((c) => c.latestRating === rating).length;
    return { rating, count, share: rated.length > 0 ? count / rated.length : 0 };
  });

  /* ── Filter options ────────────────────────────────────────────── */
  const owners = [...new Set(all.map((c) => c.owner).filter((o): o is string => Boolean(o)))].sort();
  const tagOptions = [...new Set(all.flatMap((c) => c.tags))].sort();
  const serviceOptions = [...serviceTotals.keys()]
    .map((key) => ({ key, label: SERVICE_LABELS[key] ?? key }))
    .sort((a, b) => a.label.localeCompare(b.label));

  /* ── Apply the filters ─────────────────────────────────────────── */
  const tab = filters.tab ?? "all";
  let rows = all;

  if (tab !== "all") rows = rows.filter((c) => c.status === tab);
  if (filters.service) rows = rows.filter((c) => c.services.some((s) => s.key === filters.service));
  if (filters.owner) rows = rows.filter((c) => c.owner === filters.owner);
  if (filters.tag) rows = rows.filter((c) => c.tags.includes(filters.tag!));
  if (filters.health) rows = rows.filter((c) => c.health.band === filters.health);

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    rows = rows.filter((c) =>
      [c.businessName, c.contactName, c.email, c.phone, c.businessType, c.city, c.state]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(filters.page ?? 1, 1), pageCount);
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return {
    kpis,
    rows: paged,
    tabCounts: {
      all: all.length,
      active: active.length,
      paused: paused.length,
      churned: churned.length,
    },
    total,
    page,
    pageCount,
    revenueByService,
    revenueTotalCents: lifetimeTotal,
    locations,
    healthBreakdown,
    renewals,
    topByRevenue,
    activity,
    satisfaction: {
      average: satisfactionAvg,
      delta: avgNow !== null && avgPrev !== null ? deltaPct(avgNow, avgPrev) : null,
      counts: distribution,
      responses: rated.length,
    },
    owners,
    serviceOptions,
    tagOptions,
  };
}

export const CLIENTS_PAGE_SIZE = PAGE_SIZE;
