import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadServicePerformance } from "@/lib/dashboard/services";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { IconLayers } from "../Icons";
import { count, money, pct } from "../format";

/** Section 10 — how each service line is doing. */

export default async function ServicesPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("services", () => loadServicePerformance(supabase));

  const active = result.ok
    ? result.data.filter((s) => s.leads > 0 || s.sales > 0)
    : [];

  return (
    <Panel
      title="Products & services"
      icon={<IconLayers size={15} />}
      sub="This month"
      action={{ href: "/admin/catalog", label: "Catalog" }}
      className={className}
      bodyClass="flush"
    >
      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : active.length === 0 ? (
        <EmptyState
          title="No service activity this month"
          text="Every line in the catalog is listed here as soon as it draws a lead or books revenue. Nothing is shown at zero to fill the table out."
          cta={{ href: "/admin/catalog", label: "Review the catalog" }}
          icon={<IconLayers size={17} />}
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Service</th>
                <th className="num">Leads</th>
                <th className="num">Sales</th>
                <th className="num">Revenue</th>
                <th className="num">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {active.map((s) => (
                <tr key={s.key}>
                  <td className="cc-strong">{s.label}</td>
                  <td className="num">{count(s.leads)}</td>
                  <td className="num">{count(s.sales)}</td>
                  <td className="num">{s.revenueCents > 0 ? money(s.revenueCents) : "—"}</td>
                  <td className="num">{pct(s.conversion, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
