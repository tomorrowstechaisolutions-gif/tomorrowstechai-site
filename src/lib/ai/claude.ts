import Anthropic from "@anthropic-ai/sdk";

/**
 * Which Claude model each kind of job uses, and the request settings the
 * Claude 5.5 models need. One place to change them.
 *
 * - CLAUDE_FAST (Haiku 5.5): high-volume, short jobs - website chat, ad copy.
 * - CLAUDE_SMART (Sonnet 5.5): advisor, content, planning.
 *
 * Claude 5.5 models think by default (adaptive thinking), so a response can
 * start with `thinking` blocks: always read text blocks by `type`, and size
 * max_tokens for thinking plus the reply. `effort` is how much they think.
 * They reject `temperature` / `top_p` / `top_k` and assistant prefills, and
 * can decline a request with stop_reason "refusal".
 */

export const CLAUDE_FAST = "claude-haiku-5-5";
export const CLAUDE_SMART = "claude-sonnet-5-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** `output_config.effort`, spread into a messages.create() call. */
export function effort(level: Effort): { output_config: { effort: Effort } } {
  return { output_config: { effort: level } };
}

let shared: Anthropic | null = null;

/**
 * The one Anthropic client. Reads ANTHROPIC_API_KEY from the environment.
 * Shared so every caller gets the same retry and timeout settings instead of
 * each route building its own.
 */
export function anthropic(): Anthropic {
  if (!shared) shared = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return shared;
}

/** Claude 5-generation models reject sampling parameters. */
export function acceptsSampling(model: string): boolean {
  return !/^claude-(?:haiku|sonnet|opus|fable|mythos)-5/.test(model);
}

/** True when the model declined the request. */
export function refused(stopReason: string | null | undefined): boolean {
  return stopReason === "refusal";
}
