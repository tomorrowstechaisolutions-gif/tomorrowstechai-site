import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { syncVercelWebsites } from "@/lib/vercel/website-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await syncVercelWebsites());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vercel website sync failed.";
    console.error("[cron:vercel-websites]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
