import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LEAD_STATUSES, type Lead } from "@/lib/supabase/types";
import { scoreBand } from "@/lib/campaign/scoring";

export const dynamic = "force-dynamic";

/** Read the clock outside the component body — this page is force-dynamic and
 *  re-renders per request, so "30 days ago" is meant to move. */
function thirtyDaysAgoIso(): string {
  return new Date(Date.now() - 30 * 86400_000).toISOString();
}

export default async function AdminOverviewPage() {
  const supabase = await createSupabaseServerClient();

  const since = thirtyDaysAgoIso();

  const [{ data: recent }, { count: total }, { count: last30 }] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
  ]);

  const leads = (recent ?? []) as Lead[];

  const { data: statusRows } = await supabase.from("leads").select("lead_status");
  const counts = new Map<string, number>();
  for (const row of statusRows ?? []) {
    counts.set(row.lead_status, (counts.get(row.lead_status) ?? 0) + 1);
  }

  return (
    <>
      <header className="ad-head">
        <h1>Overview</h1>
        <p>Everything coming in, and where it is in the pipeline.</p>
      </header>

      <div className="ad-kpis">
        <div className="ad-kpi">
          <span className="ad-kpi-label">Leads · all time</span>
          <span className="ad-kpi-value">{total ?? 0}</span>
        </div>
        <div className="ad-kpi">
          <span className="ad-kpi-label">Leads · last 30 days</span>
          <span className="ad-kpi-value">{last30 ?? 0}</span>
        </div>
        <div className="ad-kpi">
          <span className="ad-kpi-label">New, untouched</span>
          <span className="ad-kpi-value">{counts.get("New") ?? 0}</span>
        </div>
        <div className="ad-kpi">
          <span className="ad-kpi-label">Won</span>
          <span className="ad-kpi-value">{counts.get("Won") ?? 0}</span>
        </div>
      </div>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Pipeline</h2>
          <Link href="/admin/leads" className="ad-link">
            Open the full pipeline →
          </Link>
        </div>
        <div className="ad-stage-row">
          {LEAD_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/leads?status=${encodeURIComponent(s)}`}
              className="ad-stage"
            >
              <span className="ad-stage-n">{counts.get(s) ?? 0}</span>
              <span className="ad-stage-label">{s}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Latest leads</h2>
        </div>
        {leads.length === 0 ? (
          <p className="ad-empty">
            No leads yet. They&rsquo;ll appear here the moment the first form
            comes in.
          </p>
        ) : (
          <div className="ad-table-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Business</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/admin/leads/${l.id}`} className="ad-link">
                        {l.first_name} {l.last_name}
                      </Link>
                    </td>
                    <td>{l.business_name ?? "—"}</td>
                    <td>
                      <span className={`ad-score t-${scoreBand(l.lead_score).tone}`}>
                        {l.lead_score}
                      </span>
                    </td>
                    <td>{l.lead_status}</td>
                    <td>{l.source}</td>
                    <td>{new Date(l.created_at).toLocaleDateString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
