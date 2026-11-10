import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminUser } from "@/lib/supabase/server";
import { isSocialProvider, socialRedirectUri } from "@/lib/social/oauth";
import { connectLinkedIn } from "@/lib/social/providers/linkedin";
import { connectMeta } from "@/lib/social/providers/meta";
import { syncSocialProfiles } from "@/lib/social/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Where Meta / LinkedIn send the browser back. A token is stored only when the
 * visitor is an admin, `state` matches the cookie set by /start, and the
 * provider returned a code. Every other outcome lands in Social Center with a
 * message and nothing stored.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const session = await getAdminUser();
  if (!session) return NextResponse.redirect(new URL("/admin/login", base));

  const { provider } = await params;
  if (!isSocialProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const label = provider === "meta" ? "Meta" : "LinkedIn";

  const back = (kind: "notice" | "error", message: string) => {
    const response = NextResponse.redirect(new URL(`/admin/marketing/social?${new URLSearchParams({ [kind]: message })}`, base));
    response.cookies.delete(`social_oauth_${provider}`);
    return response;
  };

  const url = request.nextUrl;
  const denied = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (denied) return back("error", `${label} connection was canceled: ${denied.slice(0, 200)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const [expected, customerId] = (request.cookies.get(`social_oauth_${provider}`)?.value ?? "").split(".");
  if (!code) return back("error", `${label} did not return an authorization code.`);
  if (!state || !expected || state !== expected) return back("error", `${label} connection expired or didn't match. Start it again.`);

  try {
    const redirectUri = socialRedirectUri(provider, request.nextUrl.origin);
    const actor = session.admin.email;
    const connected = provider === "meta"
      ? await connectMeta(code, redirectUri, customerId || null, actor)
      : await connectLinkedIn(code, redirectUri, customerId || null, actor);
    // Pull avatars, covers and recent posts right away so the Accounts tab
    // isn't empty on first look. Never fails the connection.
    if (provider === "meta") await syncSocialProfiles({ staleHours: 0, limit: 40 }).catch(() => null);
    revalidatePath("/admin/marketing/social");
    return back("notice", `Connected ${connected.join(" · ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} would not complete the connection.`;
    return back("error", message.slice(0, 300));
  }
}
