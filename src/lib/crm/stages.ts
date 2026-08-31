/**
 * The deal stage vocabulary.
 *
 * These are deliberately the same five the dashboard pipeline already uses
 * (src/lib/dashboard/sales.ts), plus negotiation and the two terminal states.
 * One funnel, one set of words: if the CRM invented its own stage names the
 * two screens would describe the same business differently and nobody could
 * say which was right.
 */

export type DealStage =
  | "new" | "qualified" | "discovery" | "proposal"
  | "negotiation" | "won" | "lost" | "on_hold";

export const DEAL_STAGES: { key: DealStage; label: string; open: boolean }[] = [
  { key: "new", label: "New", open: true },
  { key: "qualified", label: "Qualified", open: true },
  { key: "discovery", label: "Discovery", open: true },
  { key: "proposal", label: "Proposal sent", open: true },
  { key: "negotiation", label: "Negotiation", open: true },
  { key: "won", label: "Won", open: false },
  { key: "lost", label: "Lost", open: false },
  { key: "on_hold", label: "On hold", open: false },
];

export const STAGE_LABELS: Record<DealStage, string> = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.key, s.label])
) as Record<DealStage, string>;

/** Stages a deal can still be won from. */
export const OPEN_STAGES: DealStage[] = DEAL_STAGES.filter((s) => s.open).map((s) => s.key);

export const STAGE_TONE: Record<DealStage, string> = {
  new: "t-muted",
  qualified: "t-info",
  discovery: "t-info",
  proposal: "t-warn",
  negotiation: "t-warn",
  won: "t-ok",
  lost: "t-risk",
  on_hold: "t-muted",
};

/**
 * The nine lead statuses, mapped onto the same stage words.
 *
 * A lead that has no deal yet still sits somewhere in the funnel, and the
 * CRM should be able to show it there rather than pretending nothing is
 * happening until somebody creates a deal row.
 */
export const LEAD_STATUS_STAGE: Record<string, DealStage> = {
  "New": "new",
  "Contact Attempted": "new",
  "Contacted": "qualified",
  "Qualified": "qualified",
  "Demo Scheduled": "discovery",
  "Proposal/Checkout Sent": "proposal",
  "Won": "won",
  "Lost": "lost",
  "Follow Up Later": "on_hold",
};

/**
 * A monthly deal and a one-off deal are not the same size.
 *
 * Summing $99/month next to $3,990 one-off would overstate a pipeline badly
 * in one direction and understate it in the other. Annualising recurring
 * work is the convention that makes them comparable, and saying so on screen
 * is what stops the number being a surprise.
 */
export function comparableCents(valueCents: number | null, billing: string): number {
  if (valueCents === null) return 0;
  return billing === "monthly" ? valueCents * 12 : valueCents;
}

/**
 * The reasons a deal is lost.
 *
 * A short fixed list rather than free text, because "what are we losing deals
 * over" is a counting question and free text does not count. Lives here, in a
 * plain module, so both the form that offers them and the server action that
 * validates them read the same list — and because a "use server" file may
 * only export async functions, so a constant cannot live beside the action.
 */
export const LOST_REASONS = [
  "Price", "Timing", "No budget", "Chose competitor",
  "No response", "Scope or fit", "Internal delay", "Duplicate", "Other",
];
