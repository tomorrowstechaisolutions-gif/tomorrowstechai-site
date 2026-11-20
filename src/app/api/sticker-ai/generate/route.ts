import { NextResponse } from "next/server";
import { getStickerAIProvider } from "@/lib/stickers/ai";
import type { AIStickerRequest } from "@/lib/stickers/types";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { clientIp, dailyBudget, envCap, rateLimitDurable } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Every call here is a paid image generation plus a storage upload, on a
// public route. Two limits: one per visitor, one for the whole site per day.
const PER_IP_PER_HOUR = 5;
const DEFAULT_DAILY_CAP = 40; // override with STICKER_AI_DAILY_CAP

export async function POST(request: Request) {
  try {
    const perIp = await rateLimitDurable(`sticker-ai:${clientIp(request)}`, { max: PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 });
    if (!perIp.ok) {
      return NextResponse.json(
        { error: "You've reached the preview limit for now. Please try again in a little while." },
        { status: 429, headers: { "Retry-After": String(perIp.retryAfterSeconds) } }
      );
    }

    const input = (await request.json()) as Partial<AIStickerRequest>;
    if (!input.prompt?.trim()) {
      return NextResponse.json({ error: "Describe the sticker you want to generate." }, { status: 400 });
    }
    if (input.prompt.length > 3000) {
      return NextResponse.json({ error: "Keep the sticker description under 3,000 characters." }, { status: 400 });
    }
    if (input.includeQrCode && !input.qrCodeUrl?.trim()) {
      return NextResponse.json({ error: "A QR code URL is required." }, { status: 400 });
    }

    const normalized: AIStickerRequest = {
      businessName: input.businessName?.slice(0, 160) ?? "",
      stickerText: input.stickerText?.slice(0, 300) ?? "",
      prompt: input.prompt.trim(),
      style: input.style?.slice(0, 80) ?? "Professional",
      colorPreference: input.colorPreference?.slice(0, 200) ?? "",
      shape: input.shape?.slice(0, 80) ?? "Auto / Die Cut",
      includeQrCode: Boolean(input.includeQrCode),
      qrCodeUrl: input.qrCodeUrl?.slice(0, 1000),
    };
    // Checked last, after validation, so a rejected request never spends it.
    const budget = await dailyBudget("sticker-ai", envCap("STICKER_AI_DAILY_CAP", DEFAULT_DAILY_CAP));
    if (!budget.ok) {
      console.warn("[sticker-ai] daily generation cap reached");
      return NextResponse.json(
        { error: "The sticker studio has reached its preview limit for today. Please try again tomorrow, or upload your own artwork." },
        { status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) } }
      );
    }

    const provider = getStickerAIProvider();
    const generated = await provider.generate(normalized);
    const { bytes, mimeType, model, providerGenerationId, ...clientResult } = generated;

    if (supabaseConfigured()) {
      const supabase = supabaseAdmin();
      let storagePath: string | null = null;
      let imageUrl = clientResult.imageUrl;

      if (bytes && mimeType) {
        storagePath = `pending/${clientResult.id}/generated/sticker.${mimeType === "image/jpeg" ? "jpg" : "png"}`;
        const { error: uploadError } = await supabase.storage
          .from("sticker-orders")
          .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;
        const { data: signed, error: signedError } = await supabase.storage
          .from("sticker-orders")
          .createSignedUrl(storagePath, 60 * 60);
        if (signedError) throw signedError;
        imageUrl = signed.signedUrl;
      }

      const { error: generationError } = await supabase.from("sticker_ai_generations").insert({
        id: clientResult.id,
        provider: clientResult.provider,
        provider_generation_id: providerGenerationId ?? model ?? null,
        prompt: normalized.prompt,
        request: normalized,
        storage_path: storagePath,
        status: "complete",
      });
      if (generationError) throw generationError;

      return NextResponse.json({ result: { ...clientResult, imageUrl } });
    }

    return NextResponse.json({ result: clientResult });
  } catch (error) {
    console.error("Sticker AI generation failed", error);
    return NextResponse.json({ error: "The sticker studio could not generate a preview. Please try again." }, { status: 500 });
  }
}
