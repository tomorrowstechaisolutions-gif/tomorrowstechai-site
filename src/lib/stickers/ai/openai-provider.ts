import "server-only";
import type { AIStickerRequest } from "../types";
import type { GeneratedStickerResult, StickerAIProvider } from "./provider";

type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
};

function productionPrompt(input: AIStickerRequest) {
  const requestedText = input.stickerText.trim();
  const business = input.businessName.trim();
  const qrInstruction = input.includeQrCode
    ? `Leave a clean, high-contrast square area for a QR code that will point to ${input.qrCodeUrl}. Do not invent or render a fake QR code.`
    : "Do not include a QR code.";

  return [
    "Create one professional, print-ready custom business sticker design on a transparent background.",
    "The artwork must be a single centered sticker with a clear die-cut silhouette, generous safe margins, and no mockup, table, hand, packaging, shadows outside the cut line, or surrounding scene.",
    business ? `Business name: ${business}.` : "No business name was supplied.",
    requestedText ? `Include this exact readable text and no invented words: ${JSON.stringify(requestedText)}.` : "Do not add words that were not requested.",
    `Creative direction: ${input.prompt.trim()}`,
    `Style: ${input.style || "Professional"}.`,
    input.colorPreference ? `Color preference: ${input.colorPreference}.` : "Use a cohesive, high-contrast commercial color palette.",
    `Shape direction: ${input.shape || "Auto / Die Cut"}.`,
    qrInstruction,
    "Use original artwork only. Do not imitate existing brands, mascots, artists, or copyrighted characters. Crisp vector-like edges, high detail, suitable for commercial printing.",
  ].join("\n");
}

export class OpenAIStickerProvider implements StickerAIProvider {
  readonly name = "openai";

  async generate(input: AIStickerRequest): Promise<GeneratedStickerResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not configured on the server.");

    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    const prompt = productionPrompt(input);
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1024",
        quality: "high",
        output_format: "png",
        background: "transparent",
        n: 1,
      }),
      signal: AbortSignal.timeout(115_000),
    });
    const json = (await response.json().catch(() => ({}))) as OpenAIImageResponse;
    if (!response.ok) throw new Error(json.error?.message || `Image provider returned ${response.status}.`);

    const image = json.data?.[0];
    let bytes: Buffer;
    if (image?.b64_json) {
      bytes = Buffer.from(image.b64_json, "base64");
    } else if (image?.url) {
      const download = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
      if (!download.ok) throw new Error("The generated sticker could not be downloaded.");
      bytes = Buffer.from(await download.arrayBuffer());
    } else {
      throw new Error("The image provider returned no image data.");
    }

    const id = crypto.randomUUID();
    return {
      id,
      imageUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      prompt: input.prompt,
      provider: this.name,
      bytes,
      mimeType: "image/png",
      model,
    };
  }
}
