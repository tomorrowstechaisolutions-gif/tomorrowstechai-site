import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { lastNDays } from "@/lib/dashboard/period";
import { auditTargets } from "./audit";
import { attributionOf } from "./organic";
import { healthBand, healthScore, RULES, SEVERITY_ORDER, SLOW_RESPONSE_MS, type RuleCode, type Severity } from "./rules";
import { loadSearch, localConnection, type SearchSnapshot } from "./search-console";

/**
 * Everything the SEO screen shows.
 *
 * Two halves, kept visibly apart. The audit, the lead-attributed pages and
 * the content gaps are computed from this site and this CRM and are true
 * today. The search half is whatever Search Console has synced, and is null
 * — not zero — until it is connected.
 */

export type SeoIssue = {
  path: string;
  code: RuleCode;
  severity: Severity;
  detail: string | null;
  title: string;
  why: string;
  fix: string;
  aiFixable: boolean;
};

export type SeoPageRow = {
  path: string;
  url: string;
  title: string | null;
  titleLength: number | null;
  descriptionLength: number | null;
  wordCount: number;
  statusCode: number | null;
  responseMs: number | null;
  hasSchema: boolean;
  internalLinks: number;
  /** Leads this page produced in the window, from the lead's landing page. */
  leads: number;
  organicLeads: number;
  issueCount: number;
  worstSeverity: Severity | null;
};

export type ContentGap = {
  interest: string;
  leads: number;
  /** A path that would plainly serve this interest, if one existed. */
  suggestedPath: string;
  hasPage: boolean;
};

/**
 * One line of the health strip: a named property of the site, the share of
 * pages that have it, and — when nothing can measure it here — why not.
 */
export type SeoCheck = {
  label: string;
  passed: number | null;
  total: number;
  detail: string;
  tone: "ok" | "warn" | "risk" | "none";
};

export type SeoRecommendation = {
  id: string;
  kind: "opportunity" | "action" | "technical" | "content" | "success";
  title: string;
  body: string;
  severity: Severity;
  path: string | null;
  /** Whether this is something the AI queue could plausibly draft. */
  aiFixable: boolean;
};

export type SeoBoard = {
  search: SearchSnapshot;
  local: { connected: boolean; reason: string };

  audit: {
    ranAt: string | null;
    status: string | null;
    pagesChecked: number;
    score: number | null;
    band: "excellent" | "good" | "average" | "poor" | null;
    bandLabel: string | null;
    issues: SeoIssue[];
    bySeverity: { severity: Severity; count: number }[];
  };

  pages: SeoPageRow[];
  checks: SeoCheck[];
  organicLeads: number;
  organicLeadsPrevious: number;
  totalLeads: number;
  gaps: ContentGap[];
  recommendations: SeoRecommendation[];
  competitors: {
    id: string;
    domain: string;
    label: string | null;
    visibility: number | null;
    keywords: number | null;
    traffic: number | null;
    statsSource: string | null;
  }[];
  pendingActions: number;
};

/**
 * What a lead asked about, and the page that would rank for it.
 *
 * Today every one of these is served by one catch-all /services page. That is
 * exactly the gap: a page covering eight topics ranks for none of them as well
 * as eight pages each covering one. A gap is only reported once real leads
 * have asked for that thing, so this stays a list of demand rather than a
 * list of pages somebody could theoretically write.
 */
const INTEREST_PAGES: Record<string, { slug: string; label: string }> = {
  Website: { slug: "/services/website-design", label: "Website design" },
  "Lead Management": { slug: "/services/lead-management", label: "Lead management" },
  CRM: { slug: "/services/crm", label: "CRM" },
  Automation: { slug: "/services/business-automation", label: "Business automation" },
  AI: { slug: "/services/ai-solutions", label: "AI solutions" },
  "E-commerce": { slug: "/services/ecommerce", label: "Ecommerce" },
  "Online Booking": { slug: "/services/online-booking", label: "Online booking" },
  Payments: { slug: "/services/payments", label: "Payments" },
};

export async function loadSeoBoard(sb: SupabaseClient, days = 28): Promise<SeoBoard> {
  const window = lastNDays(days);
  const previous = lastNDays(days * 2);

  const [search, latestRun, leads, competitors, pendingActions] = await Promise.all([
    loadSearch(sb, days),
    sb
      .from("seo_audit_runs")
      .select("id, started_at, finished_at, status, pages_checked, issues_found")
      .eq("status", "complete")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => r.data),
    sb
      .from("leads")
      .select("id, created_at, landing_page, referrer, utm_source, utm_medium, fbclid, gclid, source, services_interested")
      .gte("created_at", previous.fromIso)
      .then((r) => unwrap(r, "leads")),
    sb
      .from("seo_competitors")
      .select("id, domain, label, visibility_pct, keyword_count, traffic_est, stats_source")
      .order("created_at", { ascending: true })
      .then((r) => unwrap(r, "competitors")),
    sb
      .from("ai_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "proposed")
      .then((r) => r.count ?? 0),
  ]);

  type LeadRow = {
    id: string;
    created_at: string;
    landing_page: string | null;
    referrer: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    fbclid: string | null;
    gclid: string | null;
    source: string;
    services_interested: string[] | null;
  };
  const leadRows = leads as LeadRow[];
  const inWindow = leadRows.filter((l) => l.created_at >= window.fromIso);
  const inPrevious = leadRows.filter((l) => l.created_at < window.fromIso);

  const organic = inWindow.filter((l) => attributionOf(l) === "organic");
  const organicPrevious = inPrevious.filter((l) => attributionOf(l) === "organic");

  // Leads by the page they landed on. Paths only — a landing page with
  // tracking parameters is the same page.
  const pathOf = (url: string | null): string | null => {
    if (!url) return null;
    try {
      return new URL(url, "https://tomorrowstechai.com").pathname.replace(/\/$/, "") || "/";
    } catch {
      return url.startsWith("/") ? url.split("?")[0] : null;
    }
  };

  const leadsByPath = new Map<string, { total: number; organic: number }>();
  for (const l of inWindow) {
    const path = pathOf(l.landing_page);
    if (!path) continue;
    const entry = leadsByPath.get(path) ?? { total: 0, organic: 0 };
    entry.total++;
    if (attributionOf(l) === "organic") entry.organic++;
    leadsByPath.set(path, entry);
  }

  // ── The audit ──────────────────────────────────────────────────────
  const runId = (latestRun as { id?: string } | null)?.id ?? null;

  const [auditPages, auditIssues] = runId
    ? await Promise.all([
        sb
          .from("seo_pages")
          .select("path, url, title, title_length, description_length, word_count, status_code, response_ms, jsonld_types, internal_links, noindex")
          .eq("run_id", runId)
          .then((r) => unwrap(r, "audited pages")),
        sb
          .from("seo_issues")
          .select("path, code, severity, detail")
          .eq("run_id", runId)
          .then((r) => unwrap(r, "audit issues")),
      ])
    : [[], []];

  type PageRaw = {
    path: string;
    url: string;
    title: string | null;
    title_length: number | null;
    description_length: number | null;
    word_count: number;
    status_code: number | null;
    response_ms: number | null;
    jsonld_types: string[] | null;
    internal_links: number | null;
    noindex: boolean | null;
  };
  type IssueRaw = { path: string; code: RuleCode; severity: Severity; detail: string | null };

  const pageRaw = auditPages as PageRaw[];
  const issueRaw = auditIssues as IssueRaw[];

  const issues: SeoIssue[] = issueRaw
    .filter((i) => RULES[i.code])
    .map((i) => ({
      path: i.path,
      code: i.code,
      severity: i.severity,
      detail: i.detail,
      title: RULES[i.code].title,
      why: RULES[i.code].why,
      fix: RULES[i.code].fix,
      aiFixable: RULES[i.code].aiFixable,
    }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.path.localeCompare(b.path)
    );

  const issuesByPath = new Map<string, SeoIssue[]>();
  for (const i of issues) issuesByPath.set(i.path, [...(issuesByPath.get(i.path) ?? []), i]);

  const score = pageRaw.length > 0 ? healthScore(issues) : null;

  const pages: SeoPageRow[] = pageRaw
    .map((p) => {
      const pageIssues = issuesByPath.get(p.path) ?? [];
      const leadCounts = leadsByPath.get(p.path.replace(/\/$/, "") || "/") ?? { total: 0, organic: 0 };
      return {
        path: p.path,
        url: p.url,
        title: p.title,
        titleLength: p.title_length,
        descriptionLength: p.description_length,
        wordCount: p.word_count,
        statusCode: p.status_code,
        responseMs: p.response_ms,
        hasSchema: (p.jsonld_types ?? []).length > 0,
        internalLinks: p.internal_links ?? 0,
        leads: leadCounts.total,
        organicLeads: leadCounts.organic,
        issueCount: pageIssues.length,
        worstSeverity: pageIssues[0]?.severity ?? null,
      };
    })
    // Pages that earn leads first, then pages with the most wrong with them.
    .sort((a, b) => b.leads - a.leads || b.issueCount - a.issueCount);

  const severities: Severity[] = ["critical", "high", "medium", "low"];
  const bySeverity = severities
    .map((severity) => ({ severity, count: issues.filter((i) => i.severity === severity).length }))
    .filter((s) => s.count > 0);

  // ── The health strip ───────────────────────────────────────────────
  // Named properties of the site, each a share of pages rather than a
  // borrowed grade. A check that nothing here can measure says so instead
  // of being scored out of a hundred.
  const codesOn = (codes: RuleCode[]) =>
    new Set(issues.filter((i) => codes.includes(i.code)).map((i) => i.path)).size;

  const totalPages = pageRaw.length;
  const share = (failing: number): SeoCheck["tone"] => {
    if (totalPages === 0) return "none";
    const ratio = (totalPages - failing) / totalPages;
    return ratio === 1 ? "ok" : ratio >= 0.8 ? "warn" : "risk";
  };

  const httpsPages = pageRaw.filter((p) => p.url.startsWith("https://")).length;
  const reachable = pageRaw.filter((p) => (p.status_code ?? 0) >= 200 && (p.status_code ?? 0) < 300).length;
  const fastPages = pageRaw.filter((p) => (p.response_ms ?? 0) <= SLOW_RESPONSE_MS).length;

  const checkSpecs: { label: string; failing: number; detail: string }[] = totalPages === 0 ? [] : [
    { label: "Titles", failing: codesOn(["missing_title", "title_too_long", "title_too_short", "duplicate_title"]),
      detail: "Present, unique, and short enough to show in full" },
    { label: "Descriptions", failing: codesOn(["missing_description", "description_too_long", "description_too_short", "duplicate_description"]),
      detail: "Present, unique, and within the length Google renders" },
    { label: "Headings", failing: codesOn(["missing_h1", "multiple_h1"]),
      detail: "Exactly one H1 saying what the page is" },
    { label: "Schema markup", failing: codesOn(["no_schema"]),
      detail: "JSON-LD Google can read" },
    { label: "Indexing", failing: codesOn(["noindex", "unreachable"]) + (totalPages - reachable),
      detail: "Reachable and not blocked from search" },
    { label: "Page speed", failing: totalPages - fastPages,
      detail: `Server responds in under ${SLOW_RESPONSE_MS}ms` },
    { label: "Security", failing: totalPages - httpsPages,
      detail: "Every page served over HTTPS" },
  ];

  const checks: SeoCheck[] = [
    ...checkSpecs.map((c) => ({
      label: c.label,
      passed: Math.max(0, totalPages - c.failing),
      total: totalPages,
      detail: c.detail,
      tone: share(c.failing),
    })),
    // Named so its absence is visible. Field data belongs to Google, and
    // guessing it from a server response time would be a fabricated grade.
    {
      label: "Core Web Vitals",
      passed: null,
      total: totalPages,
      detail: "Needs PageSpeed Insights — measured from real visitors, not from here",
      tone: "none" as const,
    },
  ];

  // ── Content gaps ───────────────────────────────────────────────────
  // What leads asked about, against what the site actually publishes.
  // The site's own sitemap is the authority on which pages exist, so this
  // stays right even before the first audit has been run.
  const publishedPaths = new Set(
    auditTargets().map((t) => t.path.replace(/\/$/, "") || "/")
  );

  const interestCounts = new Map<string, number>();
  for (const l of inWindow) {
    for (const interest of l.services_interested ?? []) {
      interestCounts.set(interest, (interestCounts.get(interest) ?? 0) + 1);
    }
  }

  const gaps: ContentGap[] = [...interestCounts.entries()]
    .map(([interest, count]) => {
      const mapped = INTEREST_PAGES[interest];
      if (!mapped) return null;
      return {
        interest: mapped.label,
        leads: count,
        suggestedPath: mapped.slug,
        hasPage: publishedPaths.has(mapped.slug),
      } satisfies ContentGap;
    })
    .filter((g): g is ContentGap => g !== null)
    .sort((a, b) => Number(a.hasPage) - Number(b.hasPage) || b.leads - a.leads);

  // ── What to do next ────────────────────────────────────────────────
  // Rules, not a model. Every recommendation names the evidence that
  // produced it, so nothing here is an opinion the page cannot defend.
  const recommendations: SeoRecommendation[] = [];

  // 1. Something is broken on a page that is already earning leads. That
  //    combination outranks everything else on this list.
  const earningWithIssues = pages
    .filter((p) => p.leads > 0 && (p.worstSeverity === "critical" || p.worstSeverity === "high"))
    .slice(0, 3);
  for (const page of earningWithIssues) {
    const worst = (issuesByPath.get(page.path) ?? [])[0];
    if (!worst) continue;
    recommendations.push({
      id: `fix:${page.path}:${worst.code}`,
      kind: "technical",
      title: `Fix ${worst.title.toLowerCase()} on ${page.path}`,
      body: `${page.path} produced ${page.leads} lead${page.leads === 1 ? "" : "s"} in the last ${days} days and still has a ${worst.severity} issue. ${worst.fix}`,
      severity: worst.severity,
      path: page.path,
      aiFixable: worst.aiFixable,
    });
  }

  // 2. Demand with nowhere to land.
  for (const gap of gaps.filter((g) => !g.hasPage).slice(0, 3)) {
    recommendations.push({
      id: `gap:${gap.suggestedPath}`,
      kind: "content",
      title: `Write a ${gap.interest.toLowerCase()} page`,
      body: `${gap.leads} lead${gap.leads === 1 ? "" : "s"} in the last ${days} days asked about ${gap.interest.toLowerCase()}, and the only page covering it is the shared services page. A page at ${gap.suggestedPath} can rank for those searches on its own.`,
      severity: gap.leads >= 3 ? "high" : "medium",
      path: gap.suggestedPath,
      aiFixable: true,
    });
  }

  // 3. Already ranking, just below the fold. Cheapest traffic on the board —
  //    but only real once Search Console has actually synced.
  for (const q of search.nearlyThere.slice(0, 3)) {
    recommendations.push({
      id: `near:${q.query}`,
      kind: "opportunity",
      title: `Push "${q.query}" onto page one`,
      body: `Ranked ${q.position === null ? "on page two" : `#${q.position.toFixed(1)}`} with ${q.impressions.toLocaleString()} impressions and ${q.clicks} click${q.clicks === 1 ? "" : "s"}. ${q.page} already ranks for it; strengthening that page is a smaller job than starting a new one.`,
      severity: "medium",
      path: null,
      aiFixable: true,
    });
  }

  // 4. Seen often, clicked rarely: the listing is the problem, not the rank.
  const lowCtr = search.queries
    .filter((q) => q.impressions >= 100 && q.ctr < 0.02 && (q.position ?? 99) <= 10)
    .slice(0, 2);
  for (const q of lowCtr) {
    recommendations.push({
      id: `ctr:${q.query}`,
      kind: "opportunity",
      title: `Rewrite the listing for "${q.query}"`,
      body: `${q.impressions.toLocaleString()} impressions at position ${(q.position ?? 0).toFixed(1)} but only ${(q.ctr * 100).toFixed(1)}% of people clicked. The ranking is fine — the title and description on ${q.page} are what people are declining.`,
      severity: "medium",
      path: null,
      aiFixable: true,
    });
  }

  // 5. Nothing is wrong. Say so rather than padding the list.
  if (recommendations.length === 0 && score !== null && score >= 90) {
    recommendations.push({
      id: "clear",
      kind: "success",
      title: "No SEO problems found",
      body: `The last audit checked ${pageRaw.length} page${pageRaw.length === 1 ? "" : "s"} and scored ${score}. Nothing needs fixing right now.`,
      severity: "low",
      path: null,
      aiFixable: false,
    });
  }

  // ── Competitors ────────────────────────────────────────────────────
  // Rows exist as soon as a domain is added; the numbers stay null until a
  // rank-tracking source fills them in. A watched competitor with no data
  // is shown as watched with no data, not as a competitor scoring zero.
  type CompetitorRaw = {
    id: string;
    domain: string;
    label: string | null;
    visibility_pct: number | null;
    keyword_count: number | null;
    traffic_est: number | null;
    stats_source: string | null;
  };

  const competitorRows = (competitors as CompetitorRaw[]).map((c) => ({
    id: c.id,
    domain: c.domain,
    label: c.label,
    visibility: c.visibility_pct,
    keywords: c.keyword_count,
    traffic: c.traffic_est,
    statsSource: c.stats_source,
  }));

  const run = latestRun as {
    started_at?: string;
    finished_at?: string | null;
    status?: string;
    pages_checked?: number | null;
  } | null;

  return {
    search,
    local: localConnection(),

    audit: {
      ranAt: run?.finished_at ?? run?.started_at ?? null,
      status: run?.status ?? null,
      pagesChecked: run?.pages_checked ?? pageRaw.length,
      score,
      band: score === null ? null : healthBand(score).band,
      bandLabel: score === null ? null : healthBand(score).label,
      issues,
      bySeverity,
    },

    pages,
    checks,
    organicLeads: organic.length,
    organicLeadsPrevious: organicPrevious.length,
    totalLeads: inWindow.length,
    gaps,
    recommendations,
    competitors: competitorRows,
    pendingActions,
  };
}
