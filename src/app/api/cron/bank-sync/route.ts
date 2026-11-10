import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { mercuryConfigured, syncMercury } from "@/lib/finance/mercury";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pulls Mercury balances and transactions into the admin (read-only). */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mercuryConfigured()) return NextResponse.json({ skipped: "MERCURY_API_TOKEN not set" });
  try {
    return NextResponse.json(await syncMercury());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bank sync failed.";
    console.error("[cron:bank-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
