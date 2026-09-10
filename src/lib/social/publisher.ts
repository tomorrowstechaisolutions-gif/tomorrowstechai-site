import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SocialPlatform } from "./types";

type PublishInput = {
  body: string;
  firstComment: string | null;
  linkUrl: string | null;
  mediaUrl: string | null;
  accountExternalId: string;
};

type PublishResult = { externalId: string; externalUrl: string | null; raw?: Record<string, unknown> };
type Publisher = (input: PublishInput) => Promise<PublishResult>;

// Provider adapters belong here after OAuth apps and encrypted server-side token
// storage are configured. Keeping the registry explicit prevents a disconnected
// account from being treated as publishable.
const publishers: Partial<Record<SocialPlatform, Publisher>> = {};

export async function publishDueSocialPosts(limit = 20) {
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: rows, error } = await sb
    .from("social_post_platforms")
    .select("id, post_id, platform, social_account_id, social_posts!inner(body,first_comment,link_url,media_url,status,scheduled_at), social_accounts(external_id,connected,status,posting_enabled)")
    .eq("platform_status", "scheduled")
    .eq("social_posts.status", "scheduled")
    .lte("social_posts.scheduled_at", now)
    .limit(limit);
  if (error) throw error;

  const summary = { examined: rows?.length ?? 0, published: 0, failed: 0, skipped: 0 };
  for (const row of rows ?? []) {
    const post = Array.isArray(row.social_posts) ? row.social_posts[0] : row.social_posts;
    const account = Array.isArray(row.social_accounts) ? row.social_accounts[0] : row.social_accounts;
    const platform = row.platform as SocialPlatform;
    if (!post || !account?.connected || account.status !== "connected" || !account.posting_enabled || !account.external_id) {
      summary.skipped += 1;
      continue;
    }

    const adapter = publishers[platform];
    const attemptNumberResult = await sb.from("social_publish_attempts").select("attempt_number").eq("post_id", row.post_id).eq("platform", platform).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
    const attemptNumber = (attemptNumberResult.data?.attempt_number ?? 0) + 1;
    const key = `${row.post_id}:${platform}:${attemptNumber}`;
    const { data: attempt } = await sb.from("social_publish_attempts").insert({ post_id: row.post_id, social_account_id: row.social_account_id, platform, idempotency_key: key, attempt_number: attemptNumber, status: "publishing", started_at: now }).select("id").single();
    await sb.from("social_post_platforms").update({ platform_status: "publishing", error_message: null }).eq("id", row.id).eq("platform_status", "scheduled");

    try {
      if (!adapter) throw new Error(`${platform} publishing is not configured. Add the provider OAuth application and server-side publisher adapter.`);
      const result = await adapter({ body: post.body, firstComment: post.first_comment, linkUrl: post.link_url, mediaUrl: post.media_url, accountExternalId: account.external_id });
      await sb.from("social_publish_attempts").update({ status: "succeeded", provider_response: result.raw ?? {}, finished_at: new Date().toISOString() }).eq("id", attempt!.id);
      await sb.from("social_post_platforms").update({ platform_status: "published", external_post_id: result.externalId, external_url: result.externalUrl, published_at: new Date().toISOString() }).eq("id", row.id);
      summary.published += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown publishing failure";
      await sb.from("social_publish_attempts").update({ status: "failed", error_message: message, finished_at: new Date().toISOString() }).eq("id", attempt!.id);
      await sb.from("social_post_platforms").update({ platform_status: "failed", error_message: message }).eq("id", row.id);
      summary.failed += 1;
    }

    const { data: childRows } = await sb.from("social_post_platforms").select("platform_status,external_url,error_message").eq("post_id", row.post_id);
    const states = childRows ?? [];
    const completed = states.length > 0 && states.every((child) => child.platform_status === "published");
    const hasFailure = states.some((child) => child.platform_status === "failed");
    await sb.from("social_posts").update(completed ? {
      status: "published", published_at: new Date().toISOString(), external_url: states.find((child) => child.external_url)?.external_url ?? null, error: null,
    } : hasFailure ? {
      status: "failed", error: states.find((child) => child.error_message)?.error_message ?? "One or more platforms failed to publish", last_publish_attempt_at: new Date().toISOString(),
    } : { status: "publishing" }).eq("id", row.post_id);
  }
  return summary;
}
