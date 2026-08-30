import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSocial } from "@/lib/dashboard/social";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { IconShare, IconSpark } from "../Icons";
import { clockTime, compact } from "../format";

/**
 * Section 6 — the social command centre.
 *
 * Numbers appear only for channels a row in social_accounts says are
 * connected, and "—" is used for a connected channel that has never synced.
 * A plausible-looking follower count for an account nobody linked would make
 * every other number on this dashboard less believable.
 */

export default async function SocialPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("social", () => loadSocial(supabase));

  if (!result.ok) {
    return (
      <Panel title="Social" icon={<IconShare size={15} />} className={className} bodyClass="flush">
        <ErrorState message={result.error} />
      </Panel>
    );
  }

  const s = result.data;

  return (
    <Panel
      title="Social command center"
      icon={<IconShare size={15} />}
      sub={
        s.connectedCount === 0
          ? "no channels connected"
          : `${s.connectedCount} connected · ${compact(s.totalFollowers)} followers`
      }
      action={{ href: "/admin/marketing/social", label: "Social Center" }}
      className={className}
      bodyClass="tight"
      footer={
        <>
          <Link href="/admin/marketing/social" className="cc-cta">
            Create post
          </Link>
          <Link href="/admin/marketing/content" className="cc-btn">
            <IconSpark size={13} /> AI create content
          </Link>
          {s.scheduledCount > 0 ? (
            <span className="cc-faint" style={{ fontSize: "0.72rem", marginLeft: "auto" }}>
              {s.scheduledCount} scheduled
            </span>
          ) : null}
        </>
      }
    >
      {s.connectedCount === 0 ? (
        <EmptyState
          title="No channels connected"
          text="Facebook, Instagram, LinkedIn, TikTok, YouTube and Google Business each need connecting before followers, reach or engagement can be shown. Nothing is estimated in the meantime."
          cta={{ href: "/admin/system/integrations", label: "Connect a channel" }}
          icon={<IconShare size={17} />}
        />
      ) : (
        <div className="cc-channels">
          {s.channels.map((c) => (
            <div key={c.platform} className={`cc-channel ${c.connected ? "" : "is-off"}`}>
              <div className="cc-channel-top">
                <span className={`cc-dot s-${c.status === "connected" ? "operational" : c.status === "disconnected" ? "disconnected" : c.status === "expired" ? "warning" : "error"}`} />
                <span className="cc-channel-name">{c.label}</span>
              </div>
              <div className={`cc-channel-n ${c.followers === null ? "is-none" : ""}`}>
                {c.followers === null ? (c.connected ? "syncing" : "not linked") : compact(c.followers)}
              </div>
              <div className="cc-channel-sub">
                {c.connected
                  ? c.awaitingSync
                    ? "no stats yet"
                    : `${compact(c.reach)} reach · ${compact(c.leads)} leads`
                  : "connect to see numbers"}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 13, borderTop: "1px solid var(--cc-line-soft)" }}>
        <div className="cc-pop-head" style={{ padding: "0 0 8px" }}>
          Today&rsquo;s content
          {s.awaitingApproval > 0 ? ` · ${s.awaitingApproval} awaiting approval` : ""}
        </div>

        {s.todaysPosts.length === 0 ? (
          <p className="cc-faint" style={{ fontSize: "0.76rem", lineHeight: 1.55 }}>
            Nothing scheduled for today. Posts created in Quick Add appear here
            and on the Today card.
          </p>
        ) : (
          <div className="cc-feed" style={{ margin: "0 -16px" }}>
            {s.todaysPosts.map((p) => (
              <div key={p.id} className="cc-feed-item">
                <span className="cc-feed-icon m-social">
                  <IconShare size={13} />
                </span>
                <span className="cc-feed-main">
                  <span className="cc-feed-title">{p.platformLabel}</span>
                  <span className="cc-feed-sub">{p.preview || "(no text)"}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                  {p.generatedByAi ? <span className="cc-chip t-info">AI</span> : null}
                  <span className={`cc-chip ${p.needsApproval ? "t-warn" : p.status === "published" ? "t-ok" : "t-muted"}`}>
                    {p.needsApproval ? "needs approval" : p.status}
                  </span>
                  <span className="cc-feed-when">{clockTime(p.scheduledAt)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
