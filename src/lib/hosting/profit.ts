import "server-only";

/**
 * Per-account profitability.
 *
 * The rule that shapes this whole file: a margin computed from costs nobody
 * entered is a fabricated number, and a fabricated margin is worse than no
 * margin — it is the number you would price against.
 *
 * So `grossCents` and `marginPct` are `number | null`, and they are null
 * whenever the cost side is unknown. The UI prints "Cost unknown" and shows
 * revenue on its own. The moment a cost line exists, the arithmetic becomes
 * real and the same fields fill in with no other change.
 *
 * Stripe's fee is the one cost that CAN be derived without being told: it is
 * a published formula on money we know we collected. It is computed here and
 * labelled as an estimate, because the exact fee depends on card type and is
 * only knowable from the balance transaction.
 */

/** Stripe US standard: 2.9% + 30c on a successful card charge. */
const STRIPE_PCT = 0.029;
const STRIPE_FIXED_CENTS = 30;

export type CostLine = {
  label: string;
  category: string;
  amountCents: number;
  interval: "monthly" | "annual" | "one_time";
  vendor: string | null;
};

export type Profitability = {
  /** What the client pays us per month. Null when no price is known. */
  revenueCents: number | null;

  /** Recorded costs, normalised to a month. Null when none are recorded. */
  costCents: number | null;
  /** Every recorded cost, normalised, so the panel can show the breakdown. */
  lines: { label: string; monthlyCents: number; category: string }[];

  /** Derived, not recorded — and flagged as an estimate wherever shown. */
  processingCents: number | null;

  grossCents: number | null;
  marginPct: number | null;

  /** Why the margin is null, in a sentence the screen can print. */
  unknownReason: string | null;
};

/** A cost of any interval, as it lands on one month. */
export function monthlyCents(amountCents: number, interval: CostLine["interval"]): number {
  if (interval === "monthly") return amountCents;
  if (interval === "annual") return Math.round(amountCents / 12);
  // A one-off cost is not a monthly cost. It belongs in lifetime value, not
  // in a monthly margin, so it contributes nothing here.
  return 0;
}

export function computeProfit(input: {
  revenueCents: number | null;
  costs: CostLine[];
  /** False when we do not actually collect this through Stripe. */
  billedThroughStripe: boolean;
}): Profitability {
  const { revenueCents, costs, billedThroughStripe } = input;

  const lines = costs
    .map((c) => ({
      label: c.label,
      category: c.category,
      monthlyCents: monthlyCents(c.amountCents, c.interval),
    }))
    .filter((l) => l.monthlyCents > 0);

  const recordedCents = lines.length > 0 ? lines.reduce((t, l) => t + l.monthlyCents, 0) : null;

  const processingCents =
    revenueCents !== null && revenueCents > 0 && billedThroughStripe
      ? Math.round(revenueCents * STRIPE_PCT) + STRIPE_FIXED_CENTS
      : null;

  if (revenueCents === null) {
    return {
      revenueCents: null,
      costCents: recordedCents,
      lines,
      processingCents,
      grossCents: null,
      marginPct: null,
      unknownReason: "No recurring price is known for this account.",
    };
  }

  if (recordedCents === null) {
    return {
      revenueCents,
      costCents: null,
      lines,
      processingCents,
      grossCents: null,
      marginPct: null,
      unknownReason: "No costs have been recorded, so margin cannot be calculated.",
    };
  }

  const totalCost = recordedCents + (processingCents ?? 0);
  const gross = revenueCents - totalCost;

  return {
    revenueCents,
    costCents: recordedCents,
    lines,
    processingCents,
    grossCents: gross,
    marginPct: revenueCents > 0 ? gross / revenueCents : null,
    unknownReason: null,
  };
}

export function marginBand(pct: number | null): "strong" | "thin" | "negative" | "unknown" {
  if (pct === null) return "unknown";
  if (pct < 0) return "negative";
  if (pct < 0.4) return "thin";
  return "strong";
}
