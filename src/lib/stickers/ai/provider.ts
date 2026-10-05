import type { AIStickerRequest, AIStickerResult } from "../types";

export type GeneratedStickerResult = AIStickerResult & {
  bytes?: Buffer;
  mimeType?: "image/png" | "image/jpeg";
  model?: string;
  providerGenerationId?: string;
};

export interface StickerAIProvider {
  readonly name: string;
  generate(input: AIStickerRequest): Promise<GeneratedStickerResult>;
}
