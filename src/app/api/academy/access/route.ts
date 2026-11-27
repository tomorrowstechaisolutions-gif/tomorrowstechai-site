import { NextResponse } from "next/server";
import { clientIp, rateLimitDurable } from "@/lib/rate-limit";
import { isBotSubmission } from "@/lib/spam-trap";
import { coursesFor, RESTORE_LINK_TTL, sendLoginEmail } from "@/lib/academy/enrollments";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Get access" on a new device: emails a one-hour sign-in link to the address
 * a course was bought with. The answer is the same whether or not the email
 * owns anything, so this can't be used to find out who bought what.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = await rateLimitDurable(`academy-access:${ip}`, { max: 6, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (isBotSubmission(body, "academy/access", 800)) return NextResponse.json({ ok: true });

  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const courses = await coursesFor(email);
  if (courses.length) {
    await sendLoginEmail(email, RESTORE_LINK_TTL, "Here's your link back into the Academy.").catch((err) =>
      console.error("Academy access email failed:", err)
    );
  }
  return NextResponse.json({ ok: true });
}
