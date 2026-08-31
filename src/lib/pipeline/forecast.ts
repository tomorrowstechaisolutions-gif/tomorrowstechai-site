import "server-only";

/**
 * Forecasting.
 *
 * Four numbers that people confuse constantly, kept distinct here because
 * the difference between them is the difference between a plan and a hope:
 *
 *   Pipeline    everything open. The optimistic ceiling.
 *   Weighted    value × probability. What the numbers say, if the
 *               probabilities mean anything.
 *   Best case   open deals expected to close in the period at 50%+.
 *   Commit      deals the owner has explicitly marked as expected to close.
 *               A PERSON's promise, not a formula. Deriving it from
 *               probability would make it a restatement of Weighted and
 *               destroy the only number here with a human behind it.
 *
 * And the rule for the gap: no target, no gap. `targetCents` is null until
 * somebody sets one, and every derived figure below it goes null too. An
 * invented target produces an invented gap, and that gap is what somebody
 * would rearrange their week around.
 */

export const STAGE_PROBABILITY: Record<string, number> = {
  new: 10,
  qualified: 25,
  discovery: 40,
  proposal: 60,
  negotiation: 80,
  won: 100,
  lost: 0,
  on_hold: 20,
};

export type ForecastDeal = {
  valueCents: number | null;
  billing: string;
  stage: string;
  probability: number | null;
  expectedClose: string | null;
  committed: boolean;
};

export type Forecast = {
  pipelineCents: number;
  weightedCents: number;
  bestCaseCents: number;
  commitCents: number;
  closedWonCents: number;
  targetCents: number | null;
  /** Target minus what is already won. Null without a target. */
  gapCents: number | null;
  /** Closed won as a share of target. Null without a target. */
  attainmentPct: number | null;
  /** Where the month lands if commit and closed-won both come in. */
  projectedPct: number | null;
};

/**
 * The probability actually used: the owner's override if there is one,
 * otherwise the stage default. Stored separately so "not set" stays
 * distinguishable from "set to the same number as the default".
 */
export function effectiveProbability(deal: { stage: string; probability: number | null }): number {
  if (deal.probability !== null) return deal.probability;
  return STAGE_PROBABILITY[deal.stage] ?? 20;
}

/**
 * A monthly deal and a one-off deal are not the same size.
 *
 * A $99/month hosting deal is worth $1,188 over a year; summing it raw
 * against a $4,000 build understates it fivefold. Annualising is the
 * convention that makes them comparable, and the screen says so.
 */
export function annualised(valueCents: number | null, billing: string): number {
  if (valueCents === null) return 0;
  return billing === "monthly" ? valueCents * 12 : valueCents;
}

export function weightedCents(deal: ForecastDeal): number {
  return Math.round((annualised(deal.valueCents, deal.billing) * effectiveProbability(deal)) / 100);
}

const OPEN = ["new", "qualified", "discovery", "proposal", "negotiation", "on_hold"];

export function forecast(input: {
  deals: ForecastDeal[];
  /** Deals won inside the reporting period. */
  wonInPeriod: { valueCents: number | null; billing: string }[];
  periodEnd: Date;
  targetCents: number | null;
}): Forecast {
  const { deals, wonInPeriod, periodEnd, targetCents } = input;

  const open = deals.filter((d) => OPEN.includes(d.stage));

  const pipelineCents = open.reduce((t, d) => t + annualised(d.valueCents, d.billing), 0);
  const weighted = open.reduce((t, d) => t + weightedCents(d), 0);

  // Best case: open, expected to land inside the period, and better than a
  // coin toss. A deal with no close date is not counted — "someday" is not
  // a forecast.
  const bestCase = open
    .filter((d) => {
      if (!d.expectedClose) return false;
      if (new Date(d.expectedClose) > periodEnd) return false;
      return effectiveProbability(d) >= 50;
    })
    .reduce((t, d) => t + annualised(d.valueCents, d.billing), 0);

  const commit = open
    .filter((d) => d.committed)
    .reduce((t, d) => t + annualised(d.valueCents, d.billing), 0);

  const closedWon = wonInPeriod.reduce((t, d) => t + annualised(d.valueCents, d.billing), 0);

  return {
    pipelineCents,
    weightedCents: weighted,
    bestCaseCents: bestCase,
    commitCents: commit,
    closedWonCents: closedWon,
    targetCents,
    gapCents: targetCents === null ? null : targetCents - closedWon,
    attainmentPct: targetCents === null || targetCents === 0 ? null : closedWon / targetCents,
    projectedPct:
      targetCents === null || targetCents === 0 ? null : (closedWon + commit) / targetCents,
  };
}

/**
 * Stage-to-stage conversion, from the transition log rather than from a
 * snapshot of who is standing where.
 *
 * Counting current occupancy cannot answer this. If 24 deals entered
 * Qualified and 17 went on to Discovery, most of those 24 have since moved
 * past or out, so today's Qualified column knows nothing about them. Only
 * the log of the moves themselves does.
 */
export function conversion(
  history: { from_stage: string | null; to_stage: string }[],
  from: string,
  to: string
): { pct: number | null; moved: number; entered: number } {
  const entered = history.filter((h) => h.to_stage === from).length;
  const moved = history.filter((h) => h.from_stage === from && h.to_stage === to).length;
  return { pct: entered > 0 ? moved / entered : null, moved, entered };
}
