import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminUser } from "@/lib/supabase/server";
import { PROVIDER_LABEL } from "@/lib/social/accounts";
import { isSocialProvider, providerAuthUrl, socialProviderStatus, socialRedirectUri } from "@/lib/social/oauth";
import { xPkce } from "@/lib/social/providers/x";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Starts a Meta, LinkedIn or X consent flow for Social Center.
 *
 * Admin-only. A random `state` is kept in a short-lived http-only cookie and
 * checked on the way back, so nobody can hand the admin a crafted callback
 * that connects THEIR account to this business. The optional client id rides
 * in the same cookie, never in the provider round trip.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const session = await getAdminUser();
  if (!session) return NextResponse.redirect(new URL("/admin/login", base));

  const { provider } = await params;
  if (!isSocialProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });

  const status = socialProviderStatus().find((row) => row.provider === provider);
  if (!status?.configured) {
    const message = `${PROVIDER_LABEL[provider]} isn't set up yet. Missing: ${status?.missing.join(", ")}.`;
    return NextResponse.redirect(new URL(`/admin/marketing/social?${new URLSearchParams({ error: message })}`, base));
  }

  const customer = request.nextUrl.searchParams.get("customer") ?? "";
  const state = randomBytes(24).toString("base64url");
  // X requires PKCE: the verifier stays in this http-only cookie, only the
  // challenge goes to X. base64url never contains ".", so it splits cleanly.
  const pkce = provider === "x" ? xPkce() : null;
  const response = NextResponse.redirect(providerAuthUrl(provider, state, socialRedirectUri(provider, request.nextUrl.origin), pkce?.challenge));
  response.cookies.set(`social_oauth_${provider}`, `${state}.${UUID.test(customer) ? customer : ""}${pkce ? `.${pkce.verifier}` : ""}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
