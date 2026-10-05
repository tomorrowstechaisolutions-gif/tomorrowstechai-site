import type { ArtworkState, StickerSelection } from "./types";

export const ACCEPTED_ARTWORK_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "image/svg+xml",
];

export const MAX_ARTWORK_BYTES = 25 * 1024 * 1024;

export function validateArtworkFile(file: File) {
  if (!ACCEPTED_ARTWORK_TYPES.includes(file.type)) {
    return "Use a PNG, JPG, JPEG, PDF, or SVG file.";
  }
  if (file.size > MAX_ARTWORK_BYTES) {
    return "Artwork must be 25 MB or smaller.";
  }
  return null;
}

export function getPrintWarnings(artwork: ArtworkState, selection: StickerSelection) {
  const warnings: string[] = [];
  if (artwork.widthPx && artwork.heightPx) {
    const widthDpi = artwork.widthPx / selection.width;
    const heightDpi = artwork.heightPx / selection.height;
    const effectiveDpi = Math.floor(Math.min(widthDpi, heightDpi));
    if (effectiveDpi < 300) {
      warnings.push(
        `Estimated ${effectiveDpi} DPI at the selected size. We recommend 300 DPI for print.`
      );
    }
  }
  if (!artwork.previewUrl) {
    warnings.push("Add artwork or choose a design service before checkout.");
  }
  warnings.push("Final artwork is reviewed for bleed, cut line, safe zone, and color before production.");
  return warnings;
}
