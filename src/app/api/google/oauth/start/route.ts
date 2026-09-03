import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAdminUser } from "@/lib/supabase/server";
import { googleAuthUrl, googleConfigured } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/**
 * Starts the Google consent flow.
 *
 * Admin-only, like everything else under /admin — an unauthenticated visitor
 * must not be able to begin an OAuth flow that ends in a token being written
 * to this business's database.
 *
 * `state` is a random value stored in a short-lived, http-only cookie and
 * compared on the way back. Without it, a third party could hand the admin a
 * crafted callback URL and connect THEIR Google account to this system.
 */
export async function GET() {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_SITE_URL || "https://www.tomorrowstechai.com"));
  }

  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/admin/settings?google=unconfigured", process.env.NEXT_PUBLIC_SITE_URL || "https://www.tomorrowstechai.com")
    );
  }

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(googleAuthUrl(state));

  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
