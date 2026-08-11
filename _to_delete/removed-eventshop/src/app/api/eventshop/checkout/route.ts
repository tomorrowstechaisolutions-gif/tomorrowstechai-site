import { NextResponse } from "next/server";

import {
  PRODUCTS_BY_ID,
  SHIRT_COLORS,
  SHIRT_SIZES,
  lineTitle,
} from "@/components/eventshop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LINES = 20;
const MAX_QTY = 20;

type IncomingItem = {
  productId?: unknown;
  color?: unknown;
  size?: unknown;
  qty?: unknown;
};

const VALID_COLORS = new Set(SHIRT_COLORS.map((c) => c.id));
const VALID_SIZES = new Set<string>(SHIRT_SIZES);

/** Resolve the public origin so success/cancel URLs work on preview deploys too. */
function originFrom(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) return "https://tomorrowstechai.com";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Checkout isn't switched on yet. Add STRIPE_SECRET_KEY to the environment and redeploy.",
      },
      { status: 503 }
    );
  }

  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const raw = Array.isArray(body.items) ? (body.items as IncomingItem[]) : [];
  if (raw.length === 0 || raw.length > MAX_LINES) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }

  // Prices come from the server-side catalog only — never from the client.
  const lines: { name: string; amount: number; qty: number }[] = [];
  for (const item of raw) {
    const productId = String(item.productId ?? "");
    const color = String(item.color ?? "");
    const size = String(item.size ?? "");
    const qty = Math.floor(Number(item.qty));

    const product = PRODUCTS_BY_ID[productId];
    if (
      !product ||
      !VALID_COLORS.has(color) ||
      !VALID_SIZES.has(size) ||
      !Number.isFinite(qty) ||
      qty < 1 ||
      qty > MAX_QTY
    ) {
      return NextResponse.json(
        { error: "One of the items in your cart is no longer available." },
        { status: 400 }
      );
    }

    lines.push({ name: lineTitle(productId, color, size), amount: product.price, qty });
  }

  const origin = originFrom(req);
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${origin}/eventshop?checkout=success`);
  params.set("cancel_url", `${origin}/eventshop?checkout=cancelled`);
  params.set("shipping_address_collection[allowed_countries][0]", "US");
  params.set("billing_address_collection", "auto");
  params.set("metadata[source]", "eventshop");
  params.set("metadata[store]", "lone-star-loud");

  // Free flat-rate US shipping with a 3–5 business day estimate, matching the
  // promise made on the page. Change the amount here to start charging.
  params.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  params.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", "0");
  params.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
  params.set("shipping_options[0][shipping_rate_data][display_name]", "Free U.S. Shipping");
  params.set(
    "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]",
    "business_day"
  );
  params.set("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]", "3");
  params.set(
    "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]",
    "business_day"
  );
  params.set("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]", "5");

  lines.forEach((line, i) => {
    params.set(`line_items[${i}][quantity]`, String(line.qty));
    params.set(`line_items[${i}][price_data][currency]`, "usd");
    params.set(`line_items[${i}][price_data][unit_amount]`, String(line.amount));
    params.set(`line_items[${i}][price_data][product_data][name]`, line.name);
  });

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      cache: "no-store",
    });

    const data: { url?: string; error?: { message?: string } } = await res.json();

    if (!res.ok || !data.url) {
      console.error("[eventshop] Stripe session failed:", data.error?.message ?? res.status);
      return NextResponse.json(
        { error: "Checkout couldn't be started. Please try again in a moment." },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: data.url });
  } catch (err) {
    console.error("[eventshop] Stripe request threw:", err);
    return NextResponse.json(
      { error: "Checkout couldn't be started. Please try again in a moment." },
      { status: 502 }
    );
  }
}
