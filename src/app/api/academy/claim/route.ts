import { NextResponse } from "next/server";
import { retrieveCheckoutSession } from "@/lib/stripe/client";
import { readAccess, ACCESS_COOKIE } from "@/lib/academy/access-token";
import { accessCookie, cookieOptions, coursesFor, recordEnrollment } from "@/lib/academy/enrollments";
import { getCourse } from "@/lib/academy/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Stripe sends a buyer after paying. The session id in the URL is not
 * trusted: the session is read back from Stripe, and only a paid Academy
 * session unlocks anything. Then the buyer gets their access cookie and lands
 * on the course.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  const fail = (reason: string) => NextResponse.redirect(new URL(`/academy/access?claim=${reason}`, request.url), 303);

  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return fail("invalid");

  try {
    const session = await retrieveCheckoutSession(sessionId);
    const courseSlug = session.metadata?.course ?? "";
    const course = getCourse(courseSlug);
    const email = session.customer_details?.email || session.customer_email;
    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (session.metadata?.kind !== "academy_course" || !course || !email) return fail("invalid");
    if (!paid) return fail("pending");

    await recordEnrollment({
      email,
      courseSlug,
      stripeSessionId: session.id,
      stripePaymentIntent: session.payment_intent,
      amountCents: session.amount_total ?? 0,
    });

    // Keep anything this browser could already open, add what this email owns.
    const cookieHeader = request.headers.get("cookie") ?? "";
    const current = readAccess(cookieHeader.match(new RegExp(`${ACCESS_COOKIE}=([^;]+)`))?.[1]);
    const owned = await coursesFor(email);
    const courses = Array.from(new Set([...(current?.email === email.toLowerCase() ? current.courses : []), ...owned, courseSlug]));

    const res = NextResponse.redirect(new URL(`/academy/${courseSlug}?welcome=1`, request.url), 303);
    const cookie = accessCookie(email, courses);
    if (cookie) res.cookies.set(cookie.name, cookie.value, cookieOptions(cookie.maxAge));
    return res;
  } catch (error) {
    console.error("Academy claim failed:", error);
    return fail("error");
  }
}
