import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { publishDueSocialPosts } from "@/lib/social/publisher";

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

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await publishDueSocialPosts());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Social publishing job failed.";
    console.error("[cron:social-publish]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
