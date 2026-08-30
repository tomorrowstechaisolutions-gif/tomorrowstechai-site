import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { todayPeriod } from "./period";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  type SocialAccount,
  type SocialPlatform,
  type SocialPost,
} from "@/lib/supabase/types";

/**
 * Section 6 — Social media command centre.
 *
 * A channel shows as live only when a row in social_accounts says it is
 * connected. Nothing here invents a follower count: a platform that has never
 * synced reports null, and the UI prints "—". A dashboard that shows plausible
 * social numbers for accounts nobody connected is worse than an empty card.
 */

export type ChannelStat = {
  platform: SocialPlatform;
  label: string;
  connected: boolean;
  status: SocialAccount["status"];
  handle: string | null;
  followers: number | null;
  reach: number | null;
  engagement: number | null;
  clicks: number | null;
  leads: number | null;
  statsUpdatedAt: string | null;
  /** True when connected but the stats have never come back. */
  awaitingSync: boolean;
};

export type ScheduledPost = {
  id: string;
  platform: SocialPlatform;
  platformLabel: string;
  preview: string;
  scheduledAt: string | null;
  status: SocialPost["status"];
  needsApproval: boolean;
  generatedByAi: boolean;
};

export type SocialSnapshot = {
  channels: ChannelStat[];
  connectedCount: number;
  todaysPosts: ScheduledPost[];
  scheduledCount: number;
  awaitingApproval: number;
  /** Totals across connected channels only, null when nothing has synced. */
  totalFollowers: number | null;
  totalReach: number | null;
  totalLeads: number | null;
};

const sumOrNull = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((t, v) => t + v, 0);
};

export async function loadSocial(sb: SupabaseClient): Promise<SocialSnapshot> {
  const day = todayPeriod();

  const [accounts, posts, scheduledCount] = await Promise.all([
    sb
      .from("social_accounts")
      .select("*")
      .then((r) => unwrap(r, "social accounts")),
    sb
      .from("social_posts")
      .select("id, platform, body, scheduled_at, status, generated_by")
      .in("status", ["scheduled", "needs_approval", "published"])
      .gte("scheduled_at", day.fromIso)
      .lt("scheduled_at", day.toIso)
      .order("scheduled_at", { ascending: true })
      .then((r) => unwrap(r, "today's posts")),
    sb
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .in("status", ["scheduled", "needs_approval"])
      .then((r) => r.count ?? 0),
  ]);

  const rows = accounts as SocialAccount[];
  const byPlatform = new Map<SocialPlatform, SocialAccount>();
  for (const a of rows) {
    // If two profiles exist for one platform, the connected one wins.
    const existing = byPlatform.get(a.platform);
    if (!existing || (a.connected && !existing.connected)) byPlatform.set(a.platform, a);
  }

  const channels: ChannelStat[] = SOCIAL_PLATFORMS.map((platform) => {
    const a = byPlatform.get(platform);
    return {
      platform,
      label: SOCIAL_PLATFORM_LABELS[platform],
      connected: a?.connected ?? false,
      status: a?.status ?? "disconnected",
      handle: a?.handle ?? null,
      followers: a?.followers ?? null,
      reach: a?.reach_30d ?? null,
      engagement: a?.engagement_30d ?? null,
      clicks: a?.clicks_30d ?? null,
      leads: a?.leads_30d ?? null,
      statsUpdatedAt: a?.stats_updated_at ?? null,
      awaitingSync: Boolean(a?.connected) && (a?.stats_updated_at ?? null) === null,
    };
  });

  const connected = channels.filter((c) => c.connected);

  const todaysPosts: ScheduledPost[] = (
    posts as Pick<
      SocialPost,
      "id" | "platform" | "body" | "scheduled_at" | "status" | "generated_by"
    >[]
  ).map((p) => ({
    id: p.id,
    platform: p.platform,
    platformLabel: SOCIAL_PLATFORM_LABELS[p.platform],
    preview: p.body.slice(0, 140),
    scheduledAt: p.scheduled_at,
    status: p.status,
    needsApproval: p.status === "needs_approval",
    generatedByAi: p.generated_by === "ai",
  }));

  return {
    channels,
    connectedCount: connected.length,
    todaysPosts,
    scheduledCount: scheduledCount as number,
    awaitingApproval: todaysPosts.filter((p) => p.needsApproval).length,
    totalFollowers: sumOrNull(connected.map((c) => c.followers)),
    totalReach: sumOrNull(connected.map((c) => c.reach)),
    totalLeads: sumOrNull(connected.map((c) => c.leads)),
  };
}
