import { NextResponse } from "next/server";
import { publishDueArticles } from "@/lib/blog/scheduler";
import { withCronRun } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Publishes scheduled Field Notes articles whose time has come. */
export function GET(request: Request) {
  return withCronRun("blog-publish", request, run);
}

async function run(): Promise<Response> {
  try {
    return NextResponse.json(await publishDueArticles());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blog publishing job failed.";
    console.error("[cron:blog-publish]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
