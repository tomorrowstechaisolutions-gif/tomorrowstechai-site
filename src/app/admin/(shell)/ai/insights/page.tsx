import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadInsights, type Insight } from "@/lib/dashboard/insights";
import { INSIGHT_MODEL } from "@/lib/insights/generate";
import { Panel, EmptyState, ErrorState } from "@/components/admin/cc/Panel";
import { IconAlert, IconClock, IconSpark } from "@/components/admin/cc/Icons";
import { generateInsightsAction, setInsightStatusAction } from "@/app/admin/insight-actions";
import fin from "@/components/admin/cc/finance/finance.module.css";
import styles from "@/components/admin/cc/finance/insights.module.css";
import type { AiInsight } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI insights" };

/**
 * AI insights. What's live now (rule checks + model insights, all of them,
 * not just the dashboard's top five), and the full history of model insights
 * including dismissed and expired ones, with the evidence each one cited.
 */

const KINDS = ["opportunity", "action", "marketing", "revenue", "risk", "system"] as const;
const STATUSES = { all: "All", new: "Open", seen: "Done", dismissed: "Dismissed", expired: "Expired" } as const;
type StatusFilter = keyof typeof STATUSES;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

type Row = AiInsight & { metric: { evidence?: string[] } | null; model: string | null; valid_until: string | null; generated_by: string; expired: boolean };

/** Past its valid_until. Worked out once per request, outside render. */
function markExpired(rows: Row[]): Row[] {
  const now = Date.now();
  return rows.map((r) => ({ ...r, expired: Boolean(r.valid_until && Date.parse(r.valid_until) < now) }));
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status: StatusFilter = typeof params.status === "string" && params.status in STATUSES ? (params.status as StatusFilter) : "all";
  const kind = typeof params.kind === "string" && (KINDS as readonly string[]).includes(params.kind) ? params.kind : null;

  const sb = await createSupabaseServerClient();
  let live: Insight[] = [];
  let history: Row[] = [];
  let error: string | null = null;
  try {
    const [l, h] = await Promise.all([
      loadInsights(sb, 50),
      sb.from("ai_insights").select("*").order("created_at", { ascending: false }).limit(300),
    ]);
    if (h.error) throw new Error(h.error.message);
    live = l;
    history = markExpired((h.data ?? []) as Row[]);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Insights could not be loaded.";
  }

  const expired = (r: Row) => r.expired;
  const shown = history.filter((r) => {
    if (kind && r.kind !== kind) return false;
    if (status === "all") return true;
    if (status === "expired") return expired(r) && r.status === "new";
    return r.status === status && !(status === "new" && expired(r));
  });
  const last = history[0]?.created_at ?? null;
  const q = (s: StatusFilter, k: string | null) => `/admin/ai/insights?${new URLSearchParams({ ...(s !== "all" ? { status: s } : {}), ...(k ? { kind: k } : {}) })}`;

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>AI insights</h1>
          <p>What the numbers say you should look at, and everything it has said before.</p>
        </div>
        <div className={styles.head}>
          <span className={styles.when}>{last ? `Last AI run ${when(last)} · runs every Monday` : "No AI run yet · runs every Monday"}</span>
          <form action={generateInsightsAction}><button className={styles.gen}>Generate now</button></form>
        </div>
      </div>
      {typeof params.notice === "string" ? <div className={fin.flashOk}>{params.notice}</div> : null}
      {typeof params.error === "string" ? <div className={fin.flashErr}>{params.error}</div> : null}

      {error ? <ErrorState message={error} /> : (
        <div className="cc-board">
          <Panel title="Live now" sub={live.length ? `${live.length} · the dashboard shows the top 5` : "Nothing live"} icon={<IconSpark size={15} />} className="cc-s8">
            {live.length ? (
              <div className="cc-insights">
                {live.map((i) => {
                  const dbId = i.id.startsWith("ai:") ? i.id.slice(3) : null;
                  const row = dbId ? history.find((h) => h.id === dbId) : null;
                  return <Card key={i.id} kind={i.kind} severity={i.severity} title={i.title} body={i.body} href={i.href} source={i.source} at={i.at} evidence={row?.metric?.evidence} id={dbId} status="new" />;
                })}
              </div>
            ) : (
              <EmptyState
                title="Nothing needs your attention"
                text="Rule checks stay quiet until there's enough data to say something honestly. Press Generate now for an AI read of the current numbers."
                icon={<IconSpark size={17} />}
              />
            )}
          </Panel>

          <Panel title="How this works" icon={<IconAlert size={15} />} className="cc-s4">
            <p className={fin.note} style={{ marginTop: 0 }}>
              <b>Rule checks</b> run live on every page load: best-converting lead source, leads waiting on contact, what people ask for, revenue moves, project dates. They&apos;re free and never stale.<br />
              <b>AI insights</b> come from {INSIGHT_MODEL()} reading a numbers-only snapshot: finance, MRR, subscriptions, expenses, leads, invoices and social. No contact details are sent. It must cite the figures it used, which you can open under each insight.<br />
              <b>It only recommends.</b> Nothing here changes a lead, invoice or setting. AI insights expire after 8 days and the same point isn&apos;t repeated within two weeks.<br />
              <b>Cost:</b> about a cent or two per run, every Monday plus any time you press Generate now.
            </p>
          </Panel>

          <Panel title="History" sub={`${shown.length} of ${history.length}`} icon={<IconClock size={15} />} className="cc-s12">
            <div className={styles.filters}>
              {(Object.keys(STATUSES) as StatusFilter[]).map((s) => <Link key={s} href={q(s, kind)} className={`${styles.chip} ${s === status ? styles.on : ""}`}>{STATUSES[s]}</Link>)}
              <span style={{ width: 8 }} />
              <Link href={q(status, null)} className={`${styles.chip} ${!kind ? styles.on : ""}`}>Every kind</Link>
              {KINDS.map((k) => <Link key={k} href={q(status, k)} className={`${styles.chip} ${k === kind ? styles.on : ""}`}>{k}</Link>)}
            </div>
            {shown.length ? (
              <div className="cc-insights">
                {shown.map((r) => (
                  <Card key={r.id} kind={r.kind} severity={r.severity} title={r.title} body={r.body} href={r.href} source="ai" at={r.created_at} evidence={r.metric?.evidence} id={r.id} status={expired(r) && r.status === "new" ? "expired" : r.status} model={r.model} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={history.length ? "Nothing matches these filters" : "No AI insights yet"}
                text={history.length ? "Try All or Every kind." : "The first batch arrives Monday morning, or press Generate now."}
                icon={<IconClock size={17} />}
              />
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

function Card(p: {
  kind: string; severity: string; title: string; body: string; href: string | null; source: "rule" | "ai"; at: string;
  evidence?: string[]; id: string | null; status: string; model?: string | null;
}) {
  const faded = p.status === "dismissed" || p.status === "expired" || p.status === "seen";
  return (
    <div className={`cc-insight k-${p.kind} ${styles.card} ${faded ? styles.dim : ""}`}>
      <span className="cc-insight-rail" />
      <div className="cc-insight-body">
        <span className="cc-insight-kind">{p.kind}</span>
        <div className="cc-insight-title">{p.title}</div>
        <p className="cc-insight-text">{p.body}</p>
        <div className={styles.meta}>
          <span className={`${styles.sev} ${styles[p.severity] ?? ""}`}>{p.severity}</span>
          <span>{p.source === "rule" ? <span className={styles.ruleTag}>rule check</span> : `AI${p.model ? ` · ${p.model}` : ""}`}</span>
          {p.source === "ai" ? <span>{when(p.at)}</span> : null}
          {p.status !== "new" ? <span>· {p.status === "seen" ? "done" : p.status}</span> : null}
        </div>
        {p.evidence?.length ? (
          <details className={styles.evidence}>
            <summary>Numbers it used</summary>
            <ul>{p.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </details>
        ) : null}
        <div className={styles.row}>
          {p.href ? <Link href={p.href} className={styles.open}>Open →</Link> : null}
          {p.id ? (
            p.status === "new" ? (
              <>
                <StatusButton id={p.id} status="seen" label="Done" />
                <StatusButton id={p.id} status="dismissed" label="Dismiss" />
              </>
            ) : p.status !== "expired" ? <StatusButton id={p.id} status="new" label="Restore" /> : null
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setInsightStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={styles.btn}>{label}</button>
    </form>
  );
}
