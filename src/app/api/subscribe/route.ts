import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

// Simple in-memory rate limit per IP. Reset on cold start.
const recentSubmissions = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5; // 5 submissions per IP per hour

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const now = Date.now();
    const last = recentSubmissions.get(ip) ?? 0;
    if (now - last < RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
    recentSubmissions.set(ip, now);

    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!email || !isValidEmail(email) || email.length > 200) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail =
      process.env.CONTACT_FROM_EMAIL ||
      "TomorrowsTech AI <hello@tomorrowstechai.com>";
    const toEmail =
      process.env.CONTACT_TO_EMAIL || "tomorrowstechaisolutions@gmail.com";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Subscription is not configured." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    // Notify John of the new subscriber
    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: "New newsletter subscriber",
      text: `New subscriber to TomorrowsTech AI field notes:\n\n${email}\n\nFrom: ${ip}`,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Subscribe API error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
