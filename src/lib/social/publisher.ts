import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SocialAuthError, markAccountExpired, readAccountToken } from "./accounts";
import { linkedinToken, publishLinkedIn } from "./providers/linkedin";
import { publishFacebook, publishInstagram } from "./providers/meta";
import type { PublishInput, PublishResult } from "./providers/shared";
import type { SocialPlatform } from "./types";

type Publisher = (input: PublishInput) => Promise<PublishResult>;

// Only platforms with a real adapter are publishable. Anything else fails with
// a plain message instead of pretending it went out.
const publishers: Partial<Record<SocialPlatform, Publisher>> = {
  facebook: publishFacebook,
  instagram: publishInstagram,
  linkedin: publishLinkedIn,
};

export const PUBLISHABLE_PLATFORMS = Object.keys(publishers) as SocialPlatform[];

const ASSET_BUCKET = "brand-assets";

type PostRow = {
  customer_id: string | null;
  title: string | null;
  body: string;
  headline: string | null;
  hashtags: string[] | null;
  first_comment: string | null;
  link_url: string | null;
  media_url: string | null;
  media_asset_id: string | null;
  media_type: string | null;
  alt_text: string | null;
  status: string;
  scheduled_at: string | null;
};
type AccountRow = { id: string; external_id: string | null; connected: boolean; status: string; posting_enabled: boolean };

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function captionFor(post: PostRow): string {
  const tags = (post.hashtags ?? []).filter((tag) => !new RegExp(`#${tag}\\b`, "i").test(post.body));
  return tags.length ? `${post.body}\n\n${tags.map((tag) => `#${tag}`).join(" ")}` : post.body;
}

/** A URL the provider can fetch. Private library assets get a one-hour signed URL. */
async function mediaUrlFor(post: PostRow): Promise<string | null> {
  if (!post.media_asset_id) return post.media_url;
  const sb = supabaseAdmin();
  const { data: asset } = await sb.from("content_assets").select("storage_path").eq("id", post.media_asset_id).maybeSingle();
  if (!asset?.storage_path) throw new Error("The attached media asset no longer exists.");
  const { data, error } = await sb.storage.from(ASSET_BUCKET).createSignedUrl(asset.storage_path, 3600);
  if (error || !data?.signedUrl) throw new Error(`Could not prepare the media file: ${error?.message ?? "no signed URL"}`);
  return data.signedUrl;
}

/**
 * Finds the account for a destination saved before an account was chosen.
 * Only when exactly ONE connected account exists for that client + platform:
 * with several Pages, guessing could post to the wrong brand.
 */
async function fallbackAccount(platform: SocialPlatform, customerId: string | null): Promise<AccountRow | null> {
  let query = supabaseAdmin()
    .from("social_accounts")
    .select("id, external_id, connected, status, posting_enabled")
    .eq("platform", platform)
    .eq("connected", true)
    .eq("status", "connected")
    .eq("posting_enabled", true);
  query = customerId ? query.eq("customer_id", customerId) : query.is("customer_id", null);
  const { data } = await query.limit(2);
  return data?.length === 1 ? (data[0] as AccountRow) : null;
}

/**
 * Publishes every due destination row. With `postId`, only that post (used by
 * "Publish now" so it goes out immediately rather than on the next cron tick).
 */
export async function publishDueSocialPosts(limit = 20, options: { postId?: string } = {}) {
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  let query = sb
    .from("social_post_platforms")
    .select("id, post_id, platform, social_account_id, social_posts!inner(customer_id,title,body,headline,hashtags,first_comment,link_url,media_url,media_asset_id,media_type,alt_text,status,scheduled_at), social_accounts(id,external_id,connected,status,posting_enabled)")
    .eq("platform_status", "scheduled")
    .eq("social_posts.status", "scheduled")
    .lte("social_posts.scheduled_at", now)
    .limit(limit);
  if (options.postId) query = query.eq("post_id", options.postId);
  const { data: rows, error } = await query;
  if (error) throw error;

  const summary = { examined: rows?.length ?? 0, published: 0, failed: 0, skipped: 0, errors: [] as string[] };
  const touchedPosts = new Set<string>();

  for (const row of rows ?? []) {
    const post = one(row.social_posts as PostRow | PostRow[] | null);
    const platform = row.platform as SocialPlatform;
    if (!post) { summary.skipped += 1; continue; }

    // Claim the row. If the cron and "Publish now" race, only one wins.
    const { data: claimed } = await sb
      .from("social_post_platforms")
      .update({ platform_status: "publishing", error_message: null })
      .eq("id", row.id)
      .eq("platform_status", "scheduled")
      .select("id");
    if (!claimed?.length) { summary.skipped += 1; continue; }
    touchedPosts.add(row.post_id);

    let account = one(row.social_accounts as AccountRow | AccountRow[] | null);
    if (!account?.connected || account.status !== "connected" || !account.posting_enabled || !account.external_id) {
      account = await fallbackAccount(platform, post.customer_id);
      if (account) await sb.from("social_post_platforms").update({ social_account_id: account.id }).eq("id", row.id);
    }

    const { data: last } = await sb.from("social_publish_attempts").select("attempt_number").eq("post_id", row.post_id).eq("platform", platform).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
    const attemptNumber = (last?.attempt_number ?? 0) + 1;
    const { data: attempt } = await sb.from("social_publish_attempts").insert({
      post_id: row.post_id,
      social_account_id: account?.id ?? null,
      platform,
      idempotency_key: `${row.post_id}:${platform}:${attemptNumber}`,
      attempt_number: attemptNumber,
      status: "publishing",
      started_at: now,
    }).select("id").single();

    try {
      const adapter = publishers[platform];
      if (!adapter) throw new Error(`${platform.replace("_", " ")} publishing isn't available yet. Facebook, Instagram, and LinkedIn are live.`);
      if (!account?.external_id) throw new Error(`No ${platform} account chosen for this post. Edit it, pick which account to post as, then retry.`);

      const stored = await readAccountToken(account.id);
      const accessToken = platform === "linkedin" ? await linkedinToken(account.id, stored) : stored.accessToken;
      const mediaType = (["image", "video", "carousel"].includes(post.media_type ?? "") ? post.media_type : "none") as PublishInput["mediaType"];
      const mediaUrl = await mediaUrlFor(post);

      const result = await adapter({
        accountId: account.id,
        accountExternalId: account.external_id,
        accessToken,
        caption: captionFor(post),
        title: post.title ?? "",
        headline: post.headline,
        firstComment: post.first_comment,
        linkUrl: post.link_url,
        mediaUrl,
        mediaType: mediaUrl && mediaType === "none" ? "image" : mediaType,
        altText: post.alt_text,
      });

      const finished = new Date().toISOString();
      if (attempt) await sb.from("social_publish_attempts").update({ status: "succeeded", provider_response: result.raw ?? {}, finished_at: finished }).eq("id", attempt.id);
      await sb.from("social_post_platforms").update({ platform_status: "published", external_post_id: result.externalId, external_url: result.externalUrl, published_at: finished }).eq("id", row.id);
      await sb.from("social_activity_events").insert({ event_type: "post_published", actor: "publisher", customer_id: post.customer_id, account_id: account.id, post_id: row.post_id, platform, detail: post.title });
      summary.published += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown publishing failure";
      if (cause instanceof SocialAuthError && account) await markAccountExpired(account.id, message);
      if (attempt) await sb.from("social_publish_attempts").update({ status: "failed", error_message: message, finished_at: new Date().toISOString() }).eq("id", attempt.id);
      await sb.from("social_post_platforms").update({ platform_status: "failed", error_message: message }).eq("id", row.id);
      await sb.from("social_activity_events").insert({ event_type: "publish_failed", actor: "publisher", customer_id: post.customer_id, account_id: account?.id ?? null, post_id: row.post_id, platform, detail: message.slice(0, 500) });
      summary.failed += 1;
      summary.errors.push(`${platform}: ${message}`);
    }
  }

  // Roll destination results up to the post once per post.
  for (const postId of touchedPosts) {
    const { data: childRows } = await sb.from("social_post_platforms").select("platform,platform_status,external_url,error_message").eq("post_id", postId);
    const states = childRows ?? [];
    const allPublished = states.length > 0 && states.every((child) => child.platform_status === "published");
    // A destination still "scheduled" (e.g. cut off by the batch limit) keeps
    // the post "scheduled" so the next run picks it up.
    const waiting = states.some((child) => child.platform_status === "scheduled");
    const inFlight = states.some((child) => child.platform_status === "publishing");
    const failures = states.filter((child) => child.platform_status === "failed");
    const stamp = new Date().toISOString();
    const patch = allPublished
      ? { status: "published", published_at: stamp, external_url: states.find((child) => child.external_url)?.external_url ?? null, error: null, last_publish_attempt_at: stamp }
      : waiting || inFlight
        ? { status: waiting ? "scheduled" : "publishing", last_publish_attempt_at: stamp }
        : { status: "failed", error: failures.map((child) => `${child.platform}: ${child.error_message}`).join(" · ").slice(0, 1000) || "One or more platforms failed to publish", last_publish_attempt_at: stamp };
    await sb.from("social_posts").update(patch).eq("id", postId);
  }
  return summary;
}
