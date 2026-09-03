import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { getInvoiceByToken } from "@/lib/invoices/service";
import { ensureInvoiceCheckout } from "@/lib/invoices/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens checkout for an invoice.
 *
 * The body carries a token and nothing else. Every figure Stripe is asked for
 * is read from the invoice row and from what has already been collected
 * against it, so a client who edits the page cannot change what they are
 * charged.
 */
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`invoice-pay:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const loaded = await getInvoiceByToken(body.token);
  if (typeof loaded === "string") {
    return NextResponse.json({ error: "That invoice link is no longer valid." }, { status: 404 });
  }

  const checkout = await ensureInvoiceCheckout(loaded.invoice);
  if (!checkout.ok) {
    const message =
      checkout.reason === "nothing_due"
        ? "There is nothing outstanding to pay on this invoice."
        : checkout.reason === "not_configured"
          ? "Card payment is not available right now — please pay however we agreed and we will mark it off."
          : checkout.error ?? "Could not open checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, checkout_url: checkout.url });
}
