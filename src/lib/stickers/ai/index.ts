import "server-only";
import type { StickerAIProvider } from "./provider";
import { DemoStickerAIProvider } from "./demo-provider";
import { OpenAIStickerProvider } from "./openai-provider";

export function getStickerAIProvider(): StickerAIProvider {
  const provider = process.env.STICKER_AI_PROVIDER ?? (process.env.OPENAI_API_KEY ? "openai" : "demo");
  if (provider === "demo") return new DemoStickerAIProvider();
  if (provider === "openai") return new OpenAIStickerProvider();

  throw new Error(
    `Unsupported sticker AI provider: ${provider}. Add an adapter in src/lib/stickers/ai.`
  );
}
