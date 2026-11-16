import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAdminArticles, type AdminArticle } from "@/lib/blog/admin-queries";
import { analyticsConfigured, byDimension } from "@/lib/analytics/vercel-web";
import { formatDate } from "@/lib/blog/repository";
import { Panel, EmptyState } from "@/components/admin/cc/Panel";
import { IconFile } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blog" };

/**
 * Field Notes in the Admin Center: every article, its status, whether it
 * passes the editorial checks, and how it is doing (views, leads).
 * Click an article to edit it; New article starts a draft.
 */

const TABS = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "archived", label: "Archived" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

async function viewsByPath(): Promise<Map<string, number> | null> {
  if (!analyticsConfigured()) return null;
  try {
    const until = new Date();
    const since = new Date(until.getTime() - 30 * 86_400_000);
    const rows = await byDimension("requestPath", since, until, { limit: 100, filter: "startswith(requestPath, '/blog/')" });
    return new Map(rows.map((r) => [r.key, r.pageviews]));
  } catch {
    return null;
  }
}

export default async function BlogAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const tabRaw = Array.isArray(q.tab) ? q.tab[0] : q.tab;
  const tab: TabKey = TABS.some((t) => t.key === tabRaw) ? (tabRaw as TabKey) : "all";
  const search = ((Array.isArray(q.q) ? q.q[0] : q.q) ?? "").trim().toLowerCase();

  const supabase = await createSupabaseServerClient();
  const [list, views, leadRows] = await Promise.all([
    listAdminArticles(supabase),
    viewsByPath(),
    supabase.from("leads").select("landing_page").like("landing_page", "/blog/%").limit(5000),
  ]);

  const leads = new Map<string, number>();
  for (const r of (leadRows.data ?? []) as { landing_page: string | null }[]) {
    if (r.landing_page) leads.set(r.landing_page, (leads.get(r.landing_page) ?? 0) + 1);
  }

  const all = list.articles;
  const count = (k: TabKey) => (k === "all" ? all.length : all.filter((a) => a.status === k).length);
  const shown = all
    .filter((a) => tab === "all" || a.status === tab)
    .filter((a) => !search || a.title.toLowerCase().includes(search) || a.slug.includes(search) || a.categoryName.toLowerCase().includes(search));

  const totalViews = views ? [...views.values()].reduce((s, v) => s + v, 0) : null;
  const totalLeads = [...leads.values()].reduce((s, v) => s + v, 0);
  const inCode = all.filter((a) => a.source === "code").length;
  const withErrors = all.filter((a) => a.errors.length).length;

  const kpis = [
    { label: "Articles", value: fmt(all.length), hint: `${fmt(count("published"))} published · ${fmt(count("draft"))} drafts` },
    { label: "Views, 30 days", value: totalViews === null ? "—" : fmt(totalViews), hint: totalViews === null ? "Analytics not connected" : "All Field Notes pages" },
    { label: "Leads from articles", value: fmt(totalLeads), hint: "All time, by landing page" },
    { label: "Need attention", value: fmt(withErrors), hint: withErrors ? "Fail an editorial check" : "All pass the checks" },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Blog</h1>
          <p>Every Field Notes article: status, editorial checks, views and the leads it brought in.</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/blog" target="_blank" className="cc-btn">View Field Notes</Link>
          <Link href="/admin/blog/new" className="cc-btn primary">New article</Link>
        </div>
      </div>

      {!list.dbReady ? (
        <section className="cc-panel" style={{ marginBottom: 16 }}>
          <div className="cc-panel-body">
            <p className="cc-note" style={{ margin: 0 }}>
              <strong>Database not set up yet.</strong> Showing the articles stored in code. Once the Field Notes
              migration is applied and the articles are imported, everything here becomes editable.
            </p>
          </div>
        </section>
      ) : inCode > 0 ? (
        <section className="cc-panel" style={{ marginBottom: 16 }}>
          <div className="cc-panel-body">
            <p className="cc-note" style={{ margin: 0 }}>
              {fmt(inCode)} article{inCode === 1 ? " is" : "s are"} still only in code and not yet imported into the database.
            </p>
          </div>
        </section>
      ) : null}

      <div className="cc-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cc-kpi">
            <div className="cc-kpi-top"><span className="cc-kpi-label">{k.label}</span></div>
            <span className="cc-kpi-value">{k.value}</span>
            <div className="cc-kpi-foot"><span>{k.hint}</span></div>
          </div>
        ))}
      </div>

      <Panel title="Articles" icon={<IconFile size={15} />} bodyClass="flush" className="" >
        <div className="cc-filterbar" style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="cc-tabs" role="group" aria-label="Status" style={{ padding: 0, borderBottom: 0 }}>
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/admin/blog?tab=${t.key}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                className={`cc-tab ${t.key === tab ? "is-on" : ""}`}
                aria-current={t.key === tab ? "page" : undefined}
              >
                {t.label} <span className="cc-tab-n">{count(t.key)}</span>
              </Link>
            ))}
          </div>
          <form method="get" style={{ marginLeft: "auto" }}>
            <input type="hidden" name="tab" value={tab} />
            <input name="q" defaultValue={search} placeholder="Search title, slug or section" className="cc-filter-search" aria-label="Search articles" />
          </form>
        </div>

        {shown.length === 0 ? (
          <EmptyState title="No articles here" text={search ? "Nothing matches that search." : "No articles with this status yet."} />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Status</th>
                  <th>Section</th>
                  <th>Published</th>
                  <th className="num">Views (30d)</th>
                  <th className="num">Leads</th>
                  <th>Checks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <ArticleRow key={a.ref} a={a} views={views?.get(`/blog/${a.slug}`)} leads={leads.get(`/blog/${a.slug}`) ?? 0} viewsKnown={views !== null} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

const STATUS_LABEL: Record<AdminArticle["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

function ArticleRow({ a, views, leads, viewsKnown }: { a: AdminArticle; views?: number; leads: number; viewsKnown: boolean }) {
  const live = a.status === "published" || a.status === "archived";
  return (
    <tr>
      <td style={{ maxWidth: 460 }}>
        <Link href={`/admin/blog/${encodeURIComponent(a.ref)}/${a.source === "database" ? "edit" : "preview"}`} className="cc-strong">{a.title}</Link>
        <div className="cc-faint" style={{ fontSize: "0.78rem" }}>
          /blog/{a.slug}
          {a.featured ? " · Featured" : ""}
          {a.source === "code" ? " · In code (not imported)" : ""}
        </div>
      </td>
      <td><span className={`cc-chip ${a.status === "published" ? "t-ok" : a.status === "draft" ? "t-muted" : a.status === "scheduled" ? "t-info" : "t-warn"}`}>{STATUS_LABEL[a.status]}</span></td>
      <td>{a.categoryName}</td>
      <td style={{ whiteSpace: "nowrap" }}>{a.status === "draft" ? "—" : formatDate(a.publishedAt)}</td>
      <td className="num">{viewsKnown ? fmt(views ?? 0) : "—"}</td>
      <td className="num">{fmt(leads)}</td>
      <td title={[...a.errors, ...a.warnings].join("\n")}>
        {a.errors.length ? (
          <span className="cc-chip t-risk">{a.errors.length} error{a.errors.length === 1 ? "" : "s"}</span>
        ) : a.warnings.length ? (
          <span className="cc-chip t-warn">{a.warnings.length} warning{a.warnings.length === 1 ? "" : "s"}</span>
        ) : (
          <span className="cc-chip t-ok">Pass</span>
        )}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        {a.source === "database" ? (
          <>
            <Link href={`/admin/blog/${encodeURIComponent(a.ref)}/edit`} className="cc-more">Edit</Link>
            {" · "}
          </>
        ) : null}
        <Link href={`/admin/blog/${encodeURIComponent(a.ref)}/preview`} className="cc-more">Preview</Link>
        {live ? (
          <>
            {" · "}
            <a href={`/blog/${a.slug}`} target="_blank" rel="noopener noreferrer" className="cc-more">Live</a>
          </>
        ) : null}
      </td>
    </tr>
  );
}
