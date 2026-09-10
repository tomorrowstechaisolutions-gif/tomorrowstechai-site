import "server-only";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { MICRO_PER_DOLLAR, type UsageStatus } from "./types";

/**
 * The usage recorder.
 *
 * Every Claude call in this codebase goes through here, which is the whole
 * reason the AI Solutions screen shows measured numbers instead of invented
 * ones. Before this existed there were six hard-coded API calls and no
 * record of what any of them cost.
 *
 * TWO RULES, both absolute:
 *
 * 1. IT NEVER THROWS. Recording usage is bookkeeping; if it fails, the
 *    feature the customer is using must still work. Every path here is
 *    wrapped and the worst case is a console line and a missing row.
 *
 * 2. IT NEVER BLOCKS. Callers fire it without awaiting, so a slow insert
 *    cannot add latency to a chat reply.
 *
 * COST is computed here and FROZEN onto the row, from the rate on
 * ai_models at the moment of the call — the same way an invoice freezes its
 * amounts. Re-deriving it later from today's rate card would silently
 * rewrite last month's costs. When no rate is set the cost is NULL, and
 * null renders as "Rate not set" rather than as zero.
 */

export type RecordUsageInput = {
  /** The ai_solutions.slug this call belongs to. */
  slug: string;
  model: string;
  providerKey?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  status?: UsageStatus;
  error?: string | null;
  eventType?: "message" | "run" | "tool_call" | "embedding" | "test" | "error";
  /** 'client' when an end user caused it, 'internal' when we did. */
  source?: "internal" | "client" | "test";
  /**
   * Opaque id that groups the turns of one conversation. Never anything
   * identifying — the caller passes a random id it generated.
   */
  conversationRef?: string | null;
  customerId?: string | null;
  /** Provider request id, for support tickets. Not a secret. */
  requestRef?: string | null;
  /** Non-secret descriptive facts only. Never a prompt body or a token. */
  metadata?: Record<string, string | number | boolean | null>;
};

type SolutionRef = { id: string; providerKey: string | null; model: string | null };
type Rate = { input: number | null; output: number | null };

const CACHE_MS = 5 * 60_000;

const solutionCache = new Map<string, { at: number; value: SolutionRef | null }>();
const rateCache = new Map<string, { at: number; value: Rate | null }>();

/** Keys we are willing to persist in metadata, so nothing leaks by accident. */
const ALLOWED_METADATA = new Set([
  "surface", "brand", "format", "count", "variant", "route", "cached",
  "history_length", "max_tokens", "stop_reason", "tool", "kind",
]);

function fresh<T>(entry: { at: number; value: T } | undefined): entry is { at: number; value: T } {
  return Boolean(entry && Date.now() - entry.at < CACHE_MS);
}

async function solutionBySlug(slug: string): Promise<SolutionRef | null> {
  const cached = solutionCache.get(slug);
  if (fresh(cached)) return cached.value;

  const { data, error } = await supabaseAdmin()
    .from("ai_solutions")
    .select("id, provider_key, model")
    .eq("slug", slug)
    .maybeSingle();

  const value = error || !data
    ? null
    : {
        id: (data as { id: string }).id,
        providerKey: (data as { provider_key: string | null }).provider_key,
        model: (data as { model: string | null }).model,
      };

  solutionCache.set(slug, { at: Date.now(), value });
  return value;
}

async function rateFor(providerKey: string, model: string): Promise<Rate | null> {
  const key = `${providerKey}:${model}`;
  const cached = rateCache.get(key);
  if (fresh(cached)) return cached.value;

  const { data, error } = await supabaseAdmin()
    .from("ai_models")
    .select("input_micro_usd_per_mtok, output_micro_usd_per_mtok")
    .eq("provider_key", providerKey)
    .eq("model", model)
    .maybeSingle();

  const value = error || !data
    ? null
    : {
        input: (data as { input_micro_usd_per_mtok: number | null }).input_micro_usd_per_mtok,
        output: (data as { output_micro_usd_per_mtok: number | null }).output_micro_usd_per_mtok,
      };

  rateCache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Tokens × rate, in micro-dollars.
 *
 * Returns null unless BOTH rates are set. Half a rate card produces a
 * number that looks like a cost and is not one, which is worse than
 * admitting the rate is missing.
 */
export function estimateCostMicroUsd(
  rate: Rate | null,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
): number | null {
  if (!rate || rate.input === null || rate.output === null) return null;
  const inTokens = inputTokens ?? 0;
  const outTokens = outputTokens ?? 0;
  const cost =
    (inTokens / 1_000_000) * rate.input + (outTokens / 1_000_000) * rate.output;
  return Math.max(0, Math.round(cost));
}

async function conversationId(
  solutionId: string,
  ref: string | null | undefined,
  customerId: string | null | undefined
): Promise<string | null> {
  if (!ref) return null;
  const db = supabaseAdmin();

  const { data: existing } = await db
    .from("ai_conversations")
    .select("id")
    .eq("solution_id", solutionId)
    .eq("external_ref", ref)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await db
    .from("ai_conversations")
    .insert({ solution_id: solutionId, external_ref: ref, customer_id: customerId ?? null })
    .select("id")
    .single();
  if (error) return null;
  return (created as { id: string }).id;
}

/**
 * Record one call. Await it only where you do not mind the millisecond;
 * the public chat route deliberately does not.
 */
export async function recordAiUsage(input: RecordUsageInput): Promise<void> {
  try {
    if (!supabaseConfigured()) return;

    const solution = await solutionBySlug(input.slug);
    if (!solution) {
      // A slug with no row is a wiring mistake, not a user-facing failure.
      console.warn("[ai:usage] no solution registered for slug", input.slug);
      return;
    }

    const providerKey = input.providerKey ?? solution.providerKey ?? "anthropic";
    const rate = await rateFor(providerKey, input.model);
    const cost = estimateCostMicroUsd(rate, input.inputTokens, input.outputTokens);

    const metadata: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(input.metadata ?? {})) {
      if (ALLOWED_METADATA.has(key)) metadata[key] = value;
    }

    const conversation = await conversationId(
      solution.id,
      input.conversationRef,
      input.customerId
    );

    const { error } = await supabaseAdmin().from("ai_usage_events").insert({
      solution_id: solution.id,
      conversation_id: conversation,
      customer_id: input.customerId ?? null,
      event_type: input.eventType ?? "message",
      provider_key: providerKey,
      model: input.model,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      cost_micro_usd: cost,
      latency_ms: input.latencyMs ?? null,
      status: input.status ?? "success",
      // Provider errors can carry a key in the message. Truncate and scrub.
      error: input.error ? scrub(input.error).slice(0, 500) : null,
      request_ref: input.requestRef ?? null,
      metadata,
      source: input.source ?? "internal",
    });

    if (error) console.error("[ai:usage]", error.message);
  } catch (err) {
    console.error("[ai:usage]", err instanceof Error ? err.message : err);
  }
}

/** Fire and forget, for hot paths that must not wait on bookkeeping. */
export function recordAiUsageAsync(input: RecordUsageInput): void {
  void recordAiUsage(input);
}

/** Anything that looks like a credential never reaches the database. */
export function scrub(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key["'\s:=]+)\S+/gi, "$1[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}/g, "[redacted]");
}

/** Dollars → micro-dollars, for the rate-card form. */
export function dollarsToMicro(value: number): number {
  return Math.round(value * MICRO_PER_DOLLAR);
}
