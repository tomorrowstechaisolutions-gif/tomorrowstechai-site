import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { getProposalByToken } from "@/lib/proposals/service";
import { ensureProposalCheckout } from "@/lib/proposals/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-opens checkout for a proposal that has already been signed — the client
 * closed the Stripe tab, or came back to the link later.
 *
 * Refuses anything unsigned: paying for an agreement nobody has accepted is
 * not a state this business wants to be in.
 */
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`proposal-pay:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 });
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

  const loaded = await getProposalByToken(body.token);
  if (typeof loaded === "string") {
    return NextResponse.json({ error: "That proposal link is no longer valid." }, { status: 404 });
  }
  if (!loaded.proposal.signed_at) {
    return NextResponse.json(
      { error: "This proposal has not been signed yet." },
      { status: 409 }
    );
  }

  const checkout = await ensureProposalCheckout(loaded.proposal);
  if (!checkout.ok) {
    const message =
      checkout.reason === "nothing_due"
        ? "There is nothing outstanding to pay on this proposal."
        : checkout.reason === "not_configured"
          ? "Card payment is not available right now — we will send an invoice instead."
          : checkout.error ?? "Could not open checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, checkout_url: checkout.url });
}
