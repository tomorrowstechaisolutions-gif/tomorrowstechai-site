import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

// Simple in-memory rate limit per IP. Reset on cold start.
const recentSubmissions = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5; // 5 submissions per IP per hour

// Resend Audience for the Field Notes newsletter list.
// Override at deploy time via RESEND_AUDIENCE_ID env var if needed.
const DEFAULT_AUDIENCE_ID = "47085ffe-414f-4530-a900-9d4ff86ad98d";

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
    const audienceId = process.env.RESEND_AUDIENCE_ID || DEFAULT_AUDIENCE_ID;
    const fromEmail =
      process.env.CONTACT_FROM_EMAIL ||
      "Tomorrow’s Tech AI <hello@tomorrowstechai.com>";
    const toEmail =
      process.env.CONTACT_TO_EMAIL || "tomorrowstechaisolutions@gmail.com";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Subscription is not configured." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    // 1. Add the subscriber to the Resend Audience (the actual list).
    // Failures here shouldn't break the user-facing success — log and continue.
    let audienceResult: "added" | "duplicate" | "error" = "error";
    try {
      const result = await resend.contacts.create({
        audienceId,
        email,
        unsubscribed: false,
      });
      if (result.error) {
        // Resend returns errors here for duplicates and other issues
        const message = result.error.message?.toLowerCase() ?? "";
        if (
          message.includes("already") ||
          message.includes("exists") ||
          message.includes("duplicate")
        ) {
          audienceResult = "duplicate";
        } else {
          console.error("Resend contacts.create error:", result.error);
          audienceResult = "error";
        }
      } else {
        audienceResult = "added";
      }
    } catch (err) {
      console.error("Resend contacts.create exception:", err);
      audienceResult = "error";
    }

    // 2. Notify John of the new subscriber (only for genuinely new ones).
    if (audienceResult === "added") {
      try {
        await resend.emails.send({
          from: fromEmail,
          to: toEmail,
          subject: "New newsletter subscriber",
          text: `New subscriber to Tomorrow’s Tech AI field notes:\n\n${email}\n\nFrom: ${ip}\n\nView the full list:\nhttps://resend.com/audiences/${audienceId}/contacts`,
        });
      } catch (err) {
        // Don't fail the user-facing request if notification email fails
        console.error("Notification email failed:", err);
      }
    }

    // Treat duplicate as success — the user is already on the list, no error needed.
    if (audienceResult === "added" || audienceResult === "duplicate") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Genuine failure — couldn't add to list at all.
    return NextResponse.json(
      { error: "Couldn't add you to the list. Please try again." },
      { status: 500 }
    );
  } catch (err) {
    console.error("Subscribe API error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
