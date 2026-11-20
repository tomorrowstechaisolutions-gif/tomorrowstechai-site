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
