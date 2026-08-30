import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { SERVICE_LABELS } from "@/lib/dashboard/services";
import { PROJECT_TYPE_LABELS, type ProjectType, type RevenueCategory } from "@/lib/supabase/types";
import { scoreClient, type ClientHealth } from "./health";
import type { ClientStatus } from "./queries";

/**
 * One client, everything about them.
 *
 * The order these come back in is the order the page asks its questions:
 * who are they, what do they pay, what do we owe them, what have they paid,
 * and how did we get them in the first place.
 */

export type ClientDetail = {
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
  notes: string | null;
  notesInternal: string | null;
  status: ClientStatus;
  wonAt: string;
  churnedAt: string | null;
  health: ClientHealth;

  subscription: {
    mrrCents: number;
    renewsAt: string | null;
    renewalAmountCents: number;
    /** True only when Stripe has actually told us about a subscription. */
    linked: boolean;
    stripeCustomerId: string | null;
  };

  lifetimeCents: number;
  revenue: {
    id: string;
    kind: string;
    category: RevenueCategory;
    label: string;
    description: string | null;
    amountCents: number;
    occurredAt: string;
  }[];
  revenueByService: { label: string; cents: number; share: number }[];

  invoices: {
    id: string;
    label: string;
    amountCents: number;
    status: string;
    sentAt: string;
    paidAt: string | null;
    expiresAt: string | null;
    expired: boolean;
    daysOut: number;
    checkoutUrl: string | null;
    receiptUrl: string | null;
  }[];

  projects: {
    id: string;
    title: string;
    type: ProjectType;
    typeLabel: string;
    stage: string;
    progress: number | null;
    dueAt: string | null;
    daysLate: number | null;
    valueCents: number;
    siteUrl: string | null;
    completedAt: string | null;
    href: string;
  }[];

  ratings: {
    id: string;
    rating: number;
    note: string | null;
    occasion: string;
    recordedAt: string;
  }[];

  /** How they found us. Null when the client was added by hand. */
  origin: {
    leadId: string;
    source: string;
    campaign: string | null;
    utmSource: string | null;
    landingPage: string | null;
    servicesInterested: string[];
    createdAt: string;
    daysToClose: number;
  } | null;

  timeline: { id: string; title: string; detail: string | null; at: string; kind: string }[];
};

const DAY = 86400_000;

export async function loadClient(
  sb: SupabaseClient,
  id: string
): Promise<ClientDetail | null> {
  const customer = (
    await sb
      .from("customers")
      .select(
        "id, name, business_name, email, phone, business_type, city, state, owner, tags, status, won_at, churned_at, mrr_cents, renews_at, renewal_amount_cents, notes, notes_internal, stripe_customer_id, stripe_subscription_id, lead_id"
      )
      .eq("id", id)
      .maybeSingle()
  ).data as {
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
    notes: string | null;
    notes_internal: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    lead_id: string | null;
  } | null;

  if (!customer) return null;

  const [revenue, invoices, jobs, ratings, lead] = await Promise.all([
    sb
      .from("revenue_events")
      .select("id, kind, category, description, amount_cents, occurred_at")
      .eq("customer_id", id)
      .order("occurred_at", { ascending: false })
      .then((r) => unwrap(r, "revenue")),
    sb
      .from("invoices")
      .select("id, kind, status, description, amount_cents, launch_cents, sent_at, paid_at, expires_at, checkout_url, receipt_url")
      .eq("customer_id", id)
      .order("sent_at", { ascending: false })
      .then((r) => unwrap(r, "invoices")),
    sb
      .from("jobs")
      .select("id, title, project_type, stage, due_at, completed_at, value_cents, site_url, created_at, job_tasks(done)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .then((r) => unwrap(r, "jobs")),
    sb
      .from("client_satisfaction")
      .select("id, rating, note, occasion, recorded_at")
      .eq("customer_id", id)
      .order("recorded_at", { ascending: false })
      .then((r) => unwrap(r, "ratings")),
    customer.lead_id
      ? sb
          .from("leads")
          .select("id, source, campaign, utm_source, landing_page, services_interested, created_at")
          .eq("id", customer.lead_id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const now = Date.now();

  type RevRaw = {
    id: string;
    kind: string;
    category: RevenueCategory;
    description: string | null;
    amount_cents: number;
    occurred_at: string;
  };
  type InvRaw = {
    id: string;
    kind: "launch" | "upsell";
    status: string;
    description: string | null;
    amount_cents: number;
    launch_cents: number;
    sent_at: string;
    paid_at: string | null;
    expires_at: string | null;
    checkout_url: string | null;
    receipt_url: string | null;
  };
  type JobRaw = {
    id: string;
    title: string;
    project_type: ProjectType;
    stage: string;
    due_at: string | null;
    completed_at: string | null;
    value_cents: number;
    site_url: string | null;
    created_at: string;
    job_tasks: { done: boolean }[] | null;
  };
  type RatingRaw = {
    id: string;
    rating: number;
    note: string | null;
    occasion: string;
    recorded_at: string;
  };

  const revRows = revenue as RevRaw[];
  const invRows = invoices as InvRaw[];
  const jobRows = jobs as JobRaw[];
  const ratingRows = ratings as RatingRaw[];

  const invoiceValue = (i: InvRaw) => (i.kind === "launch" ? i.launch_cents : i.amount_cents);
  const lifetimeCents = revRows.reduce((t, r) => t + r.amount_cents, 0);

  const serviceTotals = new Map<RevenueCategory, number>();
  for (const r of revRows) {
    serviceTotals.set(r.category, (serviceTotals.get(r.category) ?? 0) + r.amount_cents);
  }

  const mappedInvoices = invRows.map((i) => ({
    id: i.id,
    label: i.description || (i.kind === "launch" ? "Business Launch package" : "Extra work"),
    amountCents: invoiceValue(i),
    status: i.status,
    sentAt: i.sent_at,
    paidAt: i.paid_at,
    expiresAt: i.expires_at,
    expired: i.expires_at !== null && new Date(i.expires_at).getTime() < now && i.status === "sent",
    daysOut: Math.floor((now - new Date(i.sent_at).getTime()) / DAY),
    checkoutUrl: i.checkout_url,
    receiptUrl: i.receipt_url,
  }));

  const mappedProjects = jobRows.map((j) => {
    const tasks = j.job_tasks ?? [];
    const done = tasks.filter((t) => t.done).length;
    return {
      id: j.id,
      title: j.title,
      type: j.project_type,
      typeLabel: PROJECT_TYPE_LABELS[j.project_type] ?? "Other",
      stage: j.stage,
      progress: tasks.length > 0 ? done / tasks.length : null,
      dueAt: j.due_at,
      daysLate:
        j.due_at === null || j.completed_at !== null
          ? null
          : Math.floor((now - new Date(j.due_at).getTime()) / DAY),
      valueCents: j.value_cents,
      siteUrl: j.site_url,
      completedAt: j.completed_at,
      href: `/admin/jobs/${j.id}`,
    };
  });

  const openInvoices = mappedInvoices
    .filter((i) => i.status === "sent")
    .map((i) => ({ daysOut: i.daysOut, expired: i.expired }));

  const openProjects = mappedProjects
    .filter((p) => p.completedAt === null && p.stage !== "Complete")
    .map((p) => ({ daysLate: p.daysLate ?? 0 }));

  const stamps = [
    customer.won_at,
    ...revRows.map((r) => r.occurred_at),
    ...invRows.map((i) => i.paid_at ?? i.sent_at),
    ...jobRows.map((j) => j.created_at),
    ...ratingRows.map((r) => r.recorded_at),
  ].filter(Boolean);
  const lastActivityAt = stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null;

  const health = scoreClient({
    status: customer.status,
    openInvoices,
    projects: openProjects,
    daysSinceActivity: lastActivityAt
      ? Math.floor((now - new Date(lastActivityAt).getTime()) / DAY)
      : null,
    latestRating: ratingRows.length > 0 ? ratingRows[0].rating : null,
  });

  const leadRow = lead as {
    id: string;
    source: string;
    campaign: string | null;
    utm_source: string | null;
    landing_page: string | null;
    services_interested: string[] | null;
    created_at: string;
  } | null;

  const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

  const timeline = [
    {
      id: `won:${customer.id}`,
      title: "Became a client",
      detail: leadRow ? `Converted from a ${leadRow.source} lead` : "Added by hand",
      at: customer.won_at,
      kind: "won",
    },
    ...revRows.map((r) => ({
      id: `rev:${r.id}`,
      title: `${money(r.amount_cents)} — ${r.description ?? SERVICE_LABELS[r.category] ?? r.category}`,
      detail: r.kind,
      at: r.occurred_at,
      kind: "revenue",
    })),
    ...mappedInvoices.map((i) => ({
      id: `inv:${i.id}`,
      title:
        i.status === "paid"
          ? `Invoice paid — ${money(i.amountCents)}`
          : `Checkout link sent — ${money(i.amountCents)}`,
      detail: i.label,
      at: i.paidAt ?? i.sentAt,
      kind: "invoice",
    })),
    ...mappedProjects.map((p) => ({
      id: `job:${p.id}`,
      title: p.completedAt ? `Project completed — ${p.title}` : `Project opened — ${p.title}`,
      detail: p.typeLabel,
      at: p.completedAt ?? p.dueAt ?? p.href,
      kind: "project",
    })),
    ...ratingRows.map((r) => ({
      id: `rat:${r.id}`,
      title: `Rated ${r.rating} out of 5`,
      detail: r.note,
      at: r.recorded_at,
      kind: "rating",
    })),
    ...(customer.churned_at
      ? [
          {
            id: `churn:${customer.id}`,
            title: "Cancelled",
            detail: null,
            at: customer.churned_at,
            kind: "churn",
          },
        ]
      : []),
  ]
    .filter((t) => /^\d{4}-\d{2}-\d{2}/.test(t.at))
    .sort((a, b) => b.at.localeCompare(a.at));

  return {
    id: customer.id,
    businessName: customer.business_name || customer.name || customer.email,
    contactName: customer.name,
    email: customer.email,
    phone: customer.phone,
    businessType: customer.business_type,
    city: customer.city,
    state: customer.state,
    owner: customer.owner,
    tags: customer.tags ?? [],
    notes: customer.notes,
    notesInternal: customer.notes_internal,
    status: customer.status,
    wonAt: customer.won_at,
    churnedAt: customer.churned_at,
    health,

    subscription: {
      mrrCents: customer.mrr_cents,
      renewsAt: customer.renews_at,
      renewalAmountCents: customer.renewal_amount_cents,
      linked: Boolean(customer.stripe_subscription_id),
      stripeCustomerId: customer.stripe_customer_id,
    },

    lifetimeCents,
    revenue: revRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      category: r.category,
      label: SERVICE_LABELS[r.category] ?? r.category,
      description: r.description,
      amountCents: r.amount_cents,
      occurredAt: r.occurred_at,
    })),
    revenueByService: [...serviceTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, cents]) => ({
        label: SERVICE_LABELS[key] ?? key,
        cents,
        share: lifetimeCents > 0 ? cents / lifetimeCents : 0,
      })),

    invoices: mappedInvoices,
    projects: mappedProjects,
    ratings: ratingRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      note: r.note,
      occasion: r.occasion,
      recordedAt: r.recorded_at,
    })),

    origin: leadRow
      ? {
          leadId: leadRow.id,
          source: leadRow.source,
          campaign: leadRow.campaign,
          utmSource: leadRow.utm_source,
          landingPage: leadRow.landing_page,
          servicesInterested: leadRow.services_interested ?? [],
          createdAt: leadRow.created_at,
          daysToClose: Math.max(
            0,
            Math.round(
              (new Date(customer.won_at).getTime() - new Date(leadRow.created_at).getTime()) / DAY
            )
          ),
        }
      : null,

    timeline,
  };
}
