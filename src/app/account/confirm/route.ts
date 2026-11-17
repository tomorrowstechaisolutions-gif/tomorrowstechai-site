import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where invite and reset emails land. Verifies the one-time token
 * server-side, which sets the session cookie, then sends the member on to
 * choose a password. A used or expired link goes back to sign-in.
 */
export const dynamic = "force-dynamic";

const ALLOWED: EmailOtpType[] = ["invite", "recovery"];

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const back = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (!tokenHash || !type || !ALLOWED.includes(type)) return back("/account/login?link=invalid");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return back("/account/login?link=expired");
  return back("/account/set-password");
}
