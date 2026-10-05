import { NextResponse } from "next/server";
import { calculateStickerPrice, formatDimensions, orderTitle } from "@/lib/stickers/calculations";
import { STICKER_TYPES, type StickerSelection } from "@/lib/stickers/types";
import { createStickerCheckoutSession, stripeConfigured } from "@/lib/stripe/client";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Stripe-ready boundary. When checkout is connected this route must load the
 * order from Supabase, recalculate pricing with calculateStickerPrice, then
 * create Stripe line items from that trusted server result.
 */
export async function POST(request: Request) {
  try {
    const { orderId } = (await request.json()) as { orderId?: string };
    if (!orderId) return NextResponse.json({ error: "Missing order ID." }, { status: 400 });
    if (!supabaseConfigured()) return NextResponse.json({ status: "configuration_required", message: "Secure checkout is temporarily unavailable." }, { status: 503 });
    if (!stripeConfigured()) return NextResponse.json({ status: "configuration_required", message: "Your order is saved. Secure checkout is awaiting Stripe configuration." }, { status: 503 });

    const supabase = supabaseAdmin();
    const { data: order, error } = await supabase
      .from("sticker_orders")
      .select("id, sticker_type, width, height, quantity, design_method, artwork_url, original_artwork_url, design_instructions, status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: "Sticker order not found." }, { status: 404 });
    if (order.status === "paid") return NextResponse.json({ error: "This order has already been paid." }, { status: 409 });
    if (!STICKER_TYPES.includes(order.sticker_type)) throw new Error("Saved sticker type is invalid.");
    if (order.design_method === "upload" && !order.original_artwork_url) return NextResponse.json({ error: "Upload artwork before checkout." }, { status: 400 });
    if (order.design_method === "ai" && !order.artwork_url) return NextResponse.json({ error: "Select an AI design before checkout." }, { status: 400 });

    const selection: StickerSelection = {
      stickerType: order.sticker_type,
      width: Number(order.width),
      height: Number(order.height),
      quantity: Number(order.quantity),
      designMethod: order.design_method,
    };
    const pricing = calculateStickerPrice(selection);
    const amountCents = Math.round(pricing.total * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents < 50) throw new Error("Calculated order total is invalid.");

    const session = await createStickerCheckoutSession({
      orderId: order.id,
      name: orderTitle(selection),
      description: `${formatDimensions(selection.width, selection.height)}, ${selection.quantity.toLocaleString()} stickers. Design method: ${selection.designMethod}.`,
      amountCents,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");

    const { error: updateError } = await supabase.from("sticker_orders").update({
      unit_price: pricing.unitPrice,
      design_fee: pricing.designFee,
      subtotal: pricing.subtotal,
      total: pricing.total,
      stripe_session_id: session.id,
      checkout_url: session.url,
    }).eq("id", order.id);
    if (updateError) throw updateError;

    return NextResponse.json({ status: "checkout_ready", url: session.url });
  } catch (error) {
    console.error("Sticker checkout failed", error);
    return NextResponse.json({ error: "Secure checkout could not be started. Please try again." }, { status: 500 });
  }
}
