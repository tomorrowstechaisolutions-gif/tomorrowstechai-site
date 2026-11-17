import "server-only";
import { createHash, randomBytes } from "crypto";
import { SocialAuthError, saveConnectedAccount, updateAccountToken, type StoredToken } from "../accounts";
import type { PublishInput, PublishResult } from "./shared";

/**
 * X (Twitter) posting for one user account, via the X API v2.
 *
 * OAuth 2.0 authorization code with PKCE, as a confidential client (the app's
 * client secret authenticates the token calls). Access tokens last two hours;
 * `offline.access` returns a refresh token, which X rotates on every refresh,
 * so the new one is saved each time.
 *
 * Posting through the API may need a paid X API plan; X decides that, not us.
 * A refusal from X comes back as a plain publish failure in Social Center.
 */

export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
const API = "https://api.x.com/2";
/** X counts every link as 23 characters, whatever its real length. */
const LINK_WEIGHT = 23;
const LIMIT = 280;

export function xConfigured(): boolean {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
}

/** A PKCE verifier (kept in the OAuth cookie) and the challenge sent to X. */
export function xPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function xAuthUrl(state: string, redirectUri: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: X_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `https://x.com/i/oauth2/authorize?${params}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${process.env.X_CLIENT_ID ?? ""}:${process.env.X_CLIENT_SECRET ?? ""}`).toString("base64");
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ ...body, client_id: process.env.X_CLIENT_ID ?? "" }).toString(),
    cache: "no-store",
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

function expiry(seconds: number | undefined): string {
  return new Date(Date.now() + Math.max(60, (seconds ?? 7200) - 120) * 1000).toISOString();
}

export async function connectX(code: string, redirectUri: string, verifier: string, customerId: string | null, actor: string | null) {
  if (!verifier) throw new Error("X connection expired or didn't match. Start it again.");
  const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
  if (!token.access_token) throw new Error(token.error_description || token.error || "X refused the authorization code.");

  const res = await fetch(`${API}/users/me?user.fields=id,name,username,profile_image_url`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  const me = ((await res.json().catch(() => ({}))) as { data?: { id?: string; name?: string; username?: string; profile_image_url?: string } }).data;
  if (!res.ok || !me?.id) throw new Error("X did not return the account profile. Check the app has Read and write permissions.");

  await saveConnectedAccount({
    customerId,
    platform: "x",
    provider: "x",
    externalId: me.id,
    displayName: me.name || `@${me.username ?? me.id}`,
    handle: me.username ? `@${me.username}` : me.id,
    profileImageUrl: me.profile_image_url ?? null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    tokenExpiresAt: expiry(token.expires_in),
    scopes: (token.scope ?? X_SCOPES.join(" ")).split(/[\s,]+/).filter(Boolean),
    providerUserId: me.id,
    actor,
  });
  return [`X: @${me.username ?? me.id}`];
}

/** A usable token, refreshed first when the two-hour access token has run out. */
export async function xToken(accountId: string, stored: StoredToken): Promise<string> {
  const expired = !stored.expiresAt || new Date(stored.expiresAt).getTime() <= Date.now();
  if (!expired) return stored.accessToken;
  if (!stored.refreshToken) throw new SocialAuthError("X access expired and no refresh token was stored. Reconnect X in Social Center.");
  const token = await tokenRequest({ grant_type: "refresh_token", refresh_token: stored.refreshToken });
  if (!token.access_token) throw new SocialAuthError(`X refresh failed: ${token.error_description || token.error || "unknown error"}. Reconnect X.`);
  await updateAccountToken(accountId, { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: expiry(token.expires_in) });
  return token.access_token;
}

/** Length as X counts it: links are 23 characters, other text by code point. */
export function xLength(text: string): number {
  const links = text.match(/https?:\/\/\S+/g) ?? [];
  const rest = text.replace(/https?:\/\/\S+/g, "");
  return [...rest].length + links.length * LINK_WEIGHT;
}

/**
 * Fits a caption (plus the link, if any) into one post. Hashtag lines go
 * first, then the text is cut at a sentence or word boundary with an ellipsis.
 * The link is always kept whole, on its own line at the end.
 */
export function xText(caption: string, linkUrl: string | null): string {
  // The link to keep: the post's link, else the last URL in the caption. Any
  // caption line carrying it (e.g. "Read it on Field Notes: <url>") is taken
  // out so cutting the text can never cut the link.
  const link = linkUrl || (caption.match(/https?:\/\/\S+/g) ?? []).pop() || null;
  const tail = link ? `\n\n${link}` : "";
  const room = LIMIT - (link ? 2 + LINK_WEIGHT : 0);
  let body = (link ? caption.split("\n").filter((line) => !line.includes(link)).join("\n") : caption).replace(/\n{3,}/g, "\n\n").trim();
  if (xLength(body) <= room) return body + tail;

  // Drop trailing hashtag-only lines before cutting real words.
  const lines = body.split("\n");
  while (lines.length > 1 && /^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(lines[lines.length - 1])) lines.pop();
  body = lines.join("\n").trim();
  if (xLength(body) <= room) return body + tail;

  const chars = [...body];
  let cut = chars.slice(0, room - 1).join("");
  while (xLength(cut) > room - 1) cut = [...cut].slice(0, -1).join("");
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf("\n"));
  if (sentence > cut.length * 0.5) return cut.slice(0, sentence + 1).trim() + tail;
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, "") + "…" + tail;
}

async function x(path: string, token: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401) throw new SocialAuthError("X rejected the access token. Reconnect X in Social Center.");
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { detail?: string; title?: string; errors?: Array<{ message?: string }> };
    const why = detail.detail || detail.errors?.[0]?.message || detail.title || "no detail";
    const plan = res.status === 402 || res.status === 403 ? " (X may require a paid API plan or Read and write app permissions for this)" : "";
    throw new Error(`X ${path} failed (HTTP ${res.status}): ${why}${plan}`);
  }
  return res;
}

async function uploadImage(token: string, mediaUrl: string): Promise<string> {
  const file = await fetch(mediaUrl, { cache: "no-store" });
  if (!file.ok) throw new Error(`Could not read the attached image (HTTP ${file.status}).`);
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("X images must be 5 MB or smaller. Use a smaller image for this post.");
  const form = new FormData();
  form.append("media", new Blob([bytes], { type: file.headers.get("content-type") ?? "image/jpeg" }), "image");
  form.append("media_category", "tweet_image");
  const res = await x("/media/upload", token, { method: "POST", body: form });
  const id = ((await res.json().catch(() => ({}))) as { data?: { id?: string } }).data?.id;
  if (!id) throw new Error("X accepted the image but returned no media id.");
  return id;
}

export async function publishX(input: PublishInput): Promise<PublishResult> {
  if (input.mediaType === "video" || input.mediaType === "carousel") {
    throw new Error("X video and multi-image posts aren't supported yet. Use a single image or text post.");
  }
  const text = xText(input.caption, input.linkUrl);
  const body: Record<string, unknown> = { text };
  if (input.mediaUrl) body.media = { media_ids: [await uploadImage(input.accessToken, input.mediaUrl)] };

  const res = await x("/tweets", input.accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const id = ((await res.json().catch(() => ({}))) as { data?: { id?: string } }).data?.id;
  if (!id) throw new Error("X accepted the post but returned no id.");

  const raw: Record<string, unknown> = { id, length: xLength(text) };
  if (input.firstComment) {
    try {
      await x("/tweets", input.accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: xText(input.firstComment, null), reply: { in_reply_to_tweet_id: id } }),
      });
      raw.firstComment = "posted";
    } catch (error) {
      raw.firstCommentError = error instanceof Error ? error.message : "First reply failed";
    }
  }
  return { externalId: id, externalUrl: `https://x.com/i/web/status/${id}`, raw };
}
