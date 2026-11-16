import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getArticlePerformance } from "@/lib/blog/performance";
import { socialPostHref } from "@/lib/blog/social-draft";
import type { ArticleStatus } from "@/lib/blog/types";
import { SocialDraftButton } from "./SocialDraftButton";

/**
 * The editor's Performance tab (server-rendered, streamed in with Suspense so
 * the editor never waits on the analytics API).
 */

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });

const SOCIAL_TONE: Record<string, string> = {
  published: "t-ok",
  scheduled: "t-info",
  draft: "t-muted",
  failed: "t-risk",
  needs_approval: "t-warn",
  approved: "t-info",
  canceled: "t-muted",
};

export async function ArticlePerformance({
  id,
  slug,
  status,
  publishedAt,
}: {
  id: string;
  slug: string;
  status: ArticleStatus;
  publishedAt: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  const p = await getArticlePerformance(supabase, slug, publishedAt);
  const live = status === "published" || status === "scheduled";
  const peak = Math.max(1, ...p.daily.map((d) => d.pageviews));
  const refTotal = p.referrers.reduce((s, r) => s + r.pageviews, 0) || 1;

  return (
    <div className="be-perf">
      {status === "draft" ? <p className="be-help">This article is a draft. Numbers start once it is published.</p> : null}

      <h3 className="be-h">Traffic</h3>
      {p.traffic.state === "ok" ? (
        <>
          <div className="cc-stats">
            <div className="cc-stat">
              <div className="cc-stat-label">Views, 30 days</div>
              <div className="cc-stat-value">{fmt(p.last30?.pageviews ?? 0)}</div>
              <div className="cc-stat-hint">{fmt(p.last30?.visitors ?? 0)} visitors</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Views, {p.sinceLabel.toLowerCase()}</div>
              <div className="cc-stat-value">{fmt(p.sincePublished?.pageviews ?? 0)}</div>
              <div className="cc-stat-hint">{fmt(p.sincePublished?.visitors ?? 0)} visitors</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Leads</div>
              <div className="cc-stat-value">{fmt(p.leads.length)}</div>
              <div className="cc-stat-hint">
                {p.sincePublished?.visitors ? `${((p.leads.length / p.sincePublished.visitors) * 100).toFixed(1)}% of visitors` : "Landed on this article"}
              </div>
            </div>
          </div>

          <div className="be-spark" role="img" aria-label={`Daily views over the last 30 days, peak ${peak}`}>
            {p.daily.map((d) => (
              <span key={d.day} title={`${d.day}: ${d.pageviews} view${d.pageviews === 1 ? "" : "s"}`} style={{ height: `${Math.max(2, (d.pageviews / peak) * 100)}%` }} className={d.pageviews ? "" : "is-zero"} />
            ))}
          </div>
          <p className="be-help">Daily views, last 30 days (UTC days). Peak: {fmt(peak)}.</p>

          <div className="be-cols">
            <div>
              <h3 className="be-h">Where readers came from</h3>
              {p.referrers.length ? (
                <div className="cc-barlist">
                  {p.referrers.map((r) => (
                    <div className="cc-barrow" key={r.key}>
                      <span className="cc-barrow-label">{r.key === "(none)" ? "Direct / unknown" : r.key}</span>
                      <span className="cc-barrow-track">
                        <span className="cc-barrow-fill" style={{ width: `${(r.pageviews / refTotal) * 100}%` }} />
                      </span>
                      <span className="cc-barrow-value">{fmt(r.pageviews)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="be-help">No visits recorded yet.</p>
              )}
            </div>
            <div>
              <h3 className="be-h">Campaign sources (UTM)</h3>
              {p.campaigns.length ? (
                <div className="cc-barlist">
                  {p.campaigns.map((r) => (
                    <div className="cc-barrow" key={r.key}>
                      <span className="cc-barrow-label">{r.key}</span>
                      <span className="cc-barrow-track">
                        <span className="cc-barrow-fill" style={{ width: `${(r.pageviews / refTotal) * 100}%` }} />
                      </span>
                      <span className="cc-barrow-value">{fmt(r.pageviews)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="be-help">No tagged links yet. Shares from Social Center are tagged utm_source=social.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="be-help">
          {p.traffic.state === "no-token"
            ? "Traffic needs VERCEL_ANALYTICS_TOKEN (the same setting as the Analytics page)."
            : p.traffic.state === "not-enabled"
              ? "Vercel Web Analytics is not enabled for this project."
              : `Traffic is unavailable right now: ${p.traffic.message}`}{" "}
          Leads and social posts below still work.
        </p>
      )}

      <h3 className="be-h">Leads from this article</h3>
      {p.leads.length ? (
        <table className="cc-table be-perf-table">
          <thead>
            <tr><th>Lead</th><th>Status</th><th>Came in</th><th>Campaign</th></tr>
          </thead>
          <tbody>
            {p.leads.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/admin/leads/${l.id}`} className="cc-link">{l.name}</Link>
                  {l.business ? <span className="cc-faint"> · {l.business}</span> : null}
                </td>
                <td><span className="cc-chip">{l.status}</span></td>
                <td>{when(l.at)}</td>
                <td className="cc-faint">{l.utm ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="be-help">No leads have landed on this article yet. A lead counts here when its first page was this article.</p>
      )}

      <h3 className="be-h">Social posts</h3>
      {p.social.length ? (
        <ul className="be-social">
          {p.social.map((s) => (
            <li key={s.id}>
              <div>
                <Link href={socialPostHref(s.id)} className="cc-link">{s.title}</Link>
                <span className="cc-faint">
                  {s.platforms.join(", ")}
                  {s.at ? ` · ${when(s.at)}` : ""}
                </span>
              </div>
              <span className={`cc-chip ${SOCIAL_TONE[s.status] ?? "t-muted"}`}>{s.status.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="be-help">
          {live
            ? "No social post yet. Publishing creates a draft automatically; you can also make one now."
            : "When this article goes live, a draft post for LinkedIn, Facebook and Instagram is created in Social Center for you to review."}
        </p>
      )}
      {live && !p.social.length ? <SocialDraftButton id={id} /> : null}
    </div>
  );
}
