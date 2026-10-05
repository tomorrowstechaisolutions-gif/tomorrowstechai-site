import { NextResponse } from "next/server";
import { getStickerAIProvider } from "@/lib/stickers/ai";
import type { AIStickerRequest } from "@/lib/stickers/types";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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
