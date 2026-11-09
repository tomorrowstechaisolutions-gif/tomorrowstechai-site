import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, encryptionConfigured } from "./crypto";

/**
 * Zoom OAuth (General app, user-managed), and the only place a Zoom token is
 * ever read or written.
 *
 * Same posture as lib/google/oauth.ts, plus three Zoom-specific facts:
 *
 *   · Zoom ROTATES refresh tokens. Every refresh returns a new one and the
 *     old one must be considered dead. Two requests refreshing at the same
 *     moment would therefore race, and the loser would store a dead token.
 *     The write below is conditional on the refresh token it started from, so
 *     the loser notices, re-reads, and uses the winner's fresh access token.
 *   · Tokens are encrypted before they reach the database (./crypto.ts).
 *   · PKCE (S256) is used on top of the client secret and the state cookie.
 *
 * Plain fetch against documented endpoints — no SDK, the same decision the
 * Google and Stripe clients made.
 */

const AUTHORIZE_ENDPOINT = "https://zoom.us/oauth/authorize";
const TOKEN_ENDPOINT = "https://zoom.us/oauth/token";
const REVOKE_ENDPOINT = "https://zoom.us/oauth/revoke";
export const ZOOM_API = "https://api.zoom.us/v2";

/** Scopes the Zoom app must have. Configured in the Marketplace, listed here for the setup screen. */
export const ZOOM_REQUIRED_SCOPES = [
  "meeting:write:meeting",
  "meeting:read:meeting",
  "meeting:update:meeting",
  "meeting:delete:meeting",
  "user:read:user",
];

export function zoomConfigured(): boolean {
  return Boolean(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

/** What is missing on the server, in the order someone should fix it. */
export function zoomMissingConfig(): string[] {
  const missing: string[] = [];
  if (!process.env.ZOOM_CLIENT_ID) missing.push("ZOOM_CLIENT_ID");
  if (!process.env.ZOOM_CLIENT_SECRET) missing.push("ZOOM_CLIENT_SECRET");
  if (!encryptionConfigured()) missing.push("INTEGRATION_ENCRYPTION_KEY");
  return missing;
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.tomorrowstechai.com").replace(/\/+$/, "");
}

/**
 * Must match the Redirect URL registered on the Zoom app exactly.
 *
 * Order: ZOOM_REDIRECT_URI if set; otherwise the origin the admin is actually
 * on (so www stays www — the state/PKCE cookies were set on that host and
 * would be missing on any other); otherwise NEXT_PUBLIC_SITE_URL.
 */
export function zoomRedirectUri(origin?: string | null): string {
  if (process.env.ZOOM_REDIRECT_URI) return process.env.ZOOM_REDIRECT_URI;
  const base = origin && /^https?:\/\/[^/]+$/.test(origin) ? origin : siteBase();
  return `${base.replace(/\/+$/, "")}/api/zoom/oauth/callback`;
}

export function zoomWebhookUrl(origin?: string | null): string {
  const base = origin && /^https?:\/\/[^/]+$/.test(origin) ? origin : siteBase();
  return `${base}/api/zoom/webhook`;
}

function basicAuth(): string {
  const raw = `${process.env.ZOOM_CLIENT_ID ?? ""}:${process.env.ZOOM_CLIENT_SECRET ?? ""}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

// ── PKCE + state ─────────────────────────────────────────────────────

export function newOAuthState(): { state: string; verifier: string; challenge: string } {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function zoomAuthUrl(state: string, challenge: string, origin?: string | null): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ZOOM_CLIENT_ID ?? "",
    redirect_uri: zoomRedirectUri(origin),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

// ── Storage ──────────────────────────────────────────────────────────

type StoredRow = {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_email: string | null;
  account_name: string | null;
  scope: string | null;
  connected_at: string | null;
  connected_by: string | null;
  last_error: string | null;
  last_error_at: string | null;
  metadata: Record<string, unknown> | null;
};

const COLUMNS =
  "access_token, refresh_token, token_expires_at, account_email, account_name, scope, connected_at, connected_by, last_error, last_error_at, metadata";

async function readRow(): Promise<StoredRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("integration_credentials")
    .select(COLUMNS)
    .eq("provider", "zoom")
    .maybeSingle();
  if (error) throw new Error(`Could not read the Zoom connection: ${error.message}`);
  return (data as StoredRow | null) ?? null;
}

/** Zoom user types. 1 = Basic (free, 40-minute group meeting limit). */
export const ZOOM_PLAN_LABEL: Record<number, string> = {
  1: "Basic (free)",
  2: "Licensed",
  4: "Unassigned",
  99: "None",
};

export type ZoomConnection = {
  configured: boolean;
  missing: string[];
  connected: boolean;
  account: string | null;
  accountName: string | null;
  connectedAt: string | null;
  connectedBy: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  scope: string | null;
  /** Zoom user type; 1 means Basic and its 40-minute limit applies. */
  planType: number | null;
  planLabel: string | null;
  zoomTimezone: string | null;
};

/** Safe for any admin screen: says what is connected without a token in sight. */
export async function zoomConnection(): Promise<ZoomConnection> {
  const missing = zoomMissingConfig();
  const base: ZoomConnection = {
    configured: missing.length === 0,
    missing,
    connected: false,
    account: null,
    accountName: null,
    connectedAt: null,
    connectedBy: null,
    lastError: null,
    lastErrorAt: null,
    scope: null,
    planType: null,
    planLabel: null,
    zoomTimezone: null,
  };
  if (!zoomConfigured()) return base;

  let row: StoredRow | null = null;
  try {
    row = await readRow();
  } catch (error) {
    return { ...base, lastError: error instanceof Error ? error.message : "Could not read the Zoom connection." };
  }
  if (!row) return base;

  const meta = row.metadata ?? {};
  const planType = typeof meta.plan_type === "number" ? meta.plan_type : null;
  return {
    ...base,
    connected: Boolean(row.refresh_token),
    account: row.account_email,
    accountName: row.account_name,
    connectedAt: row.connected_at,
    connectedBy: row.connected_by,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    scope: row.scope,
    planType,
    planLabel: planType != null ? (ZOOM_PLAN_LABEL[planType] ?? `Type ${planType}`) : null,
    zoomTimezone: typeof meta.timezone === "string" ? meta.timezone : null,
  };
}

// ── Token endpoint ───────────────────────────────────────────────────

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  reason?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  let parsed: TokenResponse = {};
  try {
    parsed = (await res.json()) as TokenResponse;
  } catch {
    parsed = { error: `http_${res.status}` };
  }
  if (!res.ok && !parsed.error) parsed.error = `http_${res.status}`;
  return parsed;
}

function expiryFrom(seconds: number | undefined): string {
  // Two minutes of headroom so a token never expires mid-request.
  const ms = ((seconds ?? 3600) - 120) * 1000;
  return new Date(Date.now() + Math.max(ms, 30_000)).toISOString();
}

type ZoomMe = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  type?: number;
  timezone?: string;
  account_id?: string;
};

async function fetchMe(accessToken: string): Promise<ZoomMe | null> {
  try {
    const res = await fetch(`${ZOOM_API}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ZoomMe;
  } catch {
    return null;
  }
}

/** Exchanges the one-time code (with the PKCE verifier) and stores encrypted tokens. */
export async function exchangeZoomCode(
  code: string,
  verifier: string,
  actor: string | null,
  origin?: string | null
): Promise<{ email: string | null }> {
  if (!encryptionConfigured()) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY is not set, so the Zoom token cannot be stored safely.");
  }

  const token = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: zoomRedirectUri(origin),
    code_verifier: verifier,
  });

  if (token.error || !token.access_token || !token.refresh_token) {
    throw new Error(token.reason || token.error_description || token.error || "Zoom refused the authorization code.");
  }

  const me = await fetchMe(token.access_token);
  const name = me?.display_name || [me?.first_name, me?.last_name].filter(Boolean).join(" ") || null;

  const { error } = await supabaseAdmin().from("integration_credentials").upsert(
    {
      provider: "zoom",
      account_email: me?.email ?? null,
      account_name: name,
      access_token: encryptSecret(token.access_token),
      refresh_token: encryptSecret(token.refresh_token),
      token_expires_at: expiryFrom(token.expires_in),
      scope: token.scope ?? null,
      // Zoom has no calendar; the column is required by 0020, so it says so.
      calendar_id: "zoom",
      connected_by: actor,
      connected_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
      metadata: {
        zoom_user_id: me?.id ?? null,
        account_id: me?.account_id ?? null,
        plan_type: me?.type ?? null,
        timezone: me?.timezone ?? null,
      },
    },
    { onConflict: "provider" }
  );
  if (error) throw new Error(`Zoom connected, but the credential could not be saved: ${error.message}`);

  return { email: me?.email ?? null };
}

async function recordError(message: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from("integration_credentials")
      .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString() })
      .eq("provider", "zoom");
  } catch {
    // Recording why something failed must never be the thing that fails.
  }
}

/** Clears a previously recorded error once a call succeeds again. */
export async function clearZoomError(): Promise<void> {
  try {
    await supabaseAdmin()
      .from("integration_credentials")
      .update({ last_error: null, last_error_at: null })
      .eq("provider", "zoom")
      .not("last_error", "is", null);
  } catch {
    /* non-fatal */
  }
}

export class ZoomAuthError extends Error {
  readonly needsReconnect: boolean;
  constructor(message: string, needsReconnect: boolean) {
    super(message);
    this.name = "ZoomAuthError";
    this.needsReconnect = needsReconnect;
  }
}

// One refresh at a time per server instance. The conditional write below
// covers the cross-instance case.
let inflight: Promise<string> | null = null;

/**
 * A usable access token, refreshing first if the stored one is stale.
 * `force` refreshes even when the stored token looks fresh (after a 401).
 */
export async function zoomAccessToken(force = false): Promise<string> {
  if (!zoomConfigured()) {
    throw new ZoomAuthError("Zoom is not configured on the server. Add ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET.", false);
  }
  const row = await readRow();
  if (!row?.refresh_token) {
    throw new ZoomAuthError("Zoom is not connected. Connect it in Conference Center → Zoom settings.", true);
  }

  const fresh = row.access_token
    && row.token_expires_at
    && new Date(row.token_expires_at).getTime() > Date.now();

  if (fresh && !force) {
    const token = decryptSecret(row.access_token);
    if (token) return token;
  }

  if (!inflight) {
    inflight = refresh(row).finally(() => { inflight = null; });
  }
  return inflight;
}

async function refresh(row: StoredRow): Promise<string> {
  let refreshToken: string | null;
  try {
    refreshToken = decryptSecret(row.refresh_token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zoom credential unreadable. Reconnect Zoom.";
    await recordError(message);
    throw new ZoomAuthError(message, true);
  }
  if (!refreshToken) throw new ZoomAuthError("Zoom is not connected.", true);

  const token = await postToken({ grant_type: "refresh_token", refresh_token: refreshToken });

  if (token.error || !token.access_token || !token.refresh_token) {
    // Another instance may have rotated the token a moment ago — possibly
    // still mid-write. Re-read now, and once more after a short pause, before
    // declaring the connection dead and telling anyone to reconnect.
    for (const wait of [0, 1500]) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      const latest = await readRow().catch(() => null);
      if (latest?.refresh_token && latest.refresh_token !== row.refresh_token && latest.access_token) {
        const winner = decryptSecret(latest.access_token);
        if (winner) return winner;
      }
    }
    const message =
      token.error === "invalid_grant" || token.error === "invalid_request"
        ? "Zoom access has expired or was revoked. Reconnect Zoom in Conference Center → Zoom settings."
        : token.reason || token.error_description || token.error || "Zoom would not refresh the access token.";
    await recordError(message);
    throw new ZoomAuthError(message, true);
  }

  // Conditional on the refresh token we started from: if another instance
  // already rotated it, this write matches nothing and we keep theirs.
  //
  // Zoom has ALREADY invalidated the old refresh token at this point, so a
  // failed write here would strand the connection. The write is retried; if
  // it still fails, that is recorded loudly rather than passed off as a race.
  const update = {
    access_token: encryptSecret(token.access_token),
    refresh_token: encryptSecret(token.refresh_token),
    token_expires_at: expiryFrom(token.expires_in),
    scope: token.scope ?? row.scope,
    last_error: null,
    last_error_at: null,
  };
  let data: { provider: string }[] | null = null;
  let writeError: { message: string } | null = null;
  for (const wait of [0, 400, 1500]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const res = await supabaseAdmin()
      .from("integration_credentials")
      .update(update)
      .eq("provider", "zoom")
      .eq("refresh_token", row.refresh_token as string)
      .select("provider");
    data = (res.data as { provider: string }[] | null) ?? null;
    writeError = res.error ? { message: res.error.message } : null;
    if (!writeError) break;
  }

  if (writeError) {
    console.error("Zoom token refresh could not be saved:", writeError.message);
    await recordError(
      "Zoom issued new tokens but they could not be saved to the database. "
      + "If Zoom stops working within the hour, reconnect it in Conference Center → Zoom settings."
    );
  } else if (!data || data.length === 0) {
    // Lost the race, but the access token Zoom just gave us is still valid
    // for its hour — use it; the stored row belongs to the winner.
    console.warn("Zoom token refresh raced another instance; kept the stored winner.");
  }
  return token.access_token;
}

/**
 * Forgets the connection: revokes at Zoom (best effort), then deletes the
 * row — deleted, not blanked.
 */
export async function disconnectZoom(): Promise<{ revoked: boolean }> {
  let revoked = false;
  try {
    const row = await readRow();
    const access = row?.access_token ? decryptSecret(row.access_token) : null;
    if (access && zoomConfigured()) {
      const res = await fetch(`${REVOKE_ENDPOINT}?${new URLSearchParams({ token: access }).toString()}`, {
        method: "POST",
        headers: { Authorization: basicAuth() },
        cache: "no-store",
      });
      revoked = res.ok;
    }
  } catch {
    // Revocation is a courtesy; the local delete below is what matters.
  }
  await supabaseAdmin().from("integration_credentials").delete().eq("provider", "zoom");
  return { revoked };
}

/** Called by the deauthorization webhook: the user removed the app in Zoom. */
export async function forgetZoomConnection(zoomUserId: string | null): Promise<void> {
  const row = await readRow().catch(() => null);
  if (!row) return;
  const storedUser = (row.metadata ?? {}).zoom_user_id;
  if (zoomUserId && storedUser && storedUser !== zoomUserId) return;
  await supabaseAdmin().from("integration_credentials").delete().eq("provider", "zoom");
}
