import { NextResponse } from "next/server";
import { calculateStickerPrice } from "@/lib/stickers/calculations";
import { STICKER_TYPES, type DesignMethod, type StickerSelection } from "@/lib/stickers/types";
import { ACCEPTED_ARTWORK_TYPES, MAX_ARTWORK_BYTES } from "@/lib/stickers/validation";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DESIGN_METHODS: DesignMethod[] = ["upload", "design-service", "ai"];

function parseSelection(value: FormDataEntryValue | null): StickerSelection {
  if (typeof value !== "string") throw new Error("Missing sticker selection.");
  const input = JSON.parse(value) as StickerSelection;
  if (!STICKER_TYPES.includes(input.stickerType) || !DESIGN_METHODS.includes(input.designMethod)) throw new Error("Choose valid sticker options.");
  if (!Number.isFinite(input.width) || input.width < 0.5 || input.width > 24 || !Number.isFinite(input.height) || input.height < 0.5 || input.height > 24) throw new Error("Sticker dimensions must be between 0.5 and 24 inches.");
  if (!Number.isInteger(input.quantity) || input.quantity < 10 || input.quantity > 10000) throw new Error("Quantity must be between 10 and 10,000.");
  return input;
}

function safeJson(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return {};
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function validateFile(entry: FormDataEntryValue | null) {
  if (!(entry instanceof File) || entry.size === 0) return null;
  if (!ACCEPTED_ARTWORK_TYPES.includes(entry.type)) throw new Error("Artwork must be PNG, JPG, PDF, or SVG.");
  if (entry.size > MAX_ARTWORK_BYTES) throw new Error("Artwork must be 25 MB or smaller.");
  return entry;
}

function uuidOrNull(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const selection = parseSelection(form.get("selection"));
    const pricing = calculateStickerPrice(selection);
    const designRequest = safeJson(form.get("designRequest"));
    const artwork = safeJson(form.get("artwork"));
    const originalArtwork = validateFile(form.get("originalArtwork"));
    const designLogo = validateFile(form.get("designLogo"));
    const productionNotes = String(form.get("productionNotes") ?? "").slice(0, 3000);
    const id = crypto.randomUUID();

    const aiGenerationId = uuidOrNull(artwork.aiGenerationId);
    if (selection.designMethod === "ai" && !aiGenerationId) throw new Error("Generate and select an AI design before adding this order to cart.");

    const order = {
      id,
      customer_id: null,
      sticker_type: selection.stickerType,
      finish: selection.stickerType,
      width: selection.width,
      height: selection.height,
      quantity: selection.quantity,
      design_method: selection.designMethod,
      artwork_url: typeof artwork.previewUrl === "string" && artwork.previewUrl.startsWith("/") ? artwork.previewUrl : null,
      original_artwork_url: null as string | null,
      ai_prompt: typeof artwork.aiPrompt === "string" ? artwork.aiPrompt : null,
      ai_generation_id: aiGenerationId,
      qr_code_url: typeof designRequest.qrCodeUrl === "string" ? designRequest.qrCodeUrl : null,
      design_instructions: Object.keys(designRequest).length ? designRequest : null,
      unit_price: pricing.unitPrice,
      design_fee: pricing.designFee,
      subtotal: pricing.subtotal,
      total: pricing.total,
      production_notes: productionNotes || null,
      status: selection.designMethod === "design-service" ? "design_pending" : "draft",
    };

    if (!supabaseConfigured()) {
      return NextResponse.json({ order: { ...order, created_at: new Date().toISOString() }, pricing, backendMode: "preview" });
    }

    const supabase = supabaseAdmin();
    const { error: orderError } = await supabase.from("sticker_orders").insert(order);
    if (orderError) throw orderError;

    if (aiGenerationId) {
      const { data: generation, error: generationLookupError } = await supabase
        .from("sticker_ai_generations")
        .select("id, storage_path")
        .eq("id", aiGenerationId)
        .maybeSingle();
      if (generationLookupError) throw generationLookupError;
      if (!generation) throw new Error("The selected AI design could not be found. Please generate it again.");

      if (generation.storage_path) {
        const { data: generatedFile, error: downloadError } = await supabase.storage
          .from("sticker-orders")
          .download(generation.storage_path);
        if (downloadError) throw downloadError;
        const mimeType = generatedFile.type === "image/jpeg" ? "image/jpeg" : "image/png";
        const extension = mimeType === "image/jpeg" ? "jpg" : "png";
        const storagePath = `${id}/generated/ai-${aiGenerationId}.${extension}`;
        const bytes = await generatedFile.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from("sticker-orders")
          .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;
        const { error: generatedFileError } = await supabase.from("sticker_order_files").insert({
          order_id: id,
          file_kind: "generated",
          storage_path: storagePath,
          original_name: `ai-sticker-${aiGenerationId}.${extension}`,
          mime_type: mimeType,
          byte_size: bytes.byteLength,
        });
        if (generatedFileError) throw generatedFileError;
        const { error: generationUpdateError } = await supabase
          .from("sticker_ai_generations")
          .update({ order_id: id, storage_path: storagePath })
          .eq("id", aiGenerationId);
        if (generationUpdateError) throw generationUpdateError;
        const { error: orderArtworkError } = await supabase
          .from("sticker_orders")
          .update({ artwork_url: storagePath })
          .eq("id", id);
        if (orderArtworkError) throw orderArtworkError;
        await supabase.storage.from("sticker-orders").remove([generation.storage_path]);
        order.artwork_url = storagePath;
      }
    }

    for (const [file, kind] of [[originalArtwork, "original"], [designLogo, "design-logo"]] as const) {
      if (!file) continue;
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const storagePath = `${id}/original/${kind}-${crypto.randomUUID()}.${extension}`;
      const bytes = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from("sticker-orders").upload(storagePath, bytes, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: fileError } = await supabase.from("sticker_order_files").insert({ order_id: id, file_kind: kind, storage_path: storagePath, original_name: file.name, mime_type: file.type, byte_size: file.size });
      if (fileError) throw fileError;
      if (kind === "original") await supabase.from("sticker_orders").update({ original_artwork_url: storagePath }).eq("id", id);
    }

    return NextResponse.json({ order, pricing, backendMode: "supabase" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The order could not be saved.";
    const clientError = /Missing|Choose|must be|dimensions|Quantity|Generate|could not be found/.test(message);
    if (!clientError) console.error("Sticker draft save failed", error);
    return NextResponse.json({ error: clientError ? message : "The order could not be saved. Please try again." }, { status: clientError ? 400 : 500 });
  }
}
