import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Panel, EmptyState, ErrorState } from "@/components/admin/cc/Panel";
import { BarList } from "@/components/admin/cc/Viz";
import MiniBars from "@/components/admin/cc/MiniBars";
import { IconChart, IconFunnel, IconGlobe, IconFile, IconUsers } from "@/components/admin/cc/Icons";
import {
  analyticsConfigured,
  byDimension,
  perDay,
  statusFrom,
  totals,
  type Counts,
  type Row,
  type TrafficStatus,
} from "@/lib/analytics/vercel-web";
import { leadStats, type LeadStats } from "@/lib/analytics/leads";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

/**
 * Analytics: website traffic (Vercel Web Analytics, cookieless) next to the
 * leads it produced (Supabase). Answers: how many people came, what they read,
 * where they came from, and how many became leads.
 */

const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
type RangeKey = keyof typeof RANGES;

function chicagoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
}

function dayList(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(chicagoDay(new Date(Date.now() - i * 86_400_000)));
  return out;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const shortDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function bars(rows: { key: string; value: number }[], total: number, label?: (k: string) => string) {
  return rows.map((r) => ({
    label: label ? label(r.key) : r.key,
    value: r.value,
    share: total > 0 ? r.value / total : 0,
    valueLabel: fmt(r.value),
  }));
}

type Part<T> = { ok: true; data: T } | { ok: false; error: string };

type Traffic = {
  status: TrafficStatus;
  totals?: Part<Counts>;
  blog?: Part<Counts>;
  daily?: Part<{ day: string; pageviews: number; visitors: number }[]>;
  pages?: Part<Row[]>;
  articles?: Part<Row[]>;
  referrers?: Part<Row[]>;
  countries?: Part<Row[]>;
  devices?: Part<Row[]>;
};

async function part<T>(p: Promise<T>): Promise<Part<T>> {
  try {
    return { ok: true, data: await p };
  } catch (err) {
    const st = statusFrom(err);
    return { ok: false, error: st.state === "error" ? st.message : st.state };
  }
}

/**
 * Each query stands alone: one refused breakdown (Vercel gates some dimensions
 * by plan) must not blank the rest of the page.
 */
async function loadTraffic(since: Date, until: Date): Promise<Traffic> {
  if (!analyticsConfigured()) return { status: { state: "no-token" } };
  const blogFilter = "startswith(requestPath, '/blog/')";
  const [t, blog, daily, pages, articles, referrers, countries, devices] = await Promise.all([
    part(totals(since, until)),
    part(totals(since, until, blogFilter)),
    part(perDay(since, until)),
    part(byDimension("requestPath", since, until, { limit: 10 })),
    part(byDimension("requestPath", since, until, { limit: 10, filter: blogFilter })),
    part(byDimension("referrerHostname", since, until, { limit: 8 })),
    part(byDimension("country", since, until, { limit: 6 })),
    part(byDimension("deviceType", since, until, { limit: 4 })),
  ]);
  // If even the headline count fails, report why (not enabled, bad token...).
  if (!t.ok) {
    const status: TrafficStatus =
      t.error === "not-enabled" ? { state: "not-enabled" } : t.error === "no-token" ? { state: "no-token" } : { state: "error", message: t.error };
    return { status };
  }
  return { status: { state: "ok" }, totals: t, blog, daily, pages, articles, referrers, countries, devices };
}

const val = <T,>(p?: Part<T>): T | undefined => (p && p.ok ? p.data : undefined);

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const raw = Array.isArray(q.range) ? q.range[0] : q.range;
  const range: RangeKey = raw && raw in RANGES ? (raw as RangeKey) : "30d";
  const nDays = RANGES[range];
  const days = dayList(nDays);
  const until = new Date();
  const since = new Date(`${days[0]}T00:00:00-06:00`);

  const supabase = await createSupabaseServerClient();
  const [traffic, leadsResult] = await Promise.all([
    loadTraffic(since, until),
    leadStats(supabase, since, until, days).then(
      (data) => ({ ok: true as const, data }),
      (e: Error) => ({ ok: false as const, error: e.message })
    ),
  ]);
  const leads: LeadStats | null = leadsResult.ok ? leadsResult.data : null;
  const trafficOk = traffic.status.state === "ok";

  const tot = val(traffic.totals);
  const blogTot = val(traffic.blog);
  const visitors = tot?.visitors ?? 0;
  const conversion = trafficOk && leads && visitors > 0 ? (leads.total / visitors) * 100 : null;

  const daily = val(traffic.daily);
  const dailyViews = days.map((d) => ({ key: d, value: daily?.find((x) => x.day === d)?.pageviews ?? 0 }));
  const dailyLeads = (leads?.perDay ?? days.map((d) => ({ day: d, count: 0 }))).map((d) => ({ key: d.day, value: d.count }));

  const kpis = [
    { label: "Visitors", value: trafficOk ? fmt(visitors) : "—", hint: "Unique, cookieless" },
    { label: "Page views", value: trafficOk ? fmt(tot?.pageviews ?? 0) : "—", hint: "All public pages" },
    { label: "Field Notes views", value: trafficOk && blogTot ? fmt(blogTot.pageviews) : "—", hint: "Article page views" },
    { label: "Leads", value: leads ? fmt(leads.total) : "—", hint: leads ? `${fmt(leads.open)} open · ${fmt(leads.won)} won` : "Could not load" },
    {
      label: "Visit → lead",
      value: conversion === null ? "—" : `${conversion.toFixed(conversion < 1 ? 2 : 1)}%`,
      hint: "Leads ÷ visitors",
    },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Analytics</h1>
          <p>Who visited, what they read, where they came from, and how many became leads.</p>
        </div>
        <div className="cc-tabs" role="group" aria-label="Date range" style={{ marginLeft: "auto", borderBottom: 0 }}>
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <Link
              key={k}
              href={`/admin/intelligence?range=${k}`}
              className={`cc-tab ${k === range ? "is-on" : ""}`}
              aria-current={k === range ? "page" : undefined}
            >
              Last {RANGES[k]} days
            </Link>
          ))}
        </div>
      </div>

      <div className="cc-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cc-kpi">
            <div className="cc-kpi-top">
              <span className="cc-kpi-label">{k.label}</span>
            </div>
            <span className="cc-kpi-value">{k.value}</span>
            <div className="cc-kpi-foot">
              <span>{k.hint}</span>
            </div>
          </div>
        ))}
      </div>

      {!trafficOk ? <TrafficSetup status={traffic.status} /> : null}

      <div className="cc-board" style={{ marginTop: 16 }}>
        <Panel title="Page views per day" sub={`Last ${nDays} days`} icon={<IconChart size={15} />} className="cc-s6">
          {trafficOk && daily ? (
            <MiniBars
              points={dailyViews}
              labelLeft={shortDay(days[0])}
              labelRight={shortDay(days[days.length - 1])}
              format={(v, k) => `${shortDay(k)}: ${fmt(v)} views`}
            />
          ) : (
            <EmptyState title="No traffic data yet" text="Fills in once Vercel Web Analytics is connected." />
          )}
        </Panel>

        <Panel title="Leads per day" sub={`Last ${nDays} days`} icon={<IconFunnel size={15} />} className="cc-s6" action={{ href: "/admin/leads", label: "Leads" }}>
          {leads ? (
            <MiniBars
              points={dailyLeads}
              labelLeft={shortDay(days[0])}
              labelRight={shortDay(days[days.length - 1])}
              format={(v, k) => `${shortDay(k)}: ${fmt(v)} leads`}
            />
          ) : (
            <ErrorState message={leadsResult.ok ? "" : leadsResult.error} />
          )}
        </Panel>

        <RowsPanel title="Top pages" icon={<IconFile size={15} />} part={traffic.pages} ok={trafficOk} total={tot?.pageviews} />
        <RowsPanel
          title="Field Notes articles"
          icon={<IconFile size={15} />}
          part={traffic.articles}
          ok={trafficOk}
          total={blogTot?.pageviews}
          label={(k) => k.replace(/^\/blog\//, "")}
          action={{ href: "/admin/marketing/seo", label: "SEO" }}
        />
        <RowsPanel title="Where visitors come from" sub="Referring sites" icon={<IconGlobe size={15} />} part={traffic.referrers} ok={trafficOk} total={tot?.pageviews} label={(k) => (k === "(none)" ? "Direct / unknown" : k)} />

        <LeadRowsPanel title="Leads by source" rows={leads?.bySource} total={leads?.total ?? 0} ok={Boolean(leads)} />
        <LeadRowsPanel title="Leads by landing page" sub="Page or article that sent them" rows={leads?.byLanding} total={leads?.total ?? 0} ok={Boolean(leads)} />
        <LeadRowsPanel title="Leads by campaign" sub="utm_source / utm_campaign" rows={leads?.byUtm} total={leads?.total ?? 0} ok={Boolean(leads)} label={(k) => (k === "(none)" ? "No UTM tag" : k)} />
        <LeadRowsPanel title="Lead status" rows={leads?.byStatus} total={leads?.total ?? 0} ok={Boolean(leads)} />

        <RowsPanel title="Countries" icon={<IconGlobe size={15} />} part={traffic.countries} ok={trafficOk} total={tot?.pageviews} />
        <RowsPanel title="Devices" icon={<IconUsers size={15} />} part={traffic.devices} ok={trafficOk} total={tot?.pageviews} />
      </div>
    </>
  );
}

function RowsPanel({
  title,
  sub,
  icon,
  part: result,
  ok,
  total,
  label,
  action,
}: {
  title: string;
  sub?: string;
  icon: React.ReactNode;
  part?: Part<Row[]>;
  ok: boolean;
  total?: number;
  label?: (k: string) => string;
  action?: { href: string; label: string };
}) {
  const rows = result && result.ok ? result.data : undefined;
  return (
    <Panel title={title} sub={sub} icon={icon} className="cc-s6" action={action}>
      {!ok ? (
        <EmptyState title="No traffic data yet" text="Fills in once Vercel Web Analytics is connected." />
      ) : result && !result.ok ? (
        <ErrorState message={result.error} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="Nothing in this range" text="No page views matched yet." />
      ) : (
        <BarList rows={bars(rows.map((r) => ({ key: r.key, value: r.pageviews })), total ?? 0, label)} />
      )}
    </Panel>
  );
}

function LeadRowsPanel({
  title,
  sub,
  rows,
  total,
  ok,
  label,
}: {
  title: string;
  sub?: string;
  rows?: { key: string; count: number }[];
  total: number;
  ok: boolean;
  label?: (k: string) => string;
}) {
  return (
    <Panel title={title} sub={sub} icon={<IconFunnel size={15} />} className="cc-s6">
      {!ok ? (
        <ErrorState message="Could not load leads." />
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="No leads in this range" text="New leads from any form show up here." />
      ) : (
        <BarList rows={bars(rows.map((r) => ({ key: r.key, value: r.count })), total, label)} />
      )}
    </Panel>
  );
}

function TrafficSetup({ status }: { status: TrafficStatus }) {
  if (status.state === "error") {
    return (
      <section className="cc-panel" style={{ marginTop: 16 }}>
        <ErrorState message={status.message} />
      </section>
    );
  }
  return (
    <section className="cc-panel" style={{ marginTop: 16 }}>
      <div className="cc-panel-head">
        <IconChart size={15} />
        <h2>Connect website traffic</h2>
        <span className="cc-sub">{status.state === "no-token" ? "1 step left on this server" : "Web Analytics is off in Vercel"}</span>
      </div>
      <div className="cc-panel-body">
        <p className="cc-note" style={{ marginTop: 0 }}>
          Lead numbers below are live. Visitor and page-view panels fill in once these are done:
        </p>
        <ol className="cc-note" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>
            In Vercel, open the project → <strong>Analytics</strong> → <strong>Enable</strong> Web Analytics.
          </li>
          <li>
            Create a token: Vercel → Account Settings → <strong>Tokens</strong>, scoped to the team.
          </li>
          <li>
            Add it to the project as the environment variable <code>VERCEL_ANALYTICS_TOKEN</code> (Production), then
            redeploy.
          </li>
        </ol>
        <p className="cc-faint" style={{ marginBottom: 0 }}>
          The site already sends cookieless page views (no consent banner needed). Counts start from the day Web
          Analytics is enabled.
        </p>
      </div>
    </section>
  );
}
