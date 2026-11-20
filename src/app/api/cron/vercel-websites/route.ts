import { NextResponse } from "next/server";
import { syncVercelWebsites } from "@/lib/vercel/website-sync";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  return withCronRun("vercel-websites", request, run);
}

async function run(): Promise<Response> {
  try {
    return NextResponse.json(await syncVercelWebsites());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vercel website sync failed.";
    console.error("[cron:vercel-websites]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
