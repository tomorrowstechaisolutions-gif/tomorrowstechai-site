import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { declineProposal, getProposalByToken } from "@/lib/proposals/service";
import { notifyAdmin } from "@/lib/proposals/emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The client says no, on the record, with a reason if they want to give one. */
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`proposal-decline:${ip}`, { max: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const loaded = await getProposalByToken(body.token);
  const reason = typeof body.reason === "string" ? body.reason : null;

  const result = await declineProposal(body.token, reason, ip);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  if (typeof loaded !== "string") {
    await notifyAdmin("declined", loaded.proposal, reason ? `Reason given: ${reason}` : null);
  }

  return NextResponse.json({ ok: true });
}
