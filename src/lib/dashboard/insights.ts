import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { lastNDays, monthToDate } from "./period";
import { SERVICE_LABELS } from "./services";
import {
  CLOSED_STATUSES,
  type AiInsight,
  type InsightKind,
  type Priority,
  type RevenueCategory,
} from "@/lib/supabase/types";

/**
 * Section 2 — AI Insights.
 *
 * Two sources, one shape:
 *
 *   RULES  — deterministic, computed here on every request from live tables.
 *            Free, instant, and never stale. They are not stored.
 *   MODEL  — rows in `ai_insights` written by a model. Stored, because they
 *            cost money to produce.
 *
 * Every rule below guards on a minimum sample size. "Website leads convert
 * 100% better" off two leads is not an insight, it is noise with a percent
 * sign, so the rule stays silent until the numbers can carry it.
 */

export type Insight = {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  severity: Priority;
  href: string | null;
  source: "rule" | "ai";
  at: string;
};

const MIN_SAMPLE = 5;
const MIN_LIFT = 0.15;
const HOUR = 3600_000;

const pct = (n: number) => `${Math.round(n * 100)}%`;
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

/** Statuses that count as a lead having converted into a sale. */
const WON = "Won";

export async function loadInsights(
  sb: SupabaseClient,
  limit = 5
): Promise<Insight[]> {
  const { current, previous } = monthToDate();
  const ninety = lastNDays(90);
  const now = Date.now();

  const [leads90, openLeads, revNow, revPrev, jobs, stored] = await Promise.all([
    sb
      .from("leads")
      .select("id, source, utm_source, lead_status, services_interested, created_at")
      .gte("created_at", ninety.fromIso)
      .then((r) => unwrap(r, "leads (90d)")),
    sb
      .from("leads")
      .select("id, created_at, last_contacted_at")
      .not("lead_status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .eq("do_not_contact", false)
      .then((r) => unwrap(r, "open leads")),
    sb
      .from("revenue_events")
      .select("category, amount_cents")
      .gte("occurred_at", current.fromIso)
      .lt("occurred_at", current.toIso)
      .then((r) => unwrap(r, "revenue")),
    sb
      .from("revenue_events")
      .select("category, amount_cents")
      .gte("occurred_at", previous.fromIso)
      .lt("occurred_at", previous.toIso)
      .then((r) => unwrap(r, "revenue (prev)")),
    sb
      .from("jobs")
      .select("id, title, due_at, business_name")
      .is("completed_at", null)
      .neq("stage", "Complete")
      .not("due_at", "is", null)
      .then((r) => unwrap(r, "jobs")),
    sb
      .from("ai_insights")
      .select("*")
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then((r) => unwrap(r, "stored insights")),
  ]);

  const out: Insight[] = [];
  const add = (
    id: string,
    kind: InsightKind,
    severity: Priority,
    title: string,
    body: string,
    href: string | null
  ) => out.push({ id, kind, title, body, severity, href, source: "rule", at: new Date().toISOString() });

  type LeadRow = {
    id: string;
    source: string;
    utm_source: string | null;
    lead_status: string;
    services_interested: string[] | null;
    created_at: string;
  };
  const leads = leads90 as LeadRow[];

  /* ── OPPORTUNITY — which lead source actually closes ──────────── */
  {
    const bySource = new Map<string, { total: number; won: number }>();
    for (const l of leads) {
      const key = l.utm_source || l.source || "direct";
      const e = bySource.get(key) ?? { total: 0, won: 0 };
      e.total++;
      if (l.lead_status === WON) e.won++;
      bySource.set(key, e);
    }

    const eligible = [...bySource.entries()]
      .filter(([, v]) => v.total >= MIN_SAMPLE)
      .map(([k, v]) => ({ key: k, rate: v.won / v.total, total: v.total }))
      .sort((a, b) => b.rate - a.rate);

    if (eligible.length >= 2 && eligible[0].rate > 0) {
      const best = eligible[0];
      const rest = eligible.slice(1);
      const restRate =
        rest.reduce((t, r) => t + r.rate * r.total, 0) /
        rest.reduce((t, r) => t + r.total, 0);

      if (restRate > 0 && best.rate / restRate - 1 >= MIN_LIFT) {
        add(
          "rule:source-lift",
          "opportunity",
          "high",
          `${best.key} leads close ${pct(best.rate / restRate - 1)} better than everything else`,
          `${best.key} converts at ${pct(best.rate)} across ${best.total} leads in the last 90 days, against ${pct(restRate)} everywhere else. Worth more of the budget.`,
          "/admin/intelligence/leads"
        );
      }
    }
  }

  /* ── ACTION — leads going cold ─────────────────────────────────── */
  {
    const stale = (openLeads as { created_at: string; last_contacted_at: string | null }[]).filter(
      (l) => {
        const ref = l.last_contacted_at ?? l.created_at;
        return now - new Date(ref).getTime() > 48 * HOUR;
      }
    );

    if (stale.length > 0) {
      add(
        "rule:stale-leads",
        "action",
        stale.length >= 3 ? "high" : "medium",
        `${stale.length} lead${stale.length === 1 ? " has" : "s have"} had no contact in over 48 hours`,
        "Speed to contact is the single biggest lever on close rate for this kind of work. These are the ones to call first.",
        "/admin/leads"
      );
    }
  }

  /* ── MARKETING — what kind of work people are asking for ───────── */
  {
    const recent = leads.filter(
      (l) => now - new Date(l.created_at).getTime() <= 30 * 24 * HOUR
    );
    const counts = new Map<string, number>();
    for (const l of recent) {
      for (const s of l.services_interested ?? []) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = recent.length;

    if (total >= MIN_SAMPLE && ranked.length >= 2 && ranked[0][1] >= MIN_SAMPLE) {
      add(
        "rule:demand",
        "marketing",
        "medium",
        `${ranked[0][0]} is what most enquiries are actually asking for`,
        `${ranked[0][1]} of ${total} leads this month ticked ${ranked[0][0]}, ahead of ${ranked[1][0]} at ${ranked[1][1]}. Lead the ads with it.`,
        "/admin/marketing/ads"
      );
    }
  }

  /* ── REVENUE — which service line moved ────────────────────────── */
  {
    const bucket = (rows: { category: RevenueCategory; amount_cents: number }[]) => {
      const m = new Map<RevenueCategory, number>();
      for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + r.amount_cents);
      return m;
    };
    const nowMap = bucket(revNow as { category: RevenueCategory; amount_cents: number }[]);
    const prevMap = bucket(revPrev as { category: RevenueCategory; amount_cents: number }[]);

    let bestKey: RevenueCategory | null = null;
    let bestDelta = 0;
    for (const [key, value] of nowMap) {
      const before = prevMap.get(key) ?? 0;
      const delta = value - before;
      if (before > 0 && delta > bestDelta) {
        bestKey = key;
        bestDelta = delta;
      }
    }

    if (bestKey && bestDelta > 0) {
      const before = prevMap.get(bestKey) ?? 0;
      add(
        "rule:revenue-up",
        "revenue",
        "low",
        `${SERVICE_LABELS[bestKey]} revenue is up ${pct(bestDelta / before)} this month`,
        `${money(nowMap.get(bestKey) ?? 0)} so far, against ${money(before)} over the same days last month.`,
        "/admin/finance"
      );
    }
  }

  /* ── RISK — delivery dates ─────────────────────────────────────── */
  {
    type JobRow = { id: string; title: string; due_at: string; business_name: string | null };
    const jobRows = jobs as JobRow[];
    const soon = jobRows.filter((j) => {
      const t = new Date(j.due_at).getTime();
      return t - now <= 5 * 24 * HOUR;
    });

    if (soon.length > 0) {
      const overdue = soon.filter((j) => new Date(j.due_at).getTime() < now);
      add(
        "rule:project-risk",
        "risk",
        overdue.length > 0 ? "critical" : "high",
        overdue.length > 0
          ? `${overdue.length} project${overdue.length === 1 ? " is" : "s are"} past the promised date`
          : `${soon.length} project${soon.length === 1 ? " is" : "s are"} approaching delivery`,
        soon
          .slice(0, 3)
          .map((j) => j.business_name || j.title)
          .join(", ") + ". The ad promises 7–14 days; that promise is what these dates are.",
        "/admin/jobs"
      );
    }
  }

  /* ── Model-written rows ────────────────────────────────────────── */
  for (const row of stored as AiInsight[]) {
    if (row.valid_until && new Date(row.valid_until).getTime() < now) continue;
    out.push({
      id: `ai:${row.id}`,
      kind: row.kind,
      title: row.title,
      body: row.body,
      severity: row.severity,
      href: row.href,
      source: "ai",
      at: row.created_at,
    });
  }

  const SEVERITY: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]).slice(0, limit);
}
