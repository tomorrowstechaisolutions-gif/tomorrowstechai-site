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

export type Effort = "low" | "medium" | "high";

/**
 * `output_config.effort`, spread into a messages.create() call. The SDK
 * pinned here (0.32) predates the field in its types, so it's passed through
 * untyped; the API reads it from the request body.
 */
export function effort(level: Effort): Record<string, never> {
  return { output_config: { effort: level } } as unknown as Record<string, never>;
}

/** Claude 5-generation models reject sampling parameters. */
export function acceptsSampling(model: string): boolean {
  return !/^claude-(?:haiku|sonnet|opus|fable|mythos)-5/.test(model);
}

/** True when the model declined the request (not in the pinned SDK's types). */
export function refused(stopReason: string | null | undefined): boolean {
  return stopReason === "refusal";
}
