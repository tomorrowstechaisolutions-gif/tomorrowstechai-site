import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMarketing } from "@/lib/dashboard/marketing";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { IconMegaphone, IconSpark } from "../Icons";
import { count, money, multiple, pct } from "../format";

/** Section 8 — marketing performance, on the campaign dashboard's own maths. */

export default async function MarketingPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("marketing", () => loadMarketing(supabase));

  if (!result.ok) {
    return (
      <Panel title="Marketing" icon={<IconMegaphone size={15} />} className={className} bodyClass="flush">
        <ErrorState message={result.error} />
      </Panel>
    );
  }

  const { metrics: m, campaigns, noSpend } = result.data;

  // The one recommendation the data can support on its own. Anything more
  // interpretive belongs to the advisor, which can be asked and can hedge.
  const cheapest = campaigns
    .filter((c) => c.costPerLeadCents !== null && c.leads >= 3)
    .sort((a, b) => (a.costPerLeadCents ?? 0) - (b.costPerLeadCents ?? 0))[0];

  return (
    <Panel
      title="Marketing performance"
      icon={<IconMegaphone size={15} />}
      sub="This month"
      action={{ href: "/admin/marketing/campaigns/business-launch", label: "Campaigns" }}
      className={className}
      bodyClass="flush"
    >
      {noSpend && campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns running"
          text="Ad spend is entered by hand in Ad spend, and leads attribute themselves from the UTMs on the landing page. Both feed this card."
          cta={{ href: "/admin/marketing/spend", label: "Record ad spend" }}
          icon={<IconMegaphone size={17} />}
        />
      ) : (
        <>
          <div className="cc-stats">
            <div className="cc-stat">
              <div className="cc-stat-label">Ad spend</div>
              <div className="cc-stat-value">{money(Math.round(m.adSpend * 100))}</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Leads</div>
              <div className="cc-stat-value">{count(m.leads)}</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Cost per lead</div>
              <div className={`cc-stat-value ${m.costPerLead === null ? "t-none" : ""}`}>
                {m.costPerLead === null ? "—" : money(Math.round(m.costPerLead * 100), { cents: true })}
              </div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Landing conv.</div>
              <div className={`cc-stat-value ${m.landingPageConversionRate === null ? "t-none" : ""}`}>
                {pct(m.landingPageConversionRate, 1)}
              </div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Revenue</div>
              <div className="cc-stat-value">{money(Math.round(m.revenue * 100))}</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">ROAS</div>
              <div className={`cc-stat-value ${m.roas === null ? "t-none" : m.roas >= 1 ? "t-ok" : "t-risk"}`}>
                {multiple(m.roas)}
              </div>
            </div>
          </div>

          {campaigns.length > 0 ? (
            <div className="cc-scroll">
              <table className="cc-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Platform</th>
                    <th className="num">Spend</th>
                    <th className="num">Leads</th>
                    <th className="num">Revenue</th>
                    <th className="num">CPL</th>
                    <th className="num">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 6).map((c) => (
                    <tr key={c.campaign}>
                      <td className="cc-strong">{c.campaign}</td>
                      <td>{c.platform}</td>
                      <td className="num">{money(c.spendCents)}</td>
                      <td className="num">{count(c.leads)}</td>
                      <td className="num">{c.revenueCents > 0 ? money(c.revenueCents) : "—"}</td>
                      <td className="num">
                        {c.costPerLeadCents === null ? "—" : money(Math.round(c.costPerLeadCents), { cents: true })}
                      </td>
                      <td className="num">{multiple(c.roas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {cheapest ? (
            <div className="cc-panel-body tight">
              <div className="cc-insight k-marketing">
                <span className="cc-insight-rail" />
                <div className="cc-insight-body">
                  <span className="cc-insight-kind">
                    <IconSpark size={10} style={{ display: "inline", verticalAlign: -1 }} /> Recommendation
                  </span>
                  <div className="cc-insight-title">
                    {cheapest.campaign} is buying leads cheapest at{" "}
                    {money(Math.round(cheapest.costPerLeadCents!), { cents: true })} each
                  </div>
                  <p className="cc-insight-text">
                    Across {cheapest.leads} leads this month. Ask the advisor
                    before shifting budget — cost per lead is not the same as
                    cost per customer.
                  </p>
                </div>
              </div>
            </div>
          ) : campaigns.length > 0 ? (
            <p className="cc-note" style={{ padding: "0 16px 14px" }}>
              Not enough leads per campaign yet to say which is buying them
              cheapest. Three per campaign is the threshold.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}
