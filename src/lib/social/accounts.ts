import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import type { SocialPlatform } from "./types";

/**
 * The one place social tokens are written or read.
 *
 * social_accounts is the public-safe half (an admin session can read it);
 * social_account_tokens holds the encrypted secret half and is service-role
 * only. Callers get a decrypted token for one account at the moment they
 * publish, and nothing else.
 */

export type SocialProvider = "meta" | "linkedin";

/** Thrown when the provider says the token is dead, so the account can be flagged for reconnect. */
export class SocialAuthError extends Error {}

export type ConnectedAccountInput = {
  customerId: string | null;
  platform: SocialPlatform;
  provider: SocialProvider;
  externalId: string;
  externalPageId?: string | null;
  displayName: string;
  handle: string;
  profileImageUrl?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  scopes: string[];
  providerUserId?: string | null;
  actor: string | null;
};

/**
 * Creates or updates the social_accounts row for a freshly authorized account
 * and stores its token. Matching order: same external id → an unconnected
 * placeholder registered by hand for this platform/client → a new row. That
 * way a "registered, not connected" row becomes the live one instead of
 * lingering as a permanent "disconnected" warning.
 */
export async function saveConnectedAccount(input: ConnectedAccountInput): Promise<string> {
  const sb = supabaseAdmin();
  let externalQuery = sb.from("social_accounts").select("id").eq("platform", input.platform).eq("external_id", input.externalId);
  externalQuery = input.customerId ? externalQuery.eq("customer_id", input.customerId) : externalQuery.is("customer_id", null);
  const { data: byExternal } = await externalQuery.limit(1).maybeSingle();

  let id = byExternal?.id as string | undefined;
  if (!id) {
    let placeholderQuery = sb.from("social_accounts").select("id").eq("platform", input.platform).eq("connected", false).is("external_id", null);
    placeholderQuery = input.customerId ? placeholderQuery.eq("customer_id", input.customerId) : placeholderQuery.is("customer_id", null);
    const { data: placeholder } = await placeholderQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();
    id = placeholder?.id as string | undefined;
  }

  const fields = {
    customer_id: input.customerId,
    platform: input.platform,
    external_id: input.externalId,
    external_page_id: input.externalPageId ?? null,
    display_name: input.displayName,
    handle: input.handle,
    profile_image_url: input.profileImageUrl ?? null,
    connected: true,
    status: "connected",
    posting_enabled: true,
    permissions: input.scopes,
    token_expires_at: input.tokenExpiresAt ?? null,
    connection_error: null,
    last_synced_at: new Date().toISOString(),
    notes: `Connected via ${input.provider === "meta" ? "Meta" : "LinkedIn"} OAuth${input.actor ? ` by ${input.actor}` : ""}.`,
  };

  if (id) {
    const { error } = await sb.from("social_accounts").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb.from("social_accounts").insert(fields).select("id").single();
    if (error || !data) throw new Error(error?.message || "Could not save the social account.");
    id = data.id as string;
  }

  const { error: tokenError } = await sb.from("social_account_tokens").upsert({
    social_account_id: id,
    provider: input.provider,
    access_token: encryptSecret(input.accessToken, "social account"),
    refresh_token: input.refreshToken ? encryptSecret(input.refreshToken, "social account") : null,
    token_expires_at: input.tokenExpiresAt ?? null,
    scope: input.scopes.join(" "),
    provider_user_id: input.providerUserId ?? null,
    connected_by: input.actor,
  }, { onConflict: "social_account_id" });
  if (tokenError) throw new Error(tokenError.message);

  await sb.from("social_activity_events").insert({
    event_type: "account_connected",
    actor: input.actor,
    customer_id: input.customerId,
    account_id: id,
    platform: input.platform,
    detail: `${input.displayName} connected for publishing.`,
  });
  return id;
}

export type StoredToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  providerUserId: string | null;
};

export async function readAccountToken(accountId: string): Promise<StoredToken> {
  const { data, error } = await supabaseAdmin()
    .from("social_account_tokens")
    .select("access_token, refresh_token, token_expires_at, provider_user_id")
    .eq("social_account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new SocialAuthError("No stored credential for this account. Reconnect it in Social Center.");
  return {
    accessToken: decryptSecret(data.access_token, "social account")!,
    refreshToken: decryptSecret(data.refresh_token, "social account"),
    expiresAt: data.token_expires_at,
    providerUserId: data.provider_user_id,
  };
}

export async function updateAccountToken(accountId: string, token: { accessToken: string; refreshToken?: string | null; expiresAt: string | null }) {
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = {
    access_token: encryptSecret(token.accessToken, "social account"),
    token_expires_at: token.expiresAt,
  };
  if (token.refreshToken) patch.refresh_token = encryptSecret(token.refreshToken, "social account");
  await sb.from("social_account_tokens").update(patch).eq("social_account_id", accountId);
  await sb.from("social_accounts").update({ token_expires_at: token.expiresAt }).eq("id", accountId);
}

/** Flags an account whose token the provider rejected, so Needs Attention shows "reconnect". */
export async function markAccountExpired(accountId: string, message: string) {
  await supabaseAdmin()
    .from("social_accounts")
    .update({ status: "expired", connected: false, connection_error: message.slice(0, 500) })
    .eq("id", accountId);
}
