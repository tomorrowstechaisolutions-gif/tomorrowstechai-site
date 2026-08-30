import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deltaPct, monthToDate, type Period } from "./period";
import { unwrap, unwrapCount } from "./panel";
import { CLOSED_STATUSES } from "@/lib/supabase/types";

/**
 * Section 1 — Business Health.
 *
 * Six numbers that have to be true. Every one of them is read from a real
 * table; where the data to compute a comparison does not exist yet, `delta`
 * is null and the card says nothing rather than guessing.
 */

export type Kpi = {
  key: "revenue" | "leads" | "pipeline" | "clients" | "projects" | "mrr";
  label: string;
  /** Cents for money KPIs, a plain count otherwise. */
  value: number;
  format: "money" | "count";
  /** Fractional change vs the comparison period. null = nothing to compare. */
  delta: number | null;
  deltaLabel: string | null;
  /** Secondary line under the value. Always derived, never decorative. */
  hint: string | null;
  href: string;
};

const sum = <T,>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((t, r) => t + (pick(r) || 0), 0);

/** Invoice states that still represent money we expect to receive. */
const OPEN_INVOICE_STATUSES = ["draft", "sent"];

async function revenueIn(sb: SupabaseClient, p: Period): Promise<number> {
  const rows = unwrap(
    await sb
      .from("revenue_events")
      .select("amount_cents")
      .gte("occurred_at", p.fromIso)
      .lt("occurred_at", p.toIso),
    "revenue_events"
  ) as { amount_cents: number }[];
  return sum(rows, (r) => r.amount_cents);
}

async function leadsIn(sb: SupabaseClient, p: Period): Promise<number> {
  return unwrapCount(
    await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", p.fromIso)
      .lt("created_at", p.toIso),
    "leads count"
  );
}

export async function loadKpis(sb: SupabaseClient): Promise<Kpi[]> {
  const { current, previous } = monthToDate();

  const [
    revenueNow,
    revenuePrev,
    leadsNow,
    leadsPrev,
    openInvoices,
    openLeadCount,
    customers,
    projects,
  ] = await Promise.all([
    revenueIn(sb, current),
    revenueIn(sb, previous),
    leadsIn(sb, current),
    leadsIn(sb, previous),
    sb
      .from("invoices")
      .select("amount_cents, launch_cents, hosting_cents, kind")
      .in("status", OPEN_INVOICE_STATUSES)
      .then((r) => unwrap(r, "open invoices")),
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("lead_status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .then((r) => unwrapCount(r, "open leads")),
    sb
      .from("customers")
      .select("mrr_cents, won_at, status")
      .eq("status", "active")
      .then((r) => unwrap(r, "customers")),
    sb
      .from("jobs")
      .select("value_cents, due_at, stage")
      .is("completed_at", null)
      .neq("stage", "Complete")
      .then((r) => unwrap(r, "jobs")),
  ]);

  type InvoiceLite = {
    amount_cents: number;
    launch_cents: number;
    hosting_cents: number;
    kind: "launch" | "upsell";
  };
  const pipelineValue = sum(openInvoices as InvoiceLite[], (i) =>
    // A launch invoice prices the build; the $29 hosting is recurring and is
    // counted in MRR instead, so adding it here would book it twice.
    i.kind === "launch" ? i.launch_cents : i.amount_cents
  );

  type CustomerLite = { mrr_cents: number; won_at: string };
  const clientRows = customers as CustomerLite[];
  const mrr = sum(clientRows, (c) => c.mrr_cents);
  const newClients = clientRows.filter(
    (c) => c.won_at >= current.fromIso && c.won_at < current.toIso
  );
  const mrrAdded = sum(newClients, (c) => c.mrr_cents);

  type JobLite = { value_cents: number; due_at: string | null };
  const jobRows = projects as JobLite[];
  const now = Date.now();
  const atRisk = jobRows.filter(
    (j) => j.due_at !== null && new Date(j.due_at).getTime() < now
  ).length;

  const cmp = "vs. same period last month";

  return [
    {
      key: "revenue",
      label: "Revenue",
      value: revenueNow,
      format: "money",
      delta: deltaPct(revenueNow, revenuePrev),
      deltaLabel: cmp,
      hint: current.label,
      href: "/admin/finance",
    },
    {
      key: "leads",
      label: "New leads",
      value: leadsNow,
      format: "count",
      delta: deltaPct(leadsNow, leadsPrev),
      deltaLabel: cmp,
      hint: current.label,
      href: "/admin/leads",
    },
    {
      key: "pipeline",
      label: "Sales pipeline",
      value: pipelineValue,
      format: "money",
      delta: null,
      deltaLabel: null,
      hint:
        openLeadCount > 0
          ? `${openLeadCount} open ${openLeadCount === 1 ? "lead" : "leads"}`
          : "No open leads",
      href: "/admin/leads",
    },
    {
      key: "clients",
      label: "Active clients",
      value: clientRows.length,
      format: "count",
      delta: null,
      deltaLabel: null,
      hint:
        newClients.length > 0
          ? `+${newClients.length} won this month`
          : "None won yet this month",
      href: "/admin/clients",
    },
    {
      key: "projects",
      label: "Active projects",
      value: jobRows.length,
      format: "count",
      delta: null,
      deltaLabel: null,
      hint: atRisk > 0 ? `${atRisk} past due` : "All on schedule",
      href: "/admin/jobs",
    },
    {
      key: "mrr",
      label: "Recurring revenue",
      value: mrr,
      format: "money",
      delta: null,
      deltaLabel: null,
      hint:
        mrrAdded > 0
          ? `+$${(mrrAdded / 100).toLocaleString("en-US")}/mo added this month`
          : `${clientRows.length} paying ${clientRows.length === 1 ? "client" : "clients"}`,
      href: "/admin/finance/subscriptions",
    },
  ];
}
