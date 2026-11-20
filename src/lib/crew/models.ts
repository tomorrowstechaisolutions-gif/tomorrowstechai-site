import type { Effort } from "@/lib/ai/claude";

/**
 * Which model each rank of the crew runs on. One place to change them.
 *
 * Tess plans, advises and talks to John, so she gets the stronger model. The
 * crew does narrower work many times a day, so it gets the cheaper one. Both
 * models think by default and reject sampling parameters, a thinking budget,
 * disabled thinking and a forced tool choice; effort is the only depth dial,
 * and it is set explicitly because the two models' defaults differ.
 */
export const TESS_MODEL = "claude-opus-5-5";
export const CREW_MODEL = "claude-sonnet-5-5";

export const TESS_EFFORT: Effort = "medium";
export const CREW_EFFORT: Effort = "low";

/** Dollars per million tokens, which is also millionths of a dollar per token. */
const PRICE: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
};

export type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * What one model call cost, in millionths of a dollar.
 *
 * The crew keeps its own tally (ai_runs.cost_micro_usd) so the daily spending
 * cap works even when no rate has been entered for a model in AI Solutions.
 * A model missing from the table is priced as the dearer one, so an unknown
 * model can only make the cap bite sooner, never later.
 */
export function costMicroUsd(model: string, usage: Usage): number {
  const p = PRICE[model] ?? PRICE[TESS_MODEL];
  const cost =
    (usage.input_tokens ?? 0) * p.input +
    (usage.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (usage.output_tokens ?? 0) * p.output;
  return Math.round(cost);
}
