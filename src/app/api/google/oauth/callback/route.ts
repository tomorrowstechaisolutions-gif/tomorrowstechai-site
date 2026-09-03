import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminUser } from "@/lib/supabase/server";
import { exchangeCode } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/**
 * Where Google sends the browser back.
 *
 * Three things have to be true before a token is stored: the visitor is an
 * admin, the `state` matches the cookie this server set a moment ago, and
 * Google returned a code rather than an error. Any one of them failing ends
 * in Settings with a message, never in a stored credential.
 *
 * The code itself never reaches the browser as anything but a query string
 * Google put there; the exchange, the tokens and the storage all happen here.
 */
function settings(request: NextRequest, params: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const response = NextResponse.redirect(new URL(`/admin/settings?${params}`, base));
  response.cookies.delete("google_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin));
  }

  const url = request.nextUrl;
  const error = url.searchParams.get("error");
  if (error) {
    return settings(request, `google=denied&detail=${encodeURIComponent(error)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get("google_oauth_state")?.value;

  if (!code) return settings(request, "google=nocode");
  if (!state || !expected || state !== expected) {
    return settings(request, "google=badstate");
  }

  try {
    const { email } = await exchangeCode(code, session.admin.email);
    return settings(request, `google=connected&account=${encodeURIComponent(email ?? "")}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google would not complete the connection.";
    return settings(request, `google=failed&detail=${encodeURIComponent(message.slice(0, 200))}`);
  }
}
