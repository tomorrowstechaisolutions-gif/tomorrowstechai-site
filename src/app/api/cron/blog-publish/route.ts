import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { publishDueArticles } from "@/lib/blog/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Publishes scheduled Field Notes articles whose time has come. */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await publishDueArticles());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blog publishing job failed.";
    console.error("[cron:blog-publish]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
