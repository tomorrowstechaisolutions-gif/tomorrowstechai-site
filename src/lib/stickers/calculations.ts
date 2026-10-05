import { stickerPricing, STICKER_TYPE_LABELS } from "./pricing";
import type { PriceBreakdown, StickerSelection } from "./types";

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function calculateStickerPrice(selection: StickerSelection): PriceBreakdown {
  const knownSize = Object.entries(stickerPricing.baseUnitBySize).find(
    ([size]) => Number(size) === selection.width && selection.width === selection.height
  );
  const baseUnitCents = knownSize
    ? knownSize[1]
    : Math.max(28, selection.width * selection.height * stickerPricing.customSizeBasePerSquareInch);
  const quantityTier = stickerPricing.quantityMultiplier.find(
    (tier) => selection.quantity >= tier.min
  );
  const quantityMultiplier = quantityTier?.multiplier ?? 2.8;
  const unitCents = baseUnitCents * stickerPricing.typeMultiplier[selection.stickerType] * quantityMultiplier;
  const subtotalCents = Math.max(
    stickerPricing.minimumSubtotal,
    Math.round(unitCents * selection.quantity)
  );
  const designFeeCents = stickerPricing.designFee[selection.designMethod];

  return {
    unitPrice: roundCurrency(subtotalCents / selection.quantity / 100),
    designFee: designFeeCents / 100,
    subtotal: subtotalCents / 100,
    total: (subtotalCents + designFeeCents) / 100,
    currency: "USD",
  };
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatDimensions(width: number, height: number) {
  return width === height ? `${width}\u2033` : `${width}\u2033 \u00d7 ${height}\u2033`;
}

export function orderTitle(selection: StickerSelection) {
  const label = STICKER_TYPE_LABELS[selection.stickerType];
  const cutPrefix = selection.stickerType.includes("cut") ? "" : "Die-Cut ";
  return `${formatDimensions(selection.width, selection.height)} ${cutPrefix}${label} Stickers`;
}
