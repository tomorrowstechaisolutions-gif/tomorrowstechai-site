import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWeb } from "@/lib/dashboard/web";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import MiniBars from "../MiniBars";
import { IconGlobe } from "../Icons";
import { count, pct, shortDate } from "../format";

/**
 * Section 7 — website performance.
 *
 * Visitors and page views are absent because nothing on the server can read
 * GA4 or the Pixel back. The card says so once, plainly, and then shows what
 * IS measured: where leads came from and what they landed on.
 */

export default async function WebPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("web", () => loadWeb(supabase));

  if (!result.ok) {
    return (
      <Panel title="Website" icon={<IconGlobe size={15} />} className={className} bodyClass="flush">
        <ErrorState message={result.error} />
      </Panel>
    );
  }

  const w = result.data;

  return (
    <Panel
      title="Website performance"
      icon={<IconGlobe size={15} />}
      sub="This month"
      action={{ href: "/admin/intelligence", label: "Analytics" }}
      className={className}
      bodyClass="flush"
    >
      {w.leadsMonth === 0 && w.paidLandingViews === 0 ? (
        <EmptyState
          title="Nothing measured yet this month"
          text="Every lead records its landing page, referrer and UTMs, so this fills in with the first submission. Visitor counts need a server-side analytics connection."
          cta={{ href: "/admin/system/integrations", label: "Connect analytics" }}
          icon={<IconGlobe size={17} />}
        />
      ) : (
        <>
          <div className="cc-stats">
            <div className="cc-stat">
              <div className="cc-stat-label">Leads today</div>
              <div className="cc-stat-value">{count(w.leadsToday)}</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Leads this month</div>
              <div className="cc-stat-value">{count(w.leadsMonth)}</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Paid page views</div>
              <div className={`cc-stat-value ${w.paidLandingViews === 0 ? "t-none" : ""}`}>
                {w.paidLandingViews === 0 ? "—" : count(w.paidLandingViews)}
              </div>
              <div className="cc-stat-hint">reported by Meta</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Conversion</div>
              <div className={`cc-stat-value ${w.conversionRate === null ? "t-none" : ""}`}>
                {pct(w.conversionRate, 1)}
              </div>
              <div className="cc-stat-hint">of paid views</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Visitors</div>
              <div className="cc-stat-value t-none">not connected</div>
              <div className="cc-stat-hint">GA4 is browser-side</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Page views</div>
              <div className="cc-stat-value t-none">not connected</div>
              <div className="cc-stat-hint">needs a server feed</div>
            </div>
          </div>

          <div className="cc-panel-body tight">
            <MiniBars
              points={w.series.map((s) => ({ key: s.date, value: s.count }))}
              labelLeft={shortDate(`${w.series[0]?.date}T12:00:00Z`)}
              labelRight="Leads per day"
              format={(v, k) => `${shortDate(`${k}T12:00:00Z`)}: ${v} leads`}
            />

            <div className="cc-split" style={{ marginTop: 16 }}>
              <Rank title="Top landing pages" rows={w.topLandingPages} />
              <Rank title="Top lead sources" rows={w.topSources} />
            </div>

            {w.topServices.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <Rank title="Top services requested" rows={w.topServices} />
              </div>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}

function Rank({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; share: number | null }[];
}) {
  return (
    <div>
      <div className="cc-pop-head" style={{ padding: "0 0 7px" }}>{title}</div>
      {rows.length === 0 ? (
        <p className="cc-faint" style={{ fontSize: "0.75rem" }}>Nothing recorded yet.</p>
      ) : (
        <div className="cc-pipe">
          {rows.map((r) => (
            <div key={r.label} className="cc-pipe-row" style={{ padding: "6px 10px" }}>
              <span className="cc-pipe-fill" style={{ width: `${(r.share ?? 0) * 100}%` }} />
              <span className="cc-pipe-label" style={{ fontSize: "0.75rem" }}>{r.label}</span>
              <span className="cc-pipe-val">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
