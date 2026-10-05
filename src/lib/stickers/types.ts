export const STICKER_TYPES = [
  "standard-vinyl",
  "laminated-vinyl",
  "waterproof",
  "clear",
  "holographic",
  "matte",
  "gloss",
  "die-cut",
  "kiss-cut",
] as const;

export type StickerType = (typeof STICKER_TYPES)[number];
export type DesignMethod = "upload" | "design-service" | "ai";
export type StickerOrderStatus =
  | "draft"
  | "design_pending"
  | "design_review"
  | "approved"
  | "paid"
  | "in_production"
  | "ready"
  | "shipped"
  | "completed"
  | "cancelled";

export type StickerSelection = {
  stickerType: StickerType;
  width: number;
  height: number;
  quantity: number;
  designMethod: DesignMethod;
};

export type PriceBreakdown = {
  unitPrice: number;
  designFee: number;
  subtotal: number;
  total: number;
  currency: "USD";
};

export type ArtworkState = {
  previewUrl: string | null;
  originalFile: File | null;
  fileName: string | null;
  widthPx: number | null;
  heightPx: number | null;
  source: DesignMethod | null;
  aiPrompt?: string;
  aiGenerationId?: string;
};

export type DesignRequest = {
  businessName: string;
  stickerText: string;
  industry: string;
  colors: string;
  style: string;
  logo: File | null;
  qrCodeUrl: string;
  instructions: string;
};

export type StickerOrder = {
  id: string;
  customerId: string | null;
  stickerType: StickerType;
  finish: string | null;
  width: number;
  height: number;
  quantity: number;
  designMethod: DesignMethod;
  artworkUrl: string | null;
  originalArtworkUrl: string | null;
  aiPrompt: string | null;
  aiGenerationId: string | null;
  qrCodeUrl: string | null;
  designInstructions: string | null;
  unitPrice: number;
  designFee: number;
  subtotal: number;
  total: number;
  productionNotes: string | null;
  status: StickerOrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type AIStickerRequest = {
  businessName: string;
  stickerText: string;
  prompt: string;
  style: string;
  colorPreference: string;
  shape: string;
  includeQrCode: boolean;
  qrCodeUrl?: string;
};

export type AIStickerResult = {
  id: string;
  imageUrl: string;
  prompt: string;
  provider: string;
};
