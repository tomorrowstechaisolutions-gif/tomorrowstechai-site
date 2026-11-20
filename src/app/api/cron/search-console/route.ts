import { NextResponse } from "next/server";
import { connection } from "@/lib/seo/search-console";
import { syncSearchConsole } from "@/lib/seo/gsc-sync";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: pulls recent Search Console data into seo_queries (read-only against Google). */
export function GET(request: Request) {
  return withCronRun("search-console", request, run);
}

async function run(): Promise<Response> {
  if (!connection().connected) return NextResponse.json({ skipped: "Search Console keys not set" });
  const result = await syncSearchConsole("cron");
  if (!result.ok) console.error("[cron:search-console]", result.error);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
