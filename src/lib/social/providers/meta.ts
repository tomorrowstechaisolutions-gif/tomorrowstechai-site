import "server-only";
import { SocialAuthError, saveConnectedAccount } from "../accounts";
import type { PublishInput, PublishResult } from "./shared";

/**
 * Facebook Pages + Instagram Business publishing through one Meta app.
 *
 * Connect flow: user token → long-lived user token → /me/accounts, which
 * returns a Page access token per Page. Page tokens derived from a long-lived
 * user token do not expire, so these connections don't need a refresh loop.
 * Each Page's linked Instagram Business account is published with that same
 * Page token.
 *
 * While the Meta app is in Development mode this works for Pages the app's
 * admins/testers manage (i.e. Tomorrow's Tech AI's own). Posting for client
 * Pages needs Meta App Review for pages_manage_posts and
 * instagram_content_publish.
 */

const VERSION = process.env.META_GRAPH_VERSION || "v24.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
];

export function metaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function metaAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
  });
  // Business-type apps use "Facebook Login for Business", which takes a
  // configuration id (with the permissions picked in the dashboard) instead
  // of a scope list.
  if (process.env.META_LOGIN_CONFIG_ID) params.set("config_id", process.env.META_LOGIN_CONFIG_ID);
  else params.set("scope", META_SCOPES.join(","));
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${params}`;
}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; type?: string } };

async function graph<T>(path: string, init?: { method?: "GET" | "POST"; params?: Record<string, string> }): Promise<T> {
  const method = init?.method ?? "GET";
  const params = new URLSearchParams(init?.params ?? {});
  const url = method === "GET" ? `${GRAPH}${path}?${params}` : `${GRAPH}${path}`;
  const res = await fetch(url, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body: method === "POST" ? params.toString() : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || json.error) {
    const message = json.error?.message || `Meta returned HTTP ${res.status}.`;
    // 190 = invalid/expired token; 102 = session invalid; 10/200-299 = permission revoked.
    const code = json.error?.code ?? 0;
    if (code === 190 || code === 102 || code === 10 || (code >= 200 && code < 300)) {
      throw new SocialAuthError(`Meta: ${message} Reconnect Meta in Social Center.`);
    }
    throw new Error(`Meta: ${message}`);
  }
  return json;
}

/** Read-only Graph GET, used by the profile sync. */
export function metaGet<T>(path: string, params: Record<string, string>): Promise<T> {
  return graph<T>(path, { params });
}

type Page = {
  id: string;
  name: string;
  username?: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
};

/** Exchanges the code, then saves every Page (and linked Instagram account) the person granted. */
export async function connectMeta(code: string, redirectUri: string, customerId: string | null, actor: string | null) {
  const appId = process.env.META_APP_ID ?? "";
  const secret = process.env.META_APP_SECRET ?? "";
  const short = await graph<{ access_token: string }>("/oauth/access_token", {
    params: { client_id: appId, client_secret: secret, redirect_uri: redirectUri, code },
  });
  const long = await graph<{ access_token: string }>("/oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: short.access_token },
  });
  const me = await graph<{ id: string }>("/me", { params: { fields: "id", access_token: long.access_token } });
  const pages = await graph<{ data: Page[] }>("/me/accounts", {
    params: {
      fields: "id,name,username,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
      limit: "100",
      access_token: long.access_token,
    },
  });

  if (!pages.data?.length) {
    throw new Error("Meta returned no Facebook Pages. Make sure you selected at least one Page during sign-in.");
  }

  const connected: string[] = [];
  for (const page of pages.data) {
    await saveConnectedAccount({
      customerId,
      platform: "facebook",
      provider: "meta",
      externalId: page.id,
      displayName: page.name,
      handle: page.username ? `@${page.username}` : page.name,
      profileImageUrl: page.picture?.data?.url ?? null,
      accessToken: page.access_token,
      tokenExpiresAt: null,
      scopes: META_SCOPES,
      providerUserId: me.id,
      actor,
    });
    connected.push(`Facebook: ${page.name}`);

    const ig = page.instagram_business_account;
    if (ig?.id) {
      await saveConnectedAccount({
        customerId,
        platform: "instagram",
        provider: "meta",
        externalId: ig.id,
        externalPageId: page.id,
        displayName: ig.username ? `@${ig.username}` : `${page.name} (Instagram)`,
        handle: ig.username ? `@${ig.username}` : page.name,
        profileImageUrl: ig.profile_picture_url ?? null,
        accessToken: page.access_token,
        tokenExpiresAt: null,
        scopes: META_SCOPES,
        providerUserId: me.id,
        actor,
      });
      connected.push(`Instagram: @${ig.username ?? ig.id}`);
    }
  }
  return connected;
}

export async function publishFacebook(input: PublishInput): Promise<PublishResult> {
  if (input.mediaType === "video" || input.mediaType === "carousel") {
    throw new Error("Facebook video and carousel publishing isn't supported yet. Use a single image or text post.");
  }
  const token = input.accessToken;
  let postId: string;
  if (input.mediaUrl) {
    const photo = await graph<{ id: string; post_id?: string }>(`/${input.accountExternalId}/photos`, {
      method: "POST",
      params: { url: input.mediaUrl, caption: input.caption, access_token: token },
    });
    postId = photo.post_id ?? photo.id;
  } else {
    const params: Record<string, string> = { message: input.caption, access_token: token };
    if (input.linkUrl) params.link = input.linkUrl;
    const feed = await graph<{ id: string }>(`/${input.accountExternalId}/feed`, { method: "POST", params });
    postId = feed.id;
  }

  const raw: Record<string, unknown> = { postId };
  if (input.firstComment) {
    try {
      const comment = await graph<{ id: string }>(`/${postId}/comments`, { method: "POST", params: { message: input.firstComment, access_token: token } });
      raw.firstCommentId = comment.id;
    } catch (error) {
      // The post is live; a missing first comment must not mark it failed.
      raw.firstCommentError = error instanceof Error ? error.message : "First comment failed";
    }
  }
  return { externalId: postId, externalUrl: `https://www.facebook.com/${postId}`, raw };
}

export async function publishInstagram(input: PublishInput): Promise<PublishResult> {
  if (!input.mediaUrl) throw new Error("Instagram posts need an image. Attach an approved image asset and retry.");
  if (input.mediaType === "video" || input.mediaType === "carousel") {
    throw new Error("Instagram Reels and carousels aren't supported yet. Use a single image.");
  }
  const token = input.accessToken;
  const caption = input.linkUrl ? `${input.caption}\n\n${input.linkUrl}` : input.caption;
  const container = await graph<{ id: string }>(`/${input.accountExternalId}/media`, {
    method: "POST",
    params: { image_url: input.mediaUrl, caption, access_token: token },
  });

  // Images are usually ready at once; give Meta up to ~10s to finish fetching.
  for (let i = 0; i < 5; i += 1) {
    const status = await graph<{ status_code?: string }>(`/${container.id}`, { params: { fields: "status_code", access_token: token } });
    if (status.status_code === "FINISHED" || !status.status_code) break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error("Instagram could not process the image. Check that it is a JPEG under 8MB with a 4:5 to 1.91:1 aspect ratio.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const published = await graph<{ id: string }>(`/${input.accountExternalId}/media_publish`, {
    method: "POST",
    params: { creation_id: container.id, access_token: token },
  });
  let permalink: string | null = null;
  try {
    permalink = (await graph<{ permalink?: string }>(`/${published.id}`, { params: { fields: "permalink", access_token: token } })).permalink ?? null;
  } catch {
    // The post is live even if the permalink lookup fails.
  }
  return { externalId: published.id, externalUrl: permalink, raw: { containerId: container.id, mediaId: published.id } };
}
