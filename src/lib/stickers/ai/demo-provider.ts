import type { AIStickerRequest, AIStickerResult } from "../types";
import type { StickerAIProvider } from "./provider";

/**
 * Safe local provider used until a production image provider is configured.
 * It deliberately returns a branded preview asset while preserving the exact
 * provider boundary the production adapter will implement.
 */
export class DemoStickerAIProvider implements StickerAIProvider {
  readonly name = "demo";

  async generate(input: AIStickerRequest): Promise<AIStickerResult> {
    return {
      id: crypto.randomUUID(),
      imageUrl: "/brand/mark.png",
      prompt: input.prompt,
      provider: this.name,
    };
  }
}
