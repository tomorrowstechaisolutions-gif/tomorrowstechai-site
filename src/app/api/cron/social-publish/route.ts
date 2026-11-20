import { NextResponse } from "next/server";
import { publishDueSocialPosts } from "@/lib/social/publisher";
import { syncSocialProfiles } from "@/lib/social/sync";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  return withCronRun("social-publish", request, run);
}

async function run(): Promise<Response> {
  try {
    const publish = await publishDueSocialPosts();
    // Refresh a few stale account profiles each run (avatars/thumbnails expire).
    const profiles = await syncSocialProfiles({ staleHours: 6, limit: 8 }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "sync failed" }));
    return NextResponse.json({ publish, profiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Social publishing job failed.";
    console.error("[cron:social-publish]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
