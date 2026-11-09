/**
 * Partner vocabulary and the split. A plain module: forms and server code
 * both import it.
 */

export const RELATIONSHIP_LABELS: Record<string, string> = {
  client: "Client",
  white_label: "White-label channel",
  revenue_share: "Revenue share",
  conference: "Conference partner",
};

export const FEE_BASIS_LABELS: Record<string, string> = {
  processing_only: "after payment-processing fees",
  processing_and_direct: "after processing fees and direct costs",
  gross: "of the gross sale",
};

export const SETTLEMENT_LABELS: Record<string, string> = {
  stripe_connect_on_sale: "Split automatically at sale (Stripe Connect)",
  monthly_statement: "Monthly statement",
  manual: "Recorded by hand",
};

/** The partner's campaign statuses this admin may push back. */
export const PARTNER_CAMPAIGN_STATUSES = [
  "planning", "awaiting-assets", "in-production", "awaiting-approval",
  "active", "paused", "completed", "cancelled",
] as const;

export const SETTLEMENT_STATUS_TONE: Record<string, string> = {
  pending: "t-warn",
  paid: "t-ok",
  reversed: "t-risk",
  partially_reversed: "t-warn",
};

/**
 * The split, in whole cents. Our share is rounded half-up; theirs is the
 * remainder, so the two ALWAYS add back to the net exactly — the same
 * invariant the table's check constraint enforces.
 */
export function splitSale(saleCents: number, feeCents: number, ourPct: number): {
  netCents: number; ourCents: number; theirCents: number;
} {
  const sale = Math.max(0, Math.round(saleCents));
  const fee = Math.min(sale, Math.max(0, Math.round(feeCents)));
  const net = sale - fee;
  const ours = Math.min(net, Math.max(0, Math.round((net * ourPct) / 100)));
  return { netCents: net, ourCents: ours, theirCents: net - ours };
}

export function money(cents: number | null | undefined, currency = "usd"): string {
  return ((cents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase() });
}
