import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSeoBoard, type SeoBoard as Board, type SeoRecommendation } from "@/lib/seo/queries";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import MiniBars from "../MiniBars";
import { HealthRing } from "../Viz";
import { count, compact, DASH, pct, shortDate } from "../format";
import {
  IconAlert,
  IconChart,
  IconCheck,
  IconFunnel,
  IconGlobe,
  IconLink,
  IconMapPin,
  IconPen,
  IconPlus,
  IconSearch,
  IconSpark,
  IconX,
} from "../Icons";
import {
  addCompetitorAction,
  proposeSeoActionAction,
  queueSeoJobAction,
  removeCompetitorAction,
  runSeoAuditAction,
} from "@/app/admin/seo-actions";

/**
 * The SEO Command Center.
 *
 * The screen is split down one line that never moves: what this system can
 * measure by itself, and what needs Google. The audit, the pages that produce
 * leads, the content gaps and the review queue are computed here and are true
 * right now. Rankings, impressions and clicks belong to Search Console, and
 * until it is connected those panels say so instead of rendering zeros —
 * a zero is a measurement, and we have not taken it.
 */

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) return null;
  const change = (now - before) / before;
  const rounded = Math.round(change * 1000) / 10;
  const tone = Math.abs(rounded) < 0.1 ? "flat" : rounded > 0 ? "up" : "down";
  return (
    <span className={`cc-delta ${tone}`}>
      {rounded > 0 ? "+" : ""}
      {rounded.toFixed(1)}% vs previous
    </span>
  );
}

function NotConnected({ what, reason, icon }: { what: string; reason: string; icon?: React.ReactNode }) {
  return (
    <EmptyState
      icon={icon}
      title={`${what} is not connected`}
      text={`${reason} Nothing is shown here rather than showing zeros, because no measurement has been taken yet.`}
      cta={{ href: "/admin/settings", label: "Open settings" }}
    />
  );
}

/* ── 1. The six numbers ────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const t = board.search.totals;
  const p = board.search.previousTotals;

  const cards: {
    label: string;
    value: string;
    icon: React.ReactNode;
    foot: React.ReactNode;
  }[] = [
    {
      label: "Organic clicks",
      value: t ? count(t.clicks) : DASH,
      icon: <IconSearch size={15} />,
      foot: t && p ? <Delta now={t.clicks} before={p.clicks} /> : <span className="cc-faint">Needs Search Console</span>,
    },
    {
      label: "Search impressions",
      value: t ? compact(t.impressions) : DASH,
      icon: <IconChart size={15} />,
      foot:
        t && p ? <Delta now={t.impressions} before={p.impressions} /> : <span className="cc-faint">Needs Search Console</span>,
    },
    {
      label: "Click-through rate",
      value: t ? pct(t.ctr) : DASH,
      icon: <IconLink size={15} />,
      foot: <span className="cc-faint">{t ? "Clicks per impression" : "Needs Search Console"}</span>,
    },
    {
      label: "Average position",
      value: t?.position ? t.position.toFixed(1) : DASH,
      icon: <IconFunnel size={15} />,
      foot: <span className="cc-faint">{t ? "Weighted by impressions" : "Needs Search Console"}</span>,
    },
    {
      label: "Pages in search",
      value: t ? count(t.pagesWithImpressions) : DASH,
      icon: <IconGlobe size={15} />,
      foot: (
        <span className="cc-faint">
          {t ? `${count(board.audit.pagesChecked)} audited` : `${count(board.audit.pagesChecked)} audited on this site`}
        </span>
      ),
    },
    {
      label: "SEO leads",
      value: count(board.organicLeads),
      icon: <IconSpark size={15} />,
      foot:
        board.organicLeadsPrevious > 0 ? (
          <Delta now={board.organicLeads} before={board.organicLeadsPrevious} />
        ) : (
          <span className="cc-faint">
            of {count(board.totalLeads)} total {board.totalLeads === 1 ? "lead" : "leads"}
          </span>
        ),
    },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((c) => (
        <div className="cc-kpi" key={c.label}>
          <div className="cc-kpi-top">
            <span className="cc-kpi-icon">{c.icon}</span>
            <span className="cc-kpi-label">{c.label}</span>
          </div>
          <div className="cc-kpi-value">{c.value}</div>
          <div className="cc-kpi-foot">{c.foot}</div>
        </div>
      ))}
    </div>
  );
}

/* ── 2. Search performance ─────────────────────────────────────────── */

function SearchPerformance({ board }: { board: Board }) {
  const { series, connected, reason, lastSyncedAt } = board.search;

  return (
    <Panel
      title="Search performance"
      sub={lastSyncedAt ? `Synced ${shortDate(lastSyncedAt)}` : undefined}
      icon={<IconChart size={15} />}
      className="cc-s12"
    >
      {series.length === 0 ? (
        <NotConnected what="Search Console" reason={reason} icon={<IconSearch size={17} />} />
      ) : (
        <MiniBars
          points={series.map((d) => ({ key: d.date, value: d.clicks }))}
          labelLeft={shortDate(series[0].date)}
          labelRight={shortDate(series[series.length - 1].date)}
          format={(v, key) => `${shortDate(key)}: ${v} click${v === 1 ? "" : "s"}`}
        />
      )}
      {connected && series.length === 0 ? (
        <p className="cc-note">Credentials are set, but nothing has synced into seo_queries yet.</p>
      ) : null}
    </Panel>
  );
}

/* ── 3. Keyword rankings ───────────────────────────────────────────── */

function Keywords({ board }: { board: Board }) {
  const rows = board.search.queries.slice(0, 12);

  return (
    <Panel title="Keyword rankings" sub="Last 28 days" icon={<IconSearch size={15} />} className="cc-s4">
      {rows.length === 0 ? (
        <NotConnected what="Search Console" reason={board.search.reason} icon={<IconSearch size={17} />} />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Query</th>
                <th className="num">Pos</th>
                <th className="num">Clicks</th>
                <th className="num">Impr.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={`${q.query}|${q.page}`}>
                  <td>
                    <span className="cc-strong">{q.query}</span>
                  </td>
                  <td className="num">{q.position === null ? DASH : q.position.toFixed(1)}</td>
                  <td className="num">{count(q.clicks)}</td>
                  <td className="num">{compact(q.impressions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── 4. Landing pages ──────────────────────────────────────────────── */

const SEVERITY_TONE: Record<string, string> = {
  critical: "t-risk",
  high: "t-risk",
  medium: "t-warn",
  low: "t-info",
};

function LandingPages({ board }: { board: Board }) {
  const rows = board.pages.slice(0, 12);

  return (
    <Panel
      title="Top landing pages"
      sub="Ranked by leads produced"
      icon={<IconGlobe size={15} />}
      className="cc-s12"
      action={{ href: "/admin/leads", label: "Leads" }}
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No audit has run yet"
          text="Run an audit and this lists every page on the site, what is wrong with it, and how many leads it produced."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Page</th>
                <th className="num">Leads</th>
                <th className="num">Words</th>
                <th className="num">Load</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.path}>
                  <td>
                    <span className="cc-strong">{p.path}</span>
                    <span className="cc-client-sub">{p.title ?? "No title"}</span>
                  </td>
                  <td className="num">
                    {p.leads === 0 ? <span className="cc-dim">{DASH}</span> : count(p.leads)}
                  </td>
                  <td className="num">{count(p.wordCount)}</td>
                  <td className="num">{p.responseMs === null ? DASH : `${p.responseMs}ms`}</td>
                  <td>
                    {p.issueCount === 0 ? (
                      <span className="cc-chip t-ok">
                        <IconCheck size={11} /> Clean
                      </span>
                    ) : (
                      <span className={`cc-chip ${SEVERITY_TONE[p.worstSeverity ?? "low"]}`}>
                        {p.issueCount} {p.issueCount === 1 ? "issue" : "issues"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── 5. Local SEO ──────────────────────────────────────────────────── */

function LocalSeo({ board }: { board: Board }) {
  return (
    <Panel title="Local SEO" icon={<IconMapPin size={15} />} className="cc-s6">
      {board.local.connected ? (
        <EmptyState
          title="Connected, nothing synced"
          text="Google Business Profile credentials are set. Local metrics appear here once the first sync runs."
        />
      ) : (
        <NotConnected
          what="Google Business Profile"
          reason={board.local.reason}
          icon={<IconMapPin size={17} />}
        />
      )}
    </Panel>
  );
}

/* ── 6. SEO health ─────────────────────────────────────────────────── */

function Health({ board }: { board: Board }) {
  const { score, band, bandLabel, issues, bySeverity, ranAt, pagesChecked } = board.audit;

  return (
    <Panel
      title="SEO health"
      sub={ranAt ? `${bandLabel ?? ""} — audited ${shortDate(ranAt)}` : "Never audited"}
      icon={<IconAlert size={15} />}
      className="cc-s8"
      footer={
        <form action={runSeoAuditAction}>
          <button type="submit" className="cc-btn primary">
            {ranAt ? "Re-run audit" : "Run first audit"}
          </button>
          <span className="cc-note">
            Reads the site over HTTP and records what it finds. Changes nothing.
          </span>
        </form>
      }
    >
      {score === null ? (
        <EmptyState
          title="No audit yet"
          text="An audit fetches every page in the sitemap and checks titles, descriptions, headings, schema, canonicals and response time."
        />
      ) : (
        <>
          <div className="cc-seo-health">
            <HealthRing score={score} band={band ?? "average"} />
            <div className="cc-stats">
              <div className="cc-stat">
                <div className="cc-stat-label">Pages checked</div>
                <div className="cc-stat-value">{count(pagesChecked)}</div>
              </div>
              {bySeverity.map((s) => (
                <div className="cc-stat" key={s.severity}>
                  <div className="cc-stat-label">{s.severity}</div>
                  <div
                    className={`cc-stat-value ${s.severity === "critical" || s.severity === "high" ? "t-risk" : ""}`}
                  >
                    {count(s.count)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="cc-checks">
            {board.checks.map((c) => (
              <div className={`cc-check-row t-${c.tone}`} key={c.label}>
                <span className="cc-check-dot" />
                <span className="cc-check-name">{c.label}</span>
                <span className="cc-check-detail">{c.detail}</span>
                <span className="cc-check-score">
                  {c.passed === null ? "Not measured" : `${c.passed}/${c.total}`}
                </span>
              </div>
            ))}
          </div>

          {issues.length === 0 ? (
            <p className="cc-note">Every check passed on all {count(pagesChecked)} pages.</p>
          ) : (
            <>
              <div className="cc-subhead">Issues to fix</div>
              <div className="cc-alerts">
              {issues.slice(0, 8).map((i, n) => (
                <div className={`cc-alert p-${i.severity}`} key={`${i.path}:${i.code}:${n}`}>
                  <span className="cc-alert-pri" />
                  <span className="cc-alert-main">
                    <span className="cc-alert-title">{i.title}</span>
                    <span className="cc-alert-detail">
                      {i.path}
                      {i.detail ? ` — ${i.detail}` : ""}. {i.fix}
                    </span>
                  </span>
                  <span className="cc-alert-cat">{i.severity}</span>
                </div>
              ))}
              {issues.length > 8 ? (
                <p className="cc-note">
                  {issues.length - 8} more {issues.length - 8 === 1 ? "issue" : "issues"} not shown.
                </p>
              ) : null}
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

/* ── 7. Content opportunities ──────────────────────────────────────── */

function Opportunities({ board }: { board: Board }) {
  const missing = board.gaps.filter((g) => !g.hasPage);
  const near = board.search.nearlyThere.slice(0, 5);

  return (
    <Panel
      title="Content opportunities"
      sub="Demand without a page, and rankings just off page one"
      icon={<IconPen size={15} />}
      className="cc-s4"
    >
      {missing.length === 0 && near.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          text="Opportunities appear here when leads ask about something the site has no page for, or when a keyword ranks on page two."
        />
      ) : (
        <>
          {missing.length > 0 ? (
            <div className="cc-barlist">
              {missing.map((g) => (
                <div className="cc-barrow" key={g.suggestedPath}>
                  <span className="cc-barrow-label">{g.interest}</span>
                  <span className="cc-barrow-track">
                    <span
                      className="cc-barrow-fill"
                      style={{ width: `${Math.min(100, (g.leads / Math.max(...missing.map((m) => m.leads))) * 100)}%` }}
                    />
                  </span>
                  <span className="cc-barrow-value">{count(g.leads)}</span>
                  <span className="cc-barrow-share">{g.suggestedPath}</span>
                </div>
              ))}
            </div>
          ) : null}

          {near.length > 0 ? (
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>On page two</th>
                  <th className="num">Pos</th>
                  <th className="num">Impr.</th>
                </tr>
              </thead>
              <tbody>
                {near.map((q) => (
                  <tr key={`${q.query}|${q.page}`}>
                    <td className="cc-strong">{q.query}</td>
                    <td className="num">{q.position === null ? DASH : q.position.toFixed(1)}</td>
                    <td className="num">{compact(q.impressions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/* ── 8. Competitor watch ───────────────────────────────────────────── */

function Competitors({ board }: { board: Board }) {
  return (
    <Panel
      title="Competitor watch"
      sub={board.competitors.length > 0 ? `${board.competitors.length} watched` : undefined}
      icon={<IconFunnel size={15} />}
      className="cc-s6"
      footer={
        <form action={addCompetitorAction} className="cc-inline-form">
          <input className="cc-input" name="domain" placeholder="competitor.com" aria-label="Competitor domain" required />
          <button type="submit" className="cc-btn">
            <IconPlus size={13} /> Watch
          </button>
        </form>
      }
    >
      {board.competitors.length === 0 ? (
        <EmptyState
          title="No competitors watched"
          text="Add a domain to track it. Visibility and keyword counts stay blank until a rank-tracking source is connected — this system does not estimate them."
        />
      ) : (
        <ul className="cc-health">
          {board.competitors.map((c) => (
            <li className="cc-health-row" key={c.id}>
              <div className="cc-health-name">{c.label ?? c.domain}</div>
              <div className="cc-health-detail">
                {c.statsSource ? `${c.visibility ?? DASH}% visibility` : "No data source"}
              </div>
              <form action={removeCompetitorAction}>
                <input type="hidden" name="competitor_id" value={c.id} />
                <button type="submit" className="cc-icon-btn" aria-label={`Stop watching ${c.domain}`}>
                  <IconX size={13} />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── 9. The advisor, and the queue it writes into ──────────────────── */

const KIND_LABEL: Record<SeoRecommendation["kind"], string> = {
  opportunity: "Opportunity",
  action: "Action",
  technical: "Technical",
  content: "Content",
  success: "All clear",
};

function Advisor({ board }: { board: Board }) {
  return (
    <Panel
      title="AI SEO advisor"
      sub="Ranked by what it would be worth fixing first"
      icon={<IconSpark size={15} />}
      className="cc-s8"
      footer={
        <span className="cc-note">
          Every recommendation is derived from this site&rsquo;s own audit and lead data — nothing here
          is generated from a guess. Queuing one creates a proposal; it changes nothing until you
          approve it.
        </span>
      }
    >
      {board.recommendations.length === 0 ? (
        <EmptyState
          title="Nothing to recommend yet"
          text="Run an audit, and connect Search Console, and this fills with what to do next and why."
        />
      ) : (
        <div className="cc-insights">
          {board.recommendations.map((r) => (
            <article className={`cc-insight k-${r.kind === "success" ? "system" : r.kind === "content" ? "marketing" : r.kind === "technical" ? "risk" : "opportunity"}`} key={r.id}>
              <span className="cc-insight-rail" />
              <div className="cc-insight-body">
                <div className="cc-insight-kind">{KIND_LABEL[r.kind]}</div>
                <div className="cc-insight-title">{r.title}</div>
                <p className="cc-insight-text">{r.body}</p>
                {r.aiFixable ? (
                  <form action={proposeSeoActionAction} className="cc-inline-form">
                    <input type="hidden" name="title" value={r.title} />
                    <input type="hidden" name="body" value={r.body} />
                    <input type="hidden" name="path" value={r.path ?? ""} />
                    <input type="hidden" name="severity" value={r.severity} />
                    <button type="submit" className="cc-btn">
                      Queue for review
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── 10. The six standing jobs ─────────────────────────────────────── */

/**
 * Each tile states what it would do and what evidence it has. A tile with
 * nothing to work on is shown disabled with the reason, not hidden — "no
 * pages are missing a description" is worth knowing.
 */
function AiActions({ board }: { board: Board }) {
  const metaCodes = [
    "missing_title",
    "missing_description",
    "title_too_long",
    "title_too_short",
    "description_too_long",
    "description_too_short",
    "duplicate_title",
    "duplicate_description",
  ];
  const metaPages = new Set(
    board.audit.issues.filter((i) => metaCodes.includes(i.code)).map((i) => i.path)
  ).size;
  const noSchema = board.pages.filter((p) => !p.hasSchema).length;
  const fewLinks = board.pages.filter((p) => p.internalLinks < 5).length;
  const missingGaps = board.gaps.filter((g) => !g.hasPage).length;
  const withIssues = board.pages.filter((p) => p.issueCount > 0).length;
  const blogTopic = board.search.nearlyThere.length > 0 || missingGaps > 0;

  const jobs: { job: string; label: string; icon: React.ReactNode; ready: boolean; hint: string }[] = [
    {
      job: "draft_page",
      label: "Draft SEO page",
      icon: <IconPen size={16} />,
      ready: missingGaps > 0,
      hint: missingGaps > 0 ? `${missingGaps} unserved topic${missingGaps === 1 ? "" : "s"}` : "No unserved topics",
    },
    {
      job: "improve_page",
      label: "Improve a page",
      icon: <IconSpark size={16} />,
      ready: withIssues > 0,
      hint: withIssues > 0 ? `${withIssues} page${withIssues === 1 ? "" : "s"} with issues` : "No page has issues",
    },
    {
      job: "meta_tags",
      label: "Generate meta tags",
      icon: <IconLink size={16} />,
      ready: metaPages > 0,
      hint: metaPages > 0 ? `${metaPages} page${metaPages === 1 ? "" : "s"} need work` : "Titles and descriptions are fine",
    },
    {
      job: "blog_post",
      label: "Create blog post",
      icon: <IconPen size={16} />,
      ready: blogTopic,
      hint: blogTopic ? "A topic with demand behind it" : "No searched topic to write about yet",
    },
    {
      job: "faq_schema",
      label: "Build FAQ schema",
      icon: <IconCheck size={16} />,
      ready: noSchema > 0,
      hint: noSchema > 0 ? `${noSchema} page${noSchema === 1 ? "" : "s"} without schema` : "Every page has schema",
    },
    {
      job: "internal_links",
      label: "Suggest internal links",
      icon: <IconGlobe size={16} />,
      ready: fewLinks > 0,
      hint: fewLinks > 0 ? `${fewLinks} thinly linked page${fewLinks === 1 ? "" : "s"}` : "Every page is well linked",
    },
  ];

  return (
    <Panel
      title="AI actions"
      sub="Each one writes a proposal — none of them change the site"
      icon={<IconSpark size={15} />}
      className="cc-s12"
      footer={
        <div className="cc-inline-form">
          <span className="cc-note">
            {board.pendingActions > 0
              ? `${count(board.pendingActions)} proposal${board.pendingActions === 1 ? "" : "s"} awaiting review across the business.`
              : "Nothing is awaiting review."}
          </span>
          <Link href="/admin/ai" className="cc-cta">
            Open the review queue
          </Link>
        </div>
      }
    >
      <div className="cc-jobs">
        {jobs.map((j) => (
          <form action={queueSeoJobAction} key={j.job} className="cc-job">
            <input type="hidden" name="job" value={j.job} />
            <button type="submit" className="cc-job-btn" disabled={!j.ready}>
              <span className="cc-job-icon">{j.icon}</span>
              <span className="cc-job-label">{j.label}</span>
              <span className="cc-job-hint">{j.hint}</span>
            </button>
          </form>
        ))}
      </div>
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function SeoBoard() {
  const supabase = await createSupabaseServerClient();
  const board = await loadSeoBoard(supabase);

  return (
    <>
      <KpiRow board={board} />
      <div className="cc-board">
        <Advisor board={board} />
        <Opportunities board={board} />
        <AiActions board={board} />
        <Health board={board} />
        <Keywords board={board} />
        <SearchPerformance board={board} />
        <LandingPages board={board} />
        <LocalSeo board={board} />
        <Competitors board={board} />
        {/* Rows are laid out 8+4, 6+6, 8+4, 12, 6+6 — every row fills the
            twelve columns, so no panel is left stranded beside empty space. */}
      </div>
    </>
  );
}

export function SeoBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="AI SEO advisor" rows={5} />
      <PanelSkeleton title="SEO health" rows={5} />
      <PanelSkeleton title="Top landing pages" rows={6} />
    </div>
  );
}
