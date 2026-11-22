import { NextResponse } from "next/server";
import { checkSocialRunway } from "@/lib/social/runway";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Once a day: counts the days of daily social posts left and tells John at 14, 7 and 1. */
export function GET(request: Request) {
  return withCronRun("social-runway", request, run);
}

async function run(): Promise<Response> {
  try {
    return NextResponse.json(await checkSocialRunway());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Social runway check failed.";
    console.error("[cron:social-runway]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
