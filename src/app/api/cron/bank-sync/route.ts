import { NextResponse } from "next/server";
import { mercuryConfigured, syncMercury } from "@/lib/finance/mercury";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Pulls Mercury balances and transactions into the admin (read-only). */
export function GET(request: Request) {
  return withCronRun("bank-sync", request, run);
}

async function run(): Promise<Response> {
  if (!mercuryConfigured()) return NextResponse.json({ skipped: "MERCURY_API_TOKEN not set" });
  try {
    return NextResponse.json(await syncMercury());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bank sync failed.";
    console.error("[cron:bank-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
