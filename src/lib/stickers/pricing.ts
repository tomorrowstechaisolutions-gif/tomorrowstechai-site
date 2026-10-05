import type { DesignMethod, StickerType } from "./types";

export const stickerPricing = {
  /** Base unit price in cents at the 100-piece tier. */
  baseUnitBySize: {
    2: 34,
    2.5: 41,
    3: 48,
    4: 67,
    5: 86,
  },
  customSizeBasePerSquareInch: 5.35,
  typeMultiplier: {
    "standard-vinyl": 1,
    "laminated-vinyl": 1.0415,
    waterproof: 1.12,
    clear: 1.16,
    holographic: 1.38,
    matte: 1.08,
    gloss: 1.06,
    "die-cut": 1.18,
    "kiss-cut": 1.1,
  } satisfies Record<StickerType, number>,
  quantityMultiplier: [
    { min: 500, multiplier: 0.72 },
    { min: 250, multiplier: 0.82 },
    { min: 100, multiplier: 1 },
    { min: 50, multiplier: 1.28 },
    { min: 25, multiplier: 1.7 },
    { min: 10, multiplier: 2.4 },
  ],
  designFee: {
    upload: 0,
    "design-service": 7500,
    ai: 0,
  } satisfies Record<DesignMethod, number>,
  minimumSubtotal: 1200,
} as const;

export const STICKER_TYPE_LABELS: Record<StickerType, string> = {
  "standard-vinyl": "Standard Vinyl",
  "laminated-vinyl": "Laminated Vinyl",
  waterproof: "Waterproof",
  clear: "Clear",
  holographic: "Holographic",
  matte: "Matte",
  gloss: "Gloss",
  "die-cut": "Die Cut",
  "kiss-cut": "Kiss Cut",
};
