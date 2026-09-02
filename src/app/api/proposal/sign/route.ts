import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { acceptAndSign } from "@/lib/proposals/service";
import { ensureProposalCheckout } from "@/lib/proposals/payment";
import { notifyAdmin, sendSignedConfirmation } from "@/lib/proposals/emails";
import { proposalUrl } from "@/lib/proposals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signature endpoint.
 *
 * Rate limited per IP, because this is the one public route that writes a
 * legal record. Everything it decides — whether the proposal is signable,
 * which agreement version applies, how much is due — is read from the
 * database, so the request body can only supply who is signing.
 */
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`proposal-sign:${ip}`, { max: 12, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Give it a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.token !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const confirmations =
    body.confirmations && typeof body.confirmations === "object"
      ? (body.confirmations as Record<string, boolean>)
      : {};

  const result = await acceptAndSign({
    token: body.token,
    signerName: typeof body.signer_name === "string" ? body.signer_name : "",
    signerEmail: typeof body.signer_email === "string" ? body.signer_email : "",
    signerTitle: typeof body.signer_title === "string" ? body.signer_title : null,
    signatureType: body.signature_type === "drawn" ? "drawn" : "typed",
    signatureText: typeof body.signature_text === "string" ? body.signature_text : null,
    signatureData: typeof body.signature_data === "string" ? body.signature_data : null,
    confirmations,
    ip,
    userAgent: req.headers.get("user-agent"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const url = proposalUrl(result.proposal.public_token);

  // Email is a courtesy on top of a signature that is already recorded. A
  // failed send must never turn a signed agreement into an error.
  await Promise.allSettled([
    sendSignedConfirmation(result.proposal, result.signature, url),
    notifyAdmin(
      "signed",
      result.proposal,
      `Signed by ${result.signature.signer_name} <${result.signature.signer_email}>.`
    ),
  ]);

  let checkoutUrl: string | null = null;
  if (result.dueNowCents > 0) {
    const checkout = await ensureProposalCheckout(result.proposal);
    if (checkout.ok) checkoutUrl = checkout.url;
  }

  return NextResponse.json({
    ok: true,
    proposal_number: result.proposal.proposal_number,
    checkout_url: checkoutUrl,
  });
}
