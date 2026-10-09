import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAdminUser } from "@/lib/supabase/server";
import { exchangeZoomCode } from "@/lib/zoom/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Zoom sends the browser back.
 *
 * A token is stored only when ALL of these hold: the visitor is an admin,
 * `state` matches the cookie set a moment ago, a PKCE verifier is present,
 * and Zoom returned a code. Anything else ends on the settings screen with a
 * message and no credential.
 */
function back(request: NextRequest, params: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const response = NextResponse.redirect(new URL(`/admin/conference-center/settings?${params}`, base));
  response.cookies.delete({ name: "zoom_oauth_state", path: "/api/zoom/oauth" });
  response.cookies.delete({ name: "zoom_oauth_verifier", path: "/api/zoom/oauth" });
  return response;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: NextRequest) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin));
  }

  const url = request.nextUrl;
  const error = url.searchParams.get("error");
  if (error) return back(request, `zoom=denied&detail=${encodeURIComponent(error.slice(0, 100))}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get("zoom_oauth_state")?.value;
  const verifier = request.cookies.get("zoom_oauth_verifier")?.value;

  if (!code) return back(request, "zoom=nocode");
  if (!state || !expected || !same(state, expected) || !verifier) {
    return back(request, "zoom=badstate");
  }

  try {
    const { email } = await exchangeZoomCode(code, verifier, session.admin.email);
    return back(request, `zoom=connected&account=${encodeURIComponent(email ?? "")}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Zoom would not complete the connection.";
    return back(request, `zoom=failed&detail=${encodeURIComponent(message.slice(0, 200))}`);
  }
}
