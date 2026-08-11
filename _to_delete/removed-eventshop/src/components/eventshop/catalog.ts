/**
 * Lone Star Loud — event shop catalog.
 *
 * This file is the single source of truth for what is for sale and what it
 * costs. The client renders from it AND the Stripe checkout route re-reads it
 * server-side to price every line item, so a tampered client payload can never
 * change what a customer is charged.
 */

export type DesignId =
  | "dont-dan"
  | "stars-at-night"
  | "not-my-kind"
  | "ditch-dan"
  | "lone-star-no-dan"
  | "boot-dan";

export type ShirtColor = {
  id: string;
  name: string;
  /** Fabric color used for the swatch dot and the product plate background. */
  hex: string;
};

export const SHIRT_COLORS: ShirtColor[] = [
  { id: "black", name: "Black", hex: "#121215" },
  { id: "charcoal", name: "Charcoal", hex: "#44474e" },
  { id: "navy", name: "Navy", hex: "#1b2c4d" },
  { id: "red", name: "Brick Red", hex: "#8f1d24" },
];

export const SHIRT_SIZES = ["S", "M", "L", "XL", "2XL"] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

export type Product = {
  id: DesignId;
  /** Display name, line 1. */
  name: string;
  /** Display name, line 2 (optional second line in the card). */
  name2?: string;
  /** Price in cents. Server-authoritative. */
  price: number;
  /**
   * Optional override artwork. Drop a transparent PNG in
   * /public/eventshop/ and set this to e.g. "/eventshop/dont-dan.png" —
   * the coded SVG is replaced automatically, nothing else changes.
   */
  image?: string;
  /** Default plate background so the grid alternates like the mockup. */
  plate: "black" | "navy";
};

export const PRODUCTS: Product[] = [
  { id: "dont-dan", name: "Don't Dan", name2: "My Texas", price: 2999, plate: "black" },
  { id: "stars-at-night", name: "The Stars At Night...", name2: "Don't Vote For Dan", price: 2999, plate: "navy" },
  { id: "not-my-kind", name: "Not My Kind", name2: "Of Texas", price: 2999, plate: "black" },
  { id: "ditch-dan", name: "Ditch Dan", name2: "For Texas", price: 2999, plate: "navy" },
  { id: "lone-star-no-dan", name: "Lone Star.", name2: "No Dan.", price: 2999, plate: "black" },
  { id: "boot-dan", name: "Boot Dan", price: 2999, plate: "black" },
];

export const PRODUCTS_BY_ID: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p])
);

export function colorName(id: string): string {
  return SHIRT_COLORS.find((c) => c.id === id)?.name ?? id;
}

export function colorHex(id: string): string {
  return SHIRT_COLORS.find((c) => c.id === id)?.hex ?? "#121215";
}

export function formatUSD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Full display title for a configured line item, used on the Stripe receipt. */
export function lineTitle(productId: string, color: string, size: string): string {
  const p = PRODUCTS_BY_ID[productId];
  const base = p ? [p.name, p.name2].filter(Boolean).join(" ") : productId;
  return `${base} — ${colorName(color)} / ${size}`;
}
