import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getCourse, gradeQuiz, hasFullAccess } from "@/lib/academy/catalog";
import { currentAccess, issueCertificate } from "@/lib/academy/enrollments";
import { supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Grades a knowledge check on the server (the answers never reach the
 * browser) and, on a pass, issues the certificate under the student's
 * enrolled email. Free courses with a check need an email from the form.
 */
export async function POST(request: Request) {
  const limited = rateLimit(`academy-cert:${clientIp(request)}`, { max: 30, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Take a break and try again." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const course = typeof body?.course === "string" ? getCourse(body.course) : undefined;
  if (!body || !course?.quiz) return NextResponse.json({ error: "Unknown course." }, { status: 400 });

  const access = await currentAccess();
  if (!hasFullAccess(course, access.courses)) {
    return NextResponse.json({ error: "Enroll in the course to take its knowledge check." }, { status: 403 });
  }

  const graded = gradeQuiz(course, body.answers);
  if (!graded) return NextResponse.json({ error: "Answer every question first." }, { status: 400 });
  if (!graded.passed) return NextResponse.json({ ...graded, certificate: null });

  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (name.length < 2) return NextResponse.json({ error: "Add the name to print on your certificate." }, { status: 400 });

  const email = access.email || (typeof body.email === "string" ? body.email.trim() : "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Add your email for the certificate record." }, { status: 400 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "Certificates aren't available right now." }, { status: 503 });

  try {
    const certificate = await issueCertificate(email, name, course.slug, graded.score);
    return NextResponse.json({ ...graded, certificate: { id: certificate.id } });
  } catch (error) {
    console.error("Academy certificate failed:", error);
    return NextResponse.json({ error: "You passed, but we couldn't save the certificate. Please try again." }, { status: 500 });
  }
}
