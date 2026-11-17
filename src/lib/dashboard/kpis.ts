import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deltaPct, monthToDate, type Period } from "./period";
import { unwrap, unwrapCount } from "./panel";
import { CLOSED_STATUSES, JUNK_FILTER } from "@/lib/supabase/types";
import { getFinanceOverview } from "@/lib/finance/overview";

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


async function leadsIn(sb: SupabaseClient, p: Period): Promise<number> {
  return unwrapCount(
    await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("lead_status", "in", JUNK_FILTER)
      .gte("created_at", p.fromIso)
      .lt("created_at", p.toIso),
    "leads count"
  );
}

export async function loadKpis(sb: SupabaseClient): Promise<Kpi[]> {
  const { current, previous } = monthToDate();

  // Revenue, MRR and pipeline come from the Finance overview, the one
  // definition of each, so this row can never disagree with /admin/finance.
  const [
    money,
    leadsNow,
    leadsPrev,
    openLeadCount,
    customers,
    projects,
  ] = await Promise.all([
    getFinanceOverview("mtd"),
    leadsIn(sb, current),
    leadsIn(sb, previous),
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("lead_status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .then((r) => unwrapCount(r, "open leads")),
    sb
      .from("customers")
      .select("won_at, status")
      .eq("status", "active")
      .then((r) => unwrap(r, "customers")),
    sb
      .from("jobs")
      .select("value_cents, due_at, stage")
      .is("completed_at", null)
      .neq("stage", "Complete")
      .then((r) => unwrap(r, "jobs")),
  ]);

  type CustomerLite = { won_at: string };
  const clientRows = customers as CustomerLite[];
  const newClients = clientRows.filter(
    (c) => c.won_at >= current.fromIso && c.won_at < current.toIso
  );

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
      value: money.revenueCents,
      format: "money",
      delta: deltaPct(money.revenueCents, money.revenuePrevCents),
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
      value: money.pipelineCents,
      format: "money",
      delta: null,
      deltaLabel: null,
      hint:
        `${money.pipelineCount} open ${money.pipelineCount === 1 ? "deal" : "deals"} · ` +
        `${openLeadCount} open ${openLeadCount === 1 ? "lead" : "leads"}`,
      href: "/admin/crm",
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
      value: money.mrrCents,
      format: "money",
      delta: null,
      deltaLabel: null,
      // Paying = has an active recurring service, not merely "active".
      hint: `${money.recurringClients} paying ${money.recurringClients === 1 ? "client" : "clients"}`,
      href: "/admin/finance",
    },
  ];
}
