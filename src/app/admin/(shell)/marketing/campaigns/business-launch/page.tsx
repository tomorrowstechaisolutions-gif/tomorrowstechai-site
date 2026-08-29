import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeMetrics,
  fmtMoney,
  fmtMultiple,
  fmtNumber,
  fmtPercent,
} from "@/lib/campaign/metrics";
import {
  RANGE_PRESETS,
  deviceFromUserAgent,
  inRange,
  resolveRange,
} from "@/lib/campaign/range";
import { CAMPAIGN_NAME } from "@/lib/campaign/config";
import type {
  Appointment,
  CampaignSpend,
  Lead,
  RevenueEvent,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type Search = {
  range?: string;
  from?: string;
  to?: string;
  campaign?: string;
  ad?: string;
  placement?: string;
  device?: string;
  source?: string;
};

export default async function BusinessLaunchDashboard({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to);
  const supabase = await createSupabaseServerClient();

  const [{ data: spendRows }, { data: leadRows }, { data: apptRows }, { data: revenueRows }] =
    await Promise.all([
      supabase
        .from("campaign_spend")
        .select("*")
        .gte("date", range.fromDate)
        .lte("date", range.toDate)
        .order("date", { ascending: false }),
      supabase
        .from("leads")
        .select("*")
        .gte("created_at", range.fromTs)
        .lt("created_at", range.toTs),
      supabase
        .from("appointments")
        .select("*")
        .gte("created_at", range.fromTs)
        .lt("created_at", range.toTs),
      supabase
        .from("revenue_events")
        .select("*")
        .gte("occurred_at", range.fromTs)
        .lt("occurred_at", range.toTs),
    ]);

  let spend = (spendRows ?? []) as CampaignSpend[];
  let leads = ((leadRows ?? []) as Lead[]).filter((l) => inRange(l.created_at, range));
  const revenue = ((revenueRows ?? []) as RevenueEvent[]).filter((r) =>
    inRange(r.occurred_at, range)
  );

  // ── Segment filters ─────────────────────────────────────────────────────
  if (sp.campaign) {
    spend = spend.filter((s) => s.campaign === sp.campaign);
    leads = leads.filter(
      (l) => l.campaign === sp.campaign || l.utm_campaign === sp.campaign
    );
  }
  if (sp.ad) {
    spend = spend.filter((s) => s.ad === sp.ad);
    leads = leads.filter((l) => l.ad === sp.ad);
  }
  if (sp.placement) {
    spend = spend.filter((s) => s.placement === sp.placement);
    leads = leads.filter((l) => l.placement === sp.placement);
  }
  if (sp.device) {
    spend = spend.filter((s) => s.device === sp.device);
    leads = leads.filter((l) => deviceFromUserAgent(l.user_agent) === sp.device);
  }
  if (sp.source) {
    leads = leads.filter((l) => l.source === sp.source);
  }

  const leadIds = new Set(leads.map((l) => l.id));
  const appointments = ((apptRows ?? []) as Appointment[]).filter(
    (a) => !a.lead_id || leadIds.has(a.lead_id)
  );
  const scopedRevenue = revenue.filter((r) => !r.lead_id || leadIds.has(r.lead_id));

  const m = computeMetrics({
    spend,
    leads,
    appointments,
    revenue: scopedRevenue,
  });

  // Filter option lists, drawn from the data that exists.
  const campaigns = Array.from(
    new Set([...(spendRows ?? []).map((s) => s.campaign), CAMPAIGN_NAME])
  ).filter(Boolean);
  const ads = Array.from(new Set((spendRows ?? []).map((s) => s.ad).filter(Boolean)));
  const placements = Array.from(
    new Set((spendRows ?? []).map((s) => s.placement).filter(Boolean))
  );

  const hasSpend = spend.length > 0;

  return (
    <>
      <header className="ad-head">
        <h1>{CAMPAIGN_NAME}</h1>
        <p>
          {range.label} · {range.fromDate} to {range.toDate}. Spend is entered by
          hand on the{" "}
          <Link href="/admin/marketing/spend" className="ad-link">
            Ad spend
          </Link>{" "}
          page until the Meta Marketing API is connected.
        </p>
      </header>

      <form className="ad-filters" method="get">
        <select name="range" defaultValue={range.key} className="ad-input">
          {RANGE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          name="from"
          type="date"
          defaultValue={sp.from ?? range.fromDate}
          className="ad-input"
          aria-label="Custom range start"
        />
        <input
          name="to"
          type="date"
          defaultValue={sp.to ?? range.toDate}
          className="ad-input"
          aria-label="Custom range end"
        />
        <select name="campaign" defaultValue={sp.campaign ?? ""} className="ad-input">
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="ad" defaultValue={sp.ad ?? ""} className="ad-input">
          <option value="">All ads</option>
          {ads.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select name="placement" defaultValue={sp.placement ?? ""} className="ad-input">
          <option value="">All placements</option>
          {placements.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select name="device" defaultValue={sp.device ?? ""} className="ad-input">
          <option value="">All devices</option>
          <option value="mobile">Mobile</option>
          <option value="tablet">Tablet</option>
          <option value="desktop">Desktop</option>
        </select>
        <select name="source" defaultValue={sp.source ?? ""} className="ad-input">
          <option value="">All lead sources</option>
          <option value="website">Website</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
        </select>
        <button type="submit" className="ad-btn primary">
          Apply
        </button>
        <Link href="/admin/marketing/campaigns/business-launch" className="ad-btn ghost">
          Reset
        </Link>
      </form>

      {!hasSpend && (
        <p className="ad-callout">
          No ad spend recorded for this range, so cost-per-lead, CAC and ROAS
          read &ldquo;—&rdquo; rather than a misleading zero. Add spend on the{" "}
          <Link href="/admin/marketing/spend" className="ad-link">
            Ad spend
          </Link>{" "}
          page.
        </p>
      )}

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Volume</h2>
        </div>
        <div className="ad-kpis">
          <Kpi label="Ad spend" value={fmtMoney(m.adSpend)} />
          <Kpi label="Impressions" value={fmtNumber(m.impressions)} />
          <Kpi label="Reach" value={fmtNumber(m.reach)} />
          <Kpi label="Clicks" value={fmtNumber(m.clicks)} />
          <Kpi label="Landing page views" value={fmtNumber(m.landingPageViews)} />
          <Kpi label="Leads" value={fmtNumber(m.leads)} />
          <Kpi label="Qualified leads" value={fmtNumber(m.qualifiedLeads)} />
          <Kpi label="Appointments" value={fmtNumber(m.appointments)} />
          <Kpi label="Sales" value={fmtNumber(m.sales)} />
          <Kpi label="Revenue" value={fmtMoney(m.revenue)} />
        </div>
      </section>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Efficiency</h2>
        </div>
        <div className="ad-kpis">
          <Kpi label="CTR" value={fmtPercent(m.ctr)} hint="clicks ÷ impressions" />
          <Kpi label="CPC" value={fmtMoney(m.cpc)} hint="spend ÷ clicks" />
          <Kpi
            label="Landing page conv."
            value={fmtPercent(m.landingPageConversionRate)}
            hint="leads ÷ landing page views"
          />
          <Kpi label="Cost per lead" value={fmtMoney(m.costPerLead)} hint="spend ÷ leads" />
          <Kpi
            label="Lead → appointment"
            value={fmtPercent(m.leadToAppointmentRate)}
            hint="appointments ÷ leads"
          />
          <Kpi
            label="Appointment → sale"
            value={fmtPercent(m.appointmentToSaleRate)}
            hint="sales ÷ appointments"
          />
          <Kpi
            label="CAC"
            value={fmtMoney(m.customerAcquisitionCost)}
            hint="spend ÷ sales"
          />
          <Kpi
            label="ROAS"
            value={fmtMultiple(m.roas)}
            hint="revenue ÷ spend"
            emphasis
          />
        </div>
      </section>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Where the money comes from</h2>
        </div>
        <div className="ad-kpis">
          <Kpi label="Initial revenue" value={fmtMoney(m.initialRevenue)} />
          <Kpi label="Recurring revenue" value={fmtMoney(m.recurringRevenue)} />
          <Kpi label="Upsell revenue" value={fmtMoney(m.upsellRevenue)} />
          <Kpi label="Lifetime revenue in range" value={fmtMoney(m.revenue)} />
        </div>
        <p className="ad-note">
          Revenue counts only what&rsquo;s attached to a lead inside this range,
          so ROAS reflects this campaign rather than the whole business.
        </p>
      </section>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Spend rows in range</h2>
          <Link href="/admin/marketing/spend" className="ad-link">
            Edit ad spend →
          </Link>
        </div>
        {spend.length === 0 ? (
          <p className="ad-empty">No rows.</p>
        ) : (
          <div className="ad-table-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Campaign</th>
                  <th>Ad set</th>
                  <th>Ad</th>
                  <th>Placement</th>
                  <th>Device</th>
                  <th>Spend</th>
                  <th>Impr.</th>
                  <th>Reach</th>
                  <th>Clicks</th>
                  <th>LPV</th>
                </tr>
              </thead>
              <tbody>
                {spend.map((s) => (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{s.campaign}</td>
                    <td>{s.adset || "—"}</td>
                    <td>{s.ad || "—"}</td>
                    <td>{s.placement || "—"}</td>
                    <td>{s.device || "—"}</td>
                    <td>{fmtMoney(s.spend_cents / 100)}</td>
                    <td>{fmtNumber(s.impressions)}</td>
                    <td>{fmtNumber(s.reach)}</td>
                    <td>{fmtNumber(s.clicks)}</td>
                    <td>{fmtNumber(s.landing_page_views)}</td>
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

function Kpi({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`ad-kpi ${emphasis ? "is-emph" : ""}`}>
      <span className="ad-kpi-label">{label}</span>
      <span className="ad-kpi-value">{value}</span>
      {hint && <span className="ad-kpi-hint">{hint}</span>}
    </div>
  );
}
