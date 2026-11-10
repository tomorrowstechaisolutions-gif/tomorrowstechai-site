import "server-only";
import { SocialAuthError, saveConnectedAccount, updateAccountToken, type StoredToken } from "../accounts";
import type { PublishInput, PublishResult } from "./shared";

/**
 * LinkedIn member (personal profile) publishing.
 *
 * Uses the self-serve "Share on LinkedIn" (w_member_social) and "Sign In with
 * LinkedIn using OpenID Connect" products — no partner review. Company Page
 * posting needs the Community Management API, which LinkedIn vets separately.
 *
 * Access tokens last 60 days. Refresh tokens are only issued to approved
 * partner apps, so the usual path is reconnecting; Needs Attention starts
 * warning seven days before expiry. If LinkedIn does return a refresh token,
 * it is used automatically.
 */

const VERSION = process.env.LINKEDIN_API_VERSION || "202610";
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];

export function linkedinConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function linkedinAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES.join(" "),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...body,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }).toString(),
    cache: "no-store",
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

function expiry(seconds: number | undefined): string {
  return new Date(Date.now() + Math.max(60, (seconds ?? 5_184_000) - 300) * 1000).toISOString();
}

export async function connectLinkedIn(code: string, redirectUri: string, customerId: string | null, actor: string | null) {
  const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!token.access_token) throw new Error(token.error_description || token.error || "LinkedIn refused the authorization code.");

  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  const me = (await res.json().catch(() => ({}))) as { sub?: string; name?: string; picture?: string };
  if (!res.ok || !me.sub) throw new Error("LinkedIn did not return the member profile. Check that the app has the OpenID Connect product.");

  await saveConnectedAccount({
    customerId,
    platform: "linkedin",
    provider: "linkedin",
    externalId: `urn:li:person:${me.sub}`,
    displayName: me.name || "LinkedIn member",
    handle: me.name || me.sub,
    profileImageUrl: me.picture ?? null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    tokenExpiresAt: expiry(token.expires_in),
    scopes: (token.scope ?? LINKEDIN_SCOPES.join(" ")).split(/[\s,]+/).filter(Boolean),
    providerUserId: me.sub,
    actor,
  });
  return [`LinkedIn: ${me.name ?? "member profile"}`];
}

/** A usable token for this account, refreshed first if LinkedIn issued a refresh token. */
export async function linkedinToken(accountId: string, stored: StoredToken): Promise<string> {
  const expired = stored.expiresAt && new Date(stored.expiresAt).getTime() <= Date.now();
  if (!expired) return stored.accessToken;
  if (!stored.refreshToken) throw new SocialAuthError("LinkedIn access expired (60-day limit). Reconnect LinkedIn in Social Center.");
  const token = await tokenRequest({ grant_type: "refresh_token", refresh_token: stored.refreshToken });
  if (!token.access_token) throw new SocialAuthError(`LinkedIn refresh failed: ${token.error_description || token.error || "unknown error"}. Reconnect LinkedIn.`);
  await updateAccountToken(accountId, { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: expiry(token.expires_in) });
  return token.access_token;
}

/**
 * LinkedIn's "little text" format treats these characters as markup; left
 * unescaped, a post with "(" or "@" is truncated or rejected. Hashtags are
 * converted to LinkedIn's hashtag template so they stay clickable.
 */
export function toLittleText(text: string): string {
  return text
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part) =>
      /^#[\p{L}\p{N}_]+$/u.test(part)
        ? `{hashtag|\\#|${part.slice(1)}}`
        : part.replace(/[\\|{}@\[\]()<>#*_~]/g, (ch) => `\\${ch}`)
    )
    .join("");
}

async function li(path: string, token: string, body: unknown): Promise<Response> {
  const res = await fetch(`https://api.linkedin.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401) throw new SocialAuthError("LinkedIn rejected the access token. Reconnect LinkedIn in Social Center.");
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`LinkedIn ${path} failed (HTTP ${res.status}): ${detail.message ?? "no detail"}`);
  }
  return res;
}

async function uploadImage(token: string, owner: string, mediaUrl: string): Promise<string> {
  const init = await li("/rest/images?action=initializeUpload", token, { initializeUploadRequest: { owner } });
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
  const file = await fetch(mediaUrl, { cache: "no-store" });
  if (!file.ok) throw new Error(`Could not read the attached image (HTTP ${file.status}).`);
  const bytes = await file.arrayBuffer();
  const put = await fetch(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.headers.get("content-type") ?? "application/octet-stream" },
    body: bytes,
  });
  if (!put.ok) throw new Error(`LinkedIn image upload failed (HTTP ${put.status}).`);
  return value.image;
}

export async function publishLinkedIn(input: PublishInput): Promise<PublishResult> {
  if (input.mediaType === "video" || input.mediaType === "carousel") {
    throw new Error("LinkedIn video and multi-image posts aren't supported yet. Use a single image or text post.");
  }
  const author = input.accountExternalId;
  const post: Record<string, unknown> = {
    author,
    commentary: toLittleText(input.caption),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (input.mediaUrl) {
    const image = await uploadImage(input.accessToken, author, input.mediaUrl);
    post.content = { media: { id: image, ...(input.altText ? { altText: input.altText } : {}) } };
  } else if (input.linkUrl) {
    post.content = { article: { source: input.linkUrl, title: input.headline || input.title } };
  }

  const res = await li("/rest/posts", input.accessToken, post);
  const urn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  if (!urn) throw new Error("LinkedIn accepted the post but returned no id.");

  const raw: Record<string, unknown> = { urn };
  if (input.firstComment) {
    try {
      await li(`/rest/socialActions/${encodeURIComponent(urn)}/comments`, input.accessToken, {
        actor: author,
        object: urn,
        message: { text: input.firstComment },
      });
      raw.firstComment = "posted";
    } catch (error) {
      raw.firstCommentError = error instanceof Error ? error.message : "First comment failed";
    }
  }
  return { externalId: urn, externalUrl: `https://www.linkedin.com/feed/update/${urn}/`, raw };
}
