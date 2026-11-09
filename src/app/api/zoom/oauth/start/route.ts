import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminUser } from "@/lib/supabase/server";
import { newOAuthState, zoomAuthUrl, zoomMissingConfig } from "@/lib/zoom/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS = "/admin/conference-center/settings";

/** The host the admin is on, so every redirect and cookie stays on it. */
function site(request: NextRequest): string {
  return request.nextUrl.origin || process.env.NEXT_PUBLIC_SITE_URL || "https://www.tomorrowstechai.com";
}

/**
 * Starts the Zoom consent flow. Admin-only.
 *
 * Two values go into short-lived http-only cookies and are checked on the
 * way back: `state` (so nobody can hand the admin a crafted callback that
 * connects THEIR Zoom account) and the PKCE verifier (so an intercepted
 * authorization code is useless on its own).
 */
export async function GET(request: NextRequest) {
  const session = await getAdminUser();
  if (!session) return NextResponse.redirect(new URL("/admin/login", site(request)));

  const missing = zoomMissingConfig();
  if (missing.length > 0) {
    return NextResponse.redirect(
      new URL(`${SETTINGS}?zoom=unconfigured&detail=${encodeURIComponent(missing.join(", "))}`, site(request))
    );
  }

  const { state, verifier, challenge } = newOAuthState();
  const response = NextResponse.redirect(zoomAuthUrl(state, challenge, site(request)));
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/zoom/oauth",
    maxAge: 600,
  };
  response.cookies.set("zoom_oauth_state", state, cookie);
  response.cookies.set("zoom_oauth_verifier", verifier, cookie);
  return response;
}
