import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 16 renamed middleware.ts to proxy.ts. The build confirms it with
 * "ƒ Proxy (Middleware)".
 *
 * Two jobs, for /admin and the member portal /account:
 *  1. Keep the Supabase auth cookie fresh.
 *  2. Bounce anyone without a session to the right sign-in page before a page
 *     renders. Whether the session is an admin or a member is decided by the
 *     layouts/pages (admin_users, portal_members) and enforced by RLS.
 *
 * This is a convenience gate, not the security boundary. The real boundary is
 * RLS plus the admin_users check in the layout — a forged cookie gets past
 * here and still sees nothing.
 */
export default async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Member portal: sign-in, reset and the emailed-link landing are public.
  if (path === "/account" || path.startsWith("/account/")) {
    const open = ["/account/login", "/account/forgot", "/account/confirm"].some((p) => path === p || path.startsWith(`${p}/`));
    if (!user && !open) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/account/login";
      redirect.search = "";
      redirect.searchParams.set("next", path);
      return NextResponse.redirect(redirect);
    }
    return response;
  }

  const isLogin = path === "/admin/login";

  if (!user && path.startsWith("/admin") && !isLogin) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/admin/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  // A signed-in member (not an admin) is sent here with ?denied=1; bouncing
  // them back to /admin would loop.
  if (user && isLogin && !request.nextUrl.searchParams.has("denied")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/admin";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/account", "/account/:path*"],
};
