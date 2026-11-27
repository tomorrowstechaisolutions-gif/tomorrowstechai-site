import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { forSale, getCourse } from "@/lib/academy/catalog";
import { createAcademyCheckoutSession, stripeConfigured } from "@/lib/stripe/client";

export const runtime = "nodejs";

/** Starts a Stripe Checkout for one course. The price comes from the course file, never the browser. */
export async function POST(request: Request) {
  const limited = rateLimit(`academy-checkout:${clientIp(request)}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Try again in a bit." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { course?: unknown } | null;
  const course = typeof body?.course === "string" ? getCourse(body.course) : undefined;
  if (!course || !forSale(course) || course.price.kind !== "paid") {
    return NextResponse.json({ error: "That course isn't open for enrollment yet." }, { status: 400 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Checkout isn't set up yet. Please try again later." }, { status: 503 });
  }

  try {
    const session = await createAcademyCheckoutSession({
      courseSlug: course.slug,
      courseTitle: course.title,
      amountCents: Math.round(course.price.amount * 100),
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Academy checkout failed:", error);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
