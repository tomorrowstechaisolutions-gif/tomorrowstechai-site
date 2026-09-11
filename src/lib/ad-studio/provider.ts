import "server-only";

export type GeneratedBackground = { bytes: Buffer; provider: string; model: string; prompt: string; costMicroUsd: number | null };

export function imageProviderStatus() {
  return { configured: Boolean(process.env.OPENAI_API_KEY), provider: "OpenAI", model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst" };
}

export async function generateBackground(prompt: string, size: string): Promise<GeneratedBackground> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured on the server.");
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size, quality: "high", output_format: "png", n: 1 }),
    signal: AbortSignal.timeout(115_000),
  });
  const json = await response.json().catch(() => ({})) as { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message || `Image provider returned ${response.status}.`);
  const item = json.data?.[0];
  let bytes: Buffer;
  if (item?.b64_json) bytes = Buffer.from(item.b64_json, "base64");
  else if (item?.url) {
    const download = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
    if (!download.ok) throw new Error("The generated image could not be downloaded.");
    bytes = Buffer.from(await download.arrayBuffer());
  } else throw new Error("The image provider returned no image data.");
  const configuredCost = Number(process.env.AD_IMAGE_ESTIMATED_COST_MICRO_USD || "");
  return { bytes, provider: "openai", model, prompt, costMicroUsd: Number.isFinite(configuredCost) && configuredCost >= 0 ? configuredCost : null };
}
