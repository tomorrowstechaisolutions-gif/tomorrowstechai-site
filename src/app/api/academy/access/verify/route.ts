import { NextResponse } from "next/server";
import { readLogin } from "@/lib/academy/access-token";
import { accessCookie, cookieOptions, coursesFor } from "@/lib/academy/enrollments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The emailed sign-in link. Checks the signature and expiry, then sets the access cookie from the database. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = readLogin(url.searchParams.get("t"));
  if (!email) return NextResponse.redirect(new URL(`/academy/access?link=expired`, request.url), 303);

  const courses = await coursesFor(email);
  if (!courses.length) return NextResponse.redirect(new URL(`/academy/access?link=none`, request.url), 303);

  // Only ever send people somewhere inside the Academy.
  const next = url.searchParams.get("next") ?? "";
  const target = /^\/academy(\/[a-z0-9-]+)*$/.test(next) ? next : "/academy?restored=1";

  const res = NextResponse.redirect(new URL(`${target}`, request.url), 303);
  const cookie = accessCookie(email, courses);
  if (cookie) res.cookies.set(cookie.name, cookie.value, cookieOptions(cookie.maxAge));
  return res;
}
