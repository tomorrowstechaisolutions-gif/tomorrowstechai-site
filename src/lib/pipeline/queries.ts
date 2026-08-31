import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { monthToDate } from "@/lib/dashboard/period";
import { DEAL_STAGES, STAGE_LABELS, type DealStage } from "@/lib/crm/stages";
import { annualised, conversion, effectiveProbability, forecast, weightedCents, type Forecast } from "./forecast";
import { findIssues, sortIssues, worstPriority, type AttentionIssue } from "./attention";

/**
 * Everything the Pipeline screen shows.
 *
 * It operates on DEALS, never on lead status. A lead's status is where the
 * relationship stands; a deal's stage is where one sale stands, and one
 * company can have four of them at once.
 *
 * The stage vocabulary is imported from src/lib/crm/stages.ts rather than
 * redeclared, so the CRM, the dashboard pipeline and this screen cannot
 * describe the same funnel differently.
 */

export type PipelineDeal = {
  id: string;
  title: string;
  stage: DealStage;
  stageLabel: string;
  valueCents: number | null;
  billing: string;
  annualisedCents: number;
  probability: number;
  probabilityIsDefault: boolean;
  weightedCents: number;
  expectedClose: string | null;
  daysInStage: number;
  lastActivityAt: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  owner: string | null;
  committed: boolean;
  company: { id: string; name: string } | null;
  contactName: string | null;
  service: string | null;
  source: string | null;
  campaign: string | null;
  hasProposal: boolean;
  lostReason: string | null;
  lostAt: string | null;
  wonAt: string | null;
  issues: AttentionIssue[];
  priority: AttentionIssue["priority"] | null;
};

export type StageColumn = {
  key: DealStage;
  label: string;
  count: number;
  valueCents: number;
  deals: PipelineDeal[];
};

export type PipelineFilters = {
  q?: string;
  view: "board" | "table";
  stage?: string;
  owner?: string;
  company?: string;
  service?: string;
  source?: string;
  attention?: boolean;
  stale?: boolean;
};

export type PipelineBoard = {
  kpis: {
    pipelineCents: number;
    activeDeals: number;
    weightedCents: number;
    avgDealCents: number | null;
    wonThisMonth: number;
    winRatePct: number | null;
  };
  columns: StageColumn[];
  deals: PipelineDeal[];
  summary: { key: DealStage; label: string; count: number; valueCents: number }[];
  conversions: { from: string; to: string; label: string; pct: number | null; moved: number; entered: number }[];
  valueOverTime: { date: string; pipelineCents: number; weightedCents: number }[];
  snapshotsStart: string | null;
  topDeals: PipelineDeal[];
  attention: PipelineDeal[];
  lost: PipelineDeal[];
  forecast: Forecast;
  owners: string[];
  companies: { id: string; name: string }[];
  services: { id: string; name: string }[];
  sources: string[];
};

const DAY = 86_400_000;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** The four transitions worth measuring, in the order a deal makes them. */
const TRANSITIONS: { from: DealStage; to: DealStage }[] = [
  { from: "qualified", to: "discovery" },
  { from: "discovery", to: "proposal" },
  { from: "proposal", to: "negotiation" },
  { from: "negotiation", to: "won" },
];

export async function loadPipelineBoard(
  sb: SupabaseClient,
  filters: PipelineFilters
): Promise<PipelineBoard> {
  const month = monthToDate();

  const [deals, history, invoices, snapshots, targets, catalog] = await Promise.all([
    sb
      .from("deals")
      .select(
        "id, title, stage, value_cents, billing, probability, expected_close, stage_entered_at, next_action, next_action_at, last_activity_at, owner, committed, source, campaign, won_at, lost_at, lost_reason, company_id, catalog_item_id, companies(id, name), leads(first_name, last_name), catalog_items(id, name)"
      )
      .order("updated_at", { ascending: false })
      .limit(1000)
      .then((r) => unwrap(r, "deals")),
    // Only transitions matter for conversion, so the null-from creation rows
    // are kept too — they are what "entered this stage" counts.
    sb
      .from("deal_stage_history")
      .select("deal_id, from_stage, to_stage, changed_at, days_in_previous_stage")
      .order("changed_at", { ascending: false })
      .limit(2000)
      .then((r) => (r.error ? [] : (r.data ?? []))),
    sb
      .from("invoices")
      .select("id, deal_id, status")
      .not("deal_id", "is", null)
      .then((r) => (r.error ? [] : (r.data ?? []))),
    sb
      .from("pipeline_snapshots")
      .select("captured_on, pipeline_cents, weighted_cents")
      .order("captured_on", { ascending: true })
      .limit(400)
      .then((r) => (r.error ? [] : (r.data ?? []))),
    sb
      .from("sales_targets")
      .select("period_start, period, target_cents")
      .eq("period", "month")
      .order("period_start", { ascending: false })
      .limit(12)
      .then((r) => (r.error ? [] : (r.data ?? []))),
    sb
      .from("catalog_items")
      .select("id, name")
      .eq("active", true)
      .order("position", { ascending: true })
      .then((r) => (r.error ? [] : (r.data ?? []))),
  ]);

  type CompanyLite = { id: string; name: string };
  type DealRaw = {
    id: string; title: string; stage: DealStage; value_cents: number | null;
    billing: string; probability: number | null; expected_close: string | null;
    stage_entered_at: string; next_action: string | null; next_action_at: string | null;
    last_activity_at: string | null; owner: string | null; committed: boolean;
    source: string | null; campaign: string | null;
    won_at: string | null; lost_at: string | null; lost_reason: string | null;
    company_id: string | null; catalog_item_id: string | null;
    companies: CompanyLite | CompanyLite[] | null;
    leads: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    catalog_items: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const dealRaw = deals as DealRaw[];
  const proposalDealIds = new Set(
    (invoices as { deal_id: string | null }[]).map((i) => i.deal_id).filter((d): d is string => Boolean(d))
  );

  const all: PipelineDeal[] = dealRaw.map((d) => {
    const co = one<CompanyLite>(d.companies);
    const lead = one<{ first_name: string | null; last_name: string | null }>(d.leads);
    const item = one<{ id: string; name: string }>(d.catalog_items);

    const prob = effectiveProbability({ stage: d.stage, probability: d.probability });
    const daysInStage = Math.floor((Date.now() - new Date(d.stage_entered_at).getTime()) / DAY);
    const hasProposal = proposalDealIds.has(d.id);

    const issues = sortIssues(
      findIssues({
        stage: d.stage,
        valueCents: d.value_cents,
        probability: d.probability,
        expectedClose: d.expected_close,
        daysInStage,
        lastActivityAt: d.last_activity_at,
        nextAction: d.next_action,
        nextActionAt: d.next_action_at,
        owner: d.owner,
        hasProposal,
        committed: d.committed,
      })
    );

    return {
      id: d.id,
      title: d.title,
      stage: d.stage,
      stageLabel: STAGE_LABELS[d.stage] ?? d.stage,
      valueCents: d.value_cents,
      billing: d.billing,
      annualisedCents: annualised(d.value_cents, d.billing),
      probability: prob,
      probabilityIsDefault: d.probability === null,
      weightedCents: weightedCents({
        valueCents: d.value_cents, billing: d.billing, stage: d.stage,
        probability: d.probability, expectedClose: d.expected_close, committed: d.committed,
      }),
      expectedClose: d.expected_close,
      daysInStage,
      lastActivityAt: d.last_activity_at,
      nextAction: d.next_action,
      nextActionAt: d.next_action_at,
      owner: d.owner,
      committed: d.committed,
      company: co ? { id: co.id, name: co.name } : null,
      contactName: lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null : null,
      service: item?.name ?? null,
      source: d.source,
      campaign: d.campaign,
      hasProposal,
      lostReason: d.lost_reason,
      lostAt: d.lost_at,
      wonAt: d.won_at,
      issues,
      priority: worstPriority(issues),
    };
  });

  // ── Filters ────────────────────────────────────────────────────────
  const needle = filters.q?.toLowerCase().trim();

  const matches = (d: PipelineDeal): boolean => {
    if (needle) {
      const hay = `${d.title} ${d.company?.name ?? ""} ${d.contactName ?? ""} ${d.service ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.stage && d.stage !== filters.stage) return false;
    if (filters.owner && d.owner !== filters.owner) return false;
    if (filters.company && d.company?.id !== filters.company) return false;
    if (filters.service && d.service !== filters.service) return false;
    if (filters.source && d.source !== filters.source) return false;
    if (filters.attention && d.issues.length === 0) return false;
    if (filters.stale && d.daysInStage < 14) return false;
    return true;
  };

  const filtered = all.filter(matches);
  const openStages = DEAL_STAGES.filter((s) => s.open).map((s) => s.key);
  const openDeals = all.filter((d) => openStages.includes(d.stage));

  // ── The board ──────────────────────────────────────────────────────
  // Won gets its own column because seeing what closed beside what is still
  // moving is the point of a sales board. Lost and On hold are not columns —
  // they have their own panel, so the working board stays the working board.
  const BOARD_STAGES: DealStage[] = [
    "new", "qualified", "discovery", "proposal", "negotiation", "won",
  ];

  const columns: StageColumn[] = BOARD_STAGES.map((key) => {
    const inStage = filtered.filter((d) => d.stage === key);
    return {
      key,
      label: STAGE_LABELS[key],
      count: inStage.length,
      valueCents: inStage.reduce((t, d) => t + d.annualisedCents, 0),
      deals: inStage
        .slice()
        .sort((a, b) => b.annualisedCents - a.annualisedCents)
        .slice(0, 12),
    };
  });

  const summary = DEAL_STAGES.map((s) => {
    const inStage = all.filter((d) => d.stage === s.key);
    return {
      key: s.key,
      label: s.label,
      count: inStage.length,
      valueCents: inStage.reduce((t, d) => t + d.annualisedCents, 0),
    };
  }).filter((s) => s.count > 0);

  // ── Conversion, from the transition log ────────────────────────────
  type HistRow = { from_stage: string | null; to_stage: string };
  const hist = history as HistRow[];

  const conversions = TRANSITIONS.map((t) => {
    const c = conversion(hist, t.from, t.to);
    return {
      from: t.from,
      to: t.to,
      label: `${STAGE_LABELS[t.from]} → ${STAGE_LABELS[t.to]}`,
      pct: c.pct,
      moved: c.moved,
      entered: c.entered,
    };
  });

  // ── Value over time ────────────────────────────────────────────────
  // Straight from the snapshot table. Nothing is interpolated and nothing is
  // back-filled: the chart begins the day snapshots began, and says so.
  const snaps = snapshots as { captured_on: string; pipeline_cents: number; weighted_cents: number }[];
  const valueOverTime = snaps.map((s) => ({
    date: s.captured_on,
    pipelineCents: s.pipeline_cents,
    weightedCents: s.weighted_cents,
  }));

  // ── Forecast ───────────────────────────────────────────────────────
  const monthStart = month.current.fromIso.slice(0, 10);
  const target = (targets as { period_start: string; target_cents: number }[])
    .find((t) => t.period_start === monthStart) ?? null;

  const wonThisMonth = all.filter((d) => d.wonAt && d.wonAt >= month.current.fromIso);
  const lostThisMonth = all.filter((d) => d.lostAt && d.lostAt >= month.current.fromIso);
  const closedThisMonth = wonThisMonth.length + lostThisMonth.length;

  const periodEnd = new Date(month.current.toIso);

  const fc = forecast({
    deals: all.map((d) => ({
      valueCents: d.valueCents, billing: d.billing, stage: d.stage,
      probability: d.probabilityIsDefault ? null : d.probability,
      expectedClose: d.expectedClose, committed: d.committed,
    })),
    wonInPeriod: wonThisMonth.map((d) => ({ valueCents: d.valueCents, billing: d.billing })),
    periodEnd,
    targetCents: target?.target_cents ?? null,
  });

  const valued = openDeals.filter((d) => d.annualisedCents > 0);

  const owners = [...new Set(all.map((d) => d.owner).filter((o): o is string => Boolean(o)))].sort();
  const companies = [
    ...new Map(all.filter((d) => d.company).map((d) => [d.company!.id, d.company!] as const)).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const sources = [...new Set(all.map((d) => d.source).filter((s): s is string => Boolean(s)))].sort();

  return {
    kpis: {
      pipelineCents: fc.pipelineCents,
      activeDeals: openDeals.length,
      weightedCents: fc.weightedCents,
      avgDealCents:
        valued.length > 0
          ? Math.round(valued.reduce((t, d) => t + d.annualisedCents, 0) / valued.length)
          : null,
      wonThisMonth: wonThisMonth.length,
      // Null rather than 0% when nothing has closed. A 0% win rate on zero
      // closed deals is not a fact about the business.
      winRatePct: closedThisMonth > 0 ? (wonThisMonth.length / closedThisMonth) * 100 : null,
    },
    columns,
    deals: filtered.slice(0, 100),
    summary,
    conversions,
    valueOverTime,
    snapshotsStart: snaps[0]?.captured_on ?? null,
    topDeals: openDeals
      .slice()
      .sort((a, b) => b.annualisedCents - a.annualisedCents)
      .slice(0, 5),
    attention: all
      .filter((d) => d.issues.length > 0)
      .sort((a, b) => {
        const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
        const byPriority = rank[a.priority ?? "low"] - rank[b.priority ?? "low"];
        return byPriority !== 0 ? byPriority : b.annualisedCents - a.annualisedCents;
      })
      .slice(0, 8),
    lost: all
      .filter((d) => d.stage === "lost")
      .sort((a, b) => (b.lostAt ?? "").localeCompare(a.lostAt ?? ""))
      .slice(0, 6),
    forecast: fc,
    owners,
    companies,
    services: (catalog as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })),
    sources,
  };
}
