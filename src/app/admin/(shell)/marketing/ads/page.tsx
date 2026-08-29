import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STATUS_TONE, buildDestinationUrl } from "@/lib/campaign/ads";
import type { AdCreative } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ad_creatives")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const ads = (data ?? []) as AdCreative[];
  const live = ads.filter((a) => a.status === "live").length;

  return (
    <>
      <header className="ad-head">
        <h1>Ad Studio</h1>
        <p>
          Every ad you run, kept so the next one starts from the last one that
          worked. Write copy from a brief, check it against Meta&rsquo;s limits, and
          copy the tracked URL straight into Ads Manager.
        </p>
      </header>

      <div className="ad-filters">
        <Link href="/admin/marketing/ads/new" className="ad-btn primary">
          New ad
        </Link>
        <span className="ad-muted" style={{ alignSelf: "center" }}>
          {ads.length} saved · {live} live
        </span>
      </div>

      <section className="ad-panel">
        {ads.length === 0 ? (
          <p className="ad-empty">
            Nothing saved yet. Start with <strong>New ad</strong> — describe who
            it&rsquo;s for and it&rsquo;ll write three versions to choose from.
          </p>
        ) : (
          <div className="ad-table-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Headline</th>
                  <th>Button</th>
                  <th>Campaign</th>
                  <th>Ad set</th>
                  <th>Written by</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/admin/marketing/ads/${a.id}`} className="ad-link">
                        {a.name}
                      </Link>
                    </td>
                    <td>
                      <span className={`ad-tag s-${STATUS_TONE[a.status]}`}>{a.status}</span>
                    </td>
                    <td>{a.headline || "—"}</td>
                    <td>{a.cta_label}</td>
                    <td>{a.campaign}</td>
                    <td>{a.adset || "—"}</td>
                    <td>{a.generated_by === "ai" ? "Claude" : "You"}</td>
                    <td>{new Date(a.created_at).toLocaleDateString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>How the tracking fits together</h2>
        </div>
        <p className="ad-note">
          Each ad&rsquo;s URL carries <code>utm_term={"{{ad.name}}"}</code>. Meta
          swaps in the ad&rsquo;s real name at delivery, the lead form stores it, and
          the ad-spend page uses the same name in its <em>Ad</em> column. Match those
          two and the campaign dashboard can show cost per lead for each ad
          separately. Mismatch them and everything collapses into one number.
        </p>
        <p className="ad-note">
          Default URL for this campaign:{" "}
          <code className="ad-break">{buildDestinationUrl({})}</code>
        </p>
      </section>
    </>
  );
}
