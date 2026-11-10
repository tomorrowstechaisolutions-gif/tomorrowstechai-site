import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SocialAuthError, markAccountExpired, readAccountToken } from "./accounts";
import { metaGet } from "./providers/meta";
import type { SocialMediaItem } from "./types";

/**
 * Keeps each connected account's public face current: avatar, cover, follower
 * count, link to the live page and the latest posts as thumbnails.
 *
 * Facebook/Instagram CDN URLs are signed and expire within days, so this runs
 * on a schedule (from the social-publish cron, for accounts older than
 * `staleHours`) and on demand from the Refresh button. Read-only: it never
 * posts anything. LinkedIn's member scopes are write-only, so LinkedIn keeps
 * the name and photo captured at connect time.
 */

type AccountRow = { id: string; platform: string; external_id: string | null; handle: string | null };

const MEDIA_LIMIT = 6;

async function syncFacebook(account: AccountRow, token: string) {
  const page = await metaGet<{
    link?: string; username?: string; fan_count?: number; followers_count?: number;
    picture?: { data?: { url?: string } }; cover?: { source?: string };
  }>(`/${account.external_id}`, { fields: "link,username,fan_count,followers_count,picture.type(large){url},cover{source}", access_token: token });

  const posts = await metaGet<{ data?: Array<{ id: string; message?: string; full_picture?: string; permalink_url?: string; created_time?: string }> }>(
    `/${account.external_id}/posts`,
    { fields: "id,message,full_picture,permalink_url,created_time", limit: String(MEDIA_LIMIT), access_token: token },
  ).catch(() => ({ data: [] }));

  const media: SocialMediaItem[] = (posts.data ?? []).map((post) => ({
    id: post.id,
    image: post.full_picture ?? null,
    url: post.permalink_url ?? `https://www.facebook.com/${post.id}`,
    caption: post.message?.slice(0, 160) ?? null,
    at: post.created_time ?? null,
    type: post.full_picture ? "image" : "text",
  }));

  return {
    followers: page.followers_count ?? page.fan_count ?? null,
    profile_image_url: page.picture?.data?.url ?? null,
    cover_image_url: page.cover?.source ?? null,
    profile_url: page.link ?? (page.username ? `https://www.facebook.com/${page.username}` : `https://www.facebook.com/${account.external_id}`),
    media_count: null,
    recent_media: media,
  };
}

async function syncInstagram(account: AccountRow, token: string) {
  const profile = await metaGet<{ username?: string; followers_count?: number; media_count?: number; profile_picture_url?: string }>(
    `/${account.external_id}`,
    { fields: "username,followers_count,media_count,profile_picture_url", access_token: token },
  );
  const items = await metaGet<{ data?: Array<{ id: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; caption?: string; timestamp?: string }> }>(
    `/${account.external_id}/media`,
    { fields: "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp", limit: String(MEDIA_LIMIT), access_token: token },
  ).catch(() => ({ data: [] }));

  const media: SocialMediaItem[] = (items.data ?? []).map((item) => ({
    id: item.id,
    image: item.media_type === "VIDEO" ? item.thumbnail_url ?? null : item.media_url ?? null,
    url: item.permalink ?? null,
    caption: item.caption?.slice(0, 160) ?? null,
    at: item.timestamp ?? null,
    type: item.media_type === "VIDEO" ? "video" : item.media_type === "CAROUSEL_ALBUM" ? "carousel" : "image",
  }));

  const username = profile.username ?? account.handle?.replace(/^@/, "");
  return {
    followers: profile.followers_count ?? null,
    profile_image_url: profile.profile_picture_url ?? null,
    cover_image_url: null,
    profile_url: username ? `https://www.instagram.com/${username}/` : null,
    media_count: profile.media_count ?? null,
    recent_media: media,
  };
}

/** Refreshes stale (or the given) Meta accounts. Returns how many were updated. */
export async function syncSocialProfiles(options: { staleHours?: number; limit?: number; accountIds?: string[] } = {}) {
  const sb = supabaseAdmin();
  const { staleHours = 6, limit = 10, accountIds } = options;
  let query = sb
    .from("social_accounts")
    .select("id, platform, external_id, handle")
    .eq("connected", true)
    .eq("status", "connected")
    .in("platform", ["facebook", "instagram"])
    .not("external_id", "is", null)
    .order("stats_updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (accountIds?.length) query = query.in("id", accountIds);
  else query = query.or(`stats_updated_at.is.null,stats_updated_at.lt.${new Date(Date.now() - staleHours * 3_600_000).toISOString()}`);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const summary = { synced: 0, failed: 0, errors: [] as string[] };
  for (const account of (rows ?? []) as AccountRow[]) {
    try {
      const { accessToken } = await readAccountToken(account.id);
      const fields = account.platform === "facebook" ? await syncFacebook(account, accessToken) : await syncInstagram(account, accessToken);
      const stamp = new Date().toISOString();
      // Keep the previous avatar if Meta returned none this time.
      const patch: Record<string, unknown> = { ...fields, stats_updated_at: stamp, last_synced_at: stamp };
      if (!fields.profile_image_url) delete patch.profile_image_url;
      await sb.from("social_accounts").update(patch).eq("id", account.id);
      summary.synced += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Profile sync failed";
      if (cause instanceof SocialAuthError) await markAccountExpired(account.id, message);
      // Stamp it anyway so one broken account doesn't block the rest every run.
      await sb.from("social_accounts").update({ stats_updated_at: new Date().toISOString() }).eq("id", account.id);
      summary.failed += 1;
      summary.errors.push(`${account.platform} ${account.handle}: ${message}`);
    }
  }
  return summary;
}
