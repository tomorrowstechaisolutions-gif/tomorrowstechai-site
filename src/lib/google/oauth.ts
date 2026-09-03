import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Google OAuth, and the only place a refresh token is ever touched.
 *
 * Everything here runs on the service role, because `integration_credentials`
 * has RLS enabled and NO policy — an authenticated admin session cannot read
 * that table at all. A refresh token is a permanent key to somebody's
 * calendar; the blast radius of a leak is far worse than for any other row in
 * this database, so it is kept out of reach of the session entirely.
 *
 * No googleapis package. The same decision as the Stripe client: two REST
 * calls do not justify a dependency, and the build machine cannot always
 * reach a registry. Plain fetch against documented endpoints.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * calendar.events is the narrowest scope that can create an event with
 * conferencing on it. userinfo.email is only so the settings screen can say
 * WHICH account is connected — a connection you cannot identify is one you
 * cannot safely revoke.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

export type GoogleCredentials = {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_email: string | null;
  calendar_id: string;
  last_error: string | null;
  connected_at: string | null;
};

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Where Google sends the browser back to. Must match the console exactly. */
export function googleRedirectUri(): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI;
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.tomorrowstechai.com")
    .replace(/\/+$/, "");
  return `${base}/api/google/oauth/callback`;
}

/**
 * The consent URL.
 *
 * `access_type=offline` with `prompt=consent` is what makes Google return a
 * refresh token. Without both, a re-connection silently returns only an
 * access token and the integration dies an hour later.
 */
export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function readCredentials(): Promise<GoogleCredentials | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("integration_credentials")
    .select("access_token, refresh_token, token_expires_at, account_email, calendar_id, last_error, connected_at")
    .eq("provider", "google")
    .maybeSingle();
  return (data as GoogleCredentials | null) ?? null;
}

/** Public-safe: says whether Google is connected without handing over a token. */
export async function googleConnection(): Promise<{
  configured: boolean;
  connected: boolean;
  account: string | null;
  calendarId: string;
  lastError: string | null;
  connectedAt: string | null;
}> {
  const configured = googleConfigured();
  if (!configured) {
    return { configured: false, connected: false, account: null, calendarId: "primary", lastError: null, connectedAt: null };
  }
  let row: GoogleCredentials | null = null;
  try {
    row = await readCredentials();
  } catch {
    // A missing service-role key must not take a settings page down.
    return { configured: true, connected: false, account: null, calendarId: "primary", lastError: "Supabase service role is not configured.", connectedAt: null };
  }
  return {
    configured: true,
    connected: Boolean(row?.refresh_token),
    account: row?.account_email ?? null,
    calendarId: row?.calendar_id ?? "primary",
    lastError: row?.last_error ?? null,
    connectedAt: row?.connected_at ?? null,
  };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  return (await res.json()) as TokenResponse;
}

function expiryFrom(seconds: number | undefined): string {
  // Sixty seconds of headroom, so a token never expires mid-request.
  const ms = ((seconds ?? 3600) - 60) * 1000;
  return new Date(Date.now() + Math.max(ms, 30_000)).toISOString();
}

/** Exchanges the one-time code for tokens and stores them. Called once. */
export async function exchangeCode(code: string, actor: string | null): Promise<{ email: string | null }> {
  const token = await postToken({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });

  if (token.error || !token.access_token) {
    throw new Error(token.error_description || token.error || "Google refused the authorization code.");
  }
  if (!token.refresh_token) {
    throw new Error(
      "Google returned no refresh token. Remove this app at myaccount.google.com/permissions and connect again."
    );
  }

  let email: string | null = null;
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    const info = (await res.json()) as { email?: string };
    email = info.email ?? null;
  } catch {
    // Knowing the address is a nicety; the connection still works without it.
  }

  const db = supabaseAdmin();
  await db.from("integration_credentials").upsert(
    {
      provider: "google",
      account_email: email,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_expires_at: expiryFrom(token.expires_in),
      scope: token.scope ?? GOOGLE_SCOPES.join(" "),
      connected_by: actor,
      connected_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
    },
    { onConflict: "provider" }
  );

  return { email };
}

/** Forgets the connection. The token is deleted, not blanked. */
export async function disconnectGoogle(): Promise<void> {
  const db = supabaseAdmin();
  await db.from("integration_credentials").delete().eq("provider", "google");
}

async function recordError(message: string): Promise<void> {
  try {
    const db = supabaseAdmin();
    await db
      .from("integration_credentials")
      .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString() })
      .eq("provider", "google");
  } catch {
    // Recording why something failed must never be the thing that fails.
  }
}

/**
 * A usable access token, refreshing first if the stored one is stale.
 *
 * Throws with a sentence rather than returning null, because every caller's
 * only sensible response to "no token" is to tell the person to reconnect.
 */
export async function googleAccessToken(): Promise<{ token: string; calendarId: string }> {
  if (!googleConfigured()) {
    throw new Error("Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }

  const row = await readCredentials();
  if (!row?.refresh_token) {
    throw new Error("Google Calendar is not connected. Connect it in Settings.");
  }

  const fresh = row.access_token
    && row.token_expires_at
    && new Date(row.token_expires_at).getTime() > Date.now();

  if (fresh && row.access_token) {
    return { token: row.access_token, calendarId: row.calendar_id || "primary" };
  }

  const token = await postToken({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: row.refresh_token,
    grant_type: "refresh_token",
  });

  if (token.error || !token.access_token) {
    const message =
      token.error === "invalid_grant"
        ? "Google access has expired or was revoked. Reconnect Google Calendar in Settings."
        : token.error_description || token.error || "Google would not refresh the access token.";
    await recordError(message);
    throw new Error(message);
  }

  const db = supabaseAdmin();
  await db
    .from("integration_credentials")
    .update({
      access_token: token.access_token,
      token_expires_at: expiryFrom(token.expires_in),
      last_error: null,
      last_error_at: null,
    })
    .eq("provider", "google");

  return { token: token.access_token, calendarId: row.calendar_id || "primary" };
}
