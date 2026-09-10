import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrub } from "./record";
import type { ProviderStatus } from "./types";

/**
 * Provider connections.
 *
 * THE SECURITY RULE: a provider key never leaves the server and is never
 * stored in this database. The keys are environment variables on the
 * server; `ai_providers.credential_env` records WHICH variable, never its
 * value. Nothing in this file returns a key, and "server-only" makes
 * importing it into a client component a build error rather than a code
 * review.
 *
 * THE HONESTY RULE (§35): provider status comes from an actual call, or it
 * is Unknown. There is no path here that marks a provider operational
 * because it is in a list, because a key is present, or because it worked
 * last week. `checkProvider` makes a real request; everything else reads
 * what that request last found.
 *
 * THE PERFORMANCE RULE (§42): page loads read STORED state. Live checks
 * happen on the Test button and in the nightly job, and write their answer
 * back. A provider being slow can never make this admin slow.
 */

export type ProviderRow = {
  key: string;
  name: string;
  description: string | null;
  credentialEnv: string | null;
  /** True when the env var is set on this server. Never the value. */
  keyPresent: boolean;
  enabled: boolean;
  status: ProviderStatus;
  statusDetail: string | null;
  lastCheckedAt: string | null;
  quotaLimitMicroUsd: number | null;
  quotaUsedMicroUsd: number | null;
  docsUrl: string | null;
  models: {
    model: string;
    displayName: string | null;
    inputRate: number | null;
    outputRate: number | null;
    isDefault: boolean;
    active: boolean;
    deprecatedOn: string | null;
  }[];
};

export type CheckResult = {
  status: ProviderStatus;
  detail: string;
  models?: string[];
};

const TIMEOUT_MS = 12_000;

/** Reads the env var by NAME. The value is used and discarded, never returned. */
function keyFor(envName: string | null): string | null {
  if (!envName) return null;
  // Only names we expect, so a database row can never make the server read
  // an arbitrary environment variable.
  const allowed: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
  };
  const value = allowed[envName];
  return value && value.trim() ? value.trim() : null;
}

/** Everything the screens need, from stored state. Calls no provider. */
export async function loadProviders(): Promise<ProviderRow[]> {
  const db = supabaseAdmin();
  const [{ data: providers, error }, { data: models }] = await Promise.all([
    db.from("ai_providers").select("*").order("sort_order").order("name"),
    db.from("ai_models").select("*").order("provider_key").order("model"),
  ]);
  if (error) throw new Error(`providers: ${error.message}`);

  type ModelRaw = {
    provider_key: string; model: string; display_name: string | null;
    input_micro_usd_per_mtok: number | null; output_micro_usd_per_mtok: number | null;
    is_default: boolean; active: boolean; deprecated_on: string | null;
  };
  const byProvider = new Map<string, ModelRaw[]>();
  for (const model of (models ?? []) as ModelRaw[]) {
    byProvider.set(model.provider_key, [...(byProvider.get(model.provider_key) ?? []), model]);
  }

  return ((providers ?? []) as Record<string, never>[]).map((raw) => {
    const row = raw as unknown as Record<string, string | number | boolean | null>;
    const credentialEnv = (row.credential_env as string | null) ?? null;
    return {
      key: row.key as string,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      credentialEnv,
      keyPresent: Boolean(keyFor(credentialEnv)),
      enabled: Boolean(row.enabled),
      status: (row.status as ProviderStatus) ?? "unknown",
      statusDetail: (row.status_detail as string | null) ?? null,
      lastCheckedAt: (row.last_checked_at as string | null) ?? null,
      quotaLimitMicroUsd: (row.quota_limit_micro_usd as number | null) ?? null,
      quotaUsedMicroUsd: (row.quota_used_micro_usd as number | null) ?? null,
      docsUrl: (row.docs_url as string | null) ?? null,
      models: (byProvider.get(row.key as string) ?? []).map((m) => ({
        model: m.model,
        displayName: m.display_name,
        inputRate: m.input_micro_usd_per_mtok,
        outputRate: m.output_micro_usd_per_mtok,
        isDefault: m.is_default,
        active: m.active,
        deprecatedOn: m.deprecated_on,
      })),
    };
  });
}

/**
 * A real request to the provider.
 *
 * Each check is a cheap read — a model list, not a completion — so testing
 * a connection does not spend money. If a provider has no such endpoint we
 * say the connection cannot be verified rather than guessing from the
 * presence of a key.
 */
export async function checkProvider(providerKey: string): Promise<CheckResult> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("ai_providers")
    .select("credential_env, name, enabled")
    .eq("key", providerKey)
    .maybeSingle();

  const row = data as { credential_env: string | null; name: string; enabled: boolean } | null;
  if (!row) return { status: "unknown", detail: "No such provider." };
  if (!row.enabled) return { status: "not_configured", detail: "Disabled." };

  const key = keyFor(row.credential_env);
  if (!key) {
    return {
      status: "not_configured",
      detail: row.credential_env
        ? `${row.credential_env} is not set on this server.`
        : "No credential environment variable is recorded for this provider.",
    };
  }

  try {
    switch (providerKey) {
      case "anthropic": {
        const response = await fetch("https://api.anthropic.com/v1/models?limit=20", {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 401 || response.status === 403) {
          return { status: "disconnected", detail: "The API key was rejected." };
        }
        if (!response.ok) {
          return { status: "warning", detail: `The API answered ${response.status}.` };
        }
        const body = (await response.json()) as { data?: { id: string }[] };
        const models = (body.data ?? []).map((m) => m.id);
        return {
          status: "operational",
          detail: `Answered with ${models.length} available ${models.length === 1 ? "model" : "models"}.`,
          models,
        };
      }

      case "openai": {
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 401 || response.status === 403) {
          return { status: "disconnected", detail: "The API key was rejected." };
        }
        if (!response.ok) return { status: "warning", detail: `The API answered ${response.status}.` };
        const body = (await response.json()) as { data?: { id: string }[] };
        const models = (body.data ?? []).map((m) => m.id);
        return { status: "operational", detail: `Answered with ${models.length} models.`, models };
      }

      case "google": {
        const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
        url.searchParams.set("key", key);
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          return { status: "disconnected", detail: "The API key was rejected." };
        }
        if (!response.ok) return { status: "warning", detail: `The API answered ${response.status}.` };
        const body = (await response.json()) as { models?: { name: string }[] };
        const models = (body.models ?? []).map((m) => m.name.replace(/^models\//, ""));
        return { status: "operational", detail: `Answered with ${models.length} models.`, models };
      }

      default:
        // No cheap read endpoint we are confident about. Saying so is the
        // honest answer; the alternative is calling a key "operational"
        // because it exists, which is exactly what §35 forbids.
        return {
          status: "unknown",
          detail: "A key is configured, but this provider has no free endpoint to verify it against, so the connection is unverified.",
        };
    }
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError"
      ? `No response within ${TIMEOUT_MS / 1000}s.`
      : scrub(err instanceof Error ? err.message : "The request failed.");
    return { status: "disconnected", detail: message.slice(0, 300) };
  }
}

/**
 * Check a provider and write the answer back.
 *
 * New models the provider reports are recorded with NO RATE, so they can
 * be selected but do not silently start producing cost estimates from a
 * price nobody entered.
 */
export async function checkAndStoreProvider(providerKey: string): Promise<CheckResult> {
  const result = await checkProvider(providerKey);
  const db = supabaseAdmin();

  await db
    .from("ai_providers")
    .update({
      status: result.status,
      status_detail: result.detail.slice(0, 500),
      last_checked_at: new Date().toISOString(),
    })
    .eq("key", providerKey);

  if (result.models?.length) {
    const { data: known } = await db
      .from("ai_models")
      .select("model")
      .eq("provider_key", providerKey);
    const have = new Set(((known ?? []) as { model: string }[]).map((m) => m.model));
    const missing = result.models
      .filter((model) => !have.has(model))
      .slice(0, 60)
      .map((model) => ({
        provider_key: providerKey,
        model,
        display_name: null,
        active: true,
        notes: "Discovered from the provider. Enter a rate before its cost is estimated.",
      }));
    if (missing.length) await db.from("ai_models").insert(missing);
  }

  return result;
}

export async function checkAllProviders(): Promise<Record<string, CheckResult>> {
  const db = supabaseAdmin();
  const { data } = await db.from("ai_providers").select("key").eq("enabled", true);
  const keys = ((data ?? []) as { key: string }[]).map((row) => row.key);

  const results: Record<string, CheckResult> = {};
  for (const key of keys) {
    results[key] = await checkAndStoreProvider(key).catch((err) => ({
      status: "unknown" as ProviderStatus,
      detail: scrub(err instanceof Error ? err.message : "Check failed."),
    }));
  }
  return results;
}
