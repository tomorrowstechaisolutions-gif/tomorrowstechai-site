import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CAMPAIGN_NAME } from "@/lib/campaign/config";
import { fmtMoney, fmtNumber } from "@/lib/campaign/metrics";
import { localDate } from "@/lib/campaign/range";
import type { CampaignSpend } from "@/lib/supabase/types";
import { deleteSpend, upsertSpend } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function SpendPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("campaign_spend")
    .select("*")
    .order("date", { ascending: false })
    .limit(120);

  const rows = (data ?? []) as CampaignSpend[];
  const today = localDate(new Date());

  return (
    <>
      <header className="ad-head">
        <h1>Ad spend</h1>
        <p>
          Copy the day&rsquo;s numbers out of Meta Ads Manager. Same date and
          same breakdown overwrites the existing row, so re-entering a day
          can&rsquo;t double-count it.
        </p>
      </header>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Add or update a day</h2>
        </div>
        <form action={upsertSpend} className="ad-grid-form">
          <label className="ad-field">
            <span className="ad-label">Date</span>
            <input name="date" type="date" defaultValue={today} required className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Campaign</span>
            <input name="campaign" defaultValue={CAMPAIGN_NAME} className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Ad set (optional)</span>
            <input name="adset" className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Ad (optional)</span>
            <input name="ad" className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Placement (optional)</span>
            <input name="placement" placeholder="facebook / instagram" className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Device (optional)</span>
            <select name="device" defaultValue="" className="ad-input">
              <option value="">All</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
              <option value="desktop">Desktop</option>
            </select>
          </label>
          <label className="ad-field">
            <span className="ad-label">Amount spent ($)</span>
            <input name="spend" inputMode="decimal" placeholder="5.00" className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Impressions</span>
            <input name="impressions" inputMode="numeric" className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Reach</span>
            <input name="reach" inputMode="numeric" className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Link clicks</span>
            <input name="clicks" inputMode="numeric" className="ad-input" />
          </label>
          <label className="ad-field">
            <span className="ad-label">Landing page views</span>
            <input name="landing_page_views" inputMode="numeric" className="ad-input" />
          </label>
          <div className="ad-field end">
            <button type="submit" className="ad-btn primary">
              Save day
            </button>
          </div>
        </form>
      </section>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Recorded days</h2>
        </div>
        {rows.length === 0 ? (
          <p className="ad-empty">Nothing recorded yet.</p>
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
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.campaign}</td>
                    <td>{r.adset || "—"}</td>
                    <td>{r.ad || "—"}</td>
                    <td>{r.placement || "—"}</td>
                    <td>{r.device || "—"}</td>
                    <td>{fmtMoney(r.spend_cents / 100)}</td>
                    <td>{fmtNumber(r.impressions)}</td>
                    <td>{fmtNumber(r.reach)}</td>
                    <td>{fmtNumber(r.clicks)}</td>
                    <td>{fmtNumber(r.landing_page_views)}</td>
                    <td>{r.source}</td>
                    <td>
                      <form action={deleteSpend}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="ad-btn ghost sm">
                          Delete
                        </button>
                      </form>
                    </td>
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
