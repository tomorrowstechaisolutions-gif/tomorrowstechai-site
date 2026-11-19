import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { connection } from "@/lib/seo/search-console";
import { syncSearchConsole } from "@/lib/seo/gsc-sync";

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

/** Daily: pulls recent Search Console data into seo_queries (read-only against Google). */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!connection().connected) return NextResponse.json({ skipped: "Search Console keys not set" });
  const result = await syncSearchConsole("cron");
  if (!result.ok) console.error("[cron:search-console]", result.error);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
