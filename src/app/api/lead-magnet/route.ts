import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

// Rate limit
const recentSubmissions = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

const DEFAULT_AUDIENCE_ID = "47085ffe-414f-4530-a900-9d4ff86ad98d";
const DOWNLOAD_URL = "https://tomorrowstechai.com/downloads/operations-audit-checklist.pdf";

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
    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim().slice(0, 100) : "";

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
      "TomorrowsTech AI <hello@tomorrowstechai.com>";
    const toEmail =
      process.env.CONTACT_TO_EMAIL || "tomorrowstechaisolutions@gmail.com";

    if (!apiKey) {
      return NextResponse.json(
        { error: "This download isn't configured yet. Try again shortly." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    // 1. Add to Resend audience (silent failure okay — we still want them to get the PDF)
    let audienceResult: "added" | "duplicate" | "error" = "error";
    try {
      const result = await resend.contacts.create({
        audienceId,
        email,
        firstName: firstName || undefined,
        unsubscribed: false,
      });
      if (result.error) {
        const message = result.error.message?.toLowerCase() ?? "";
        audienceResult =
          message.includes("already") ||
          message.includes("exists") ||
          message.includes("duplicate")
            ? "duplicate"
            : "error";
      } else {
        audienceResult = "added";
      }
    } catch (err) {
      console.error("Resend contacts.create exception:", err);
    }

    // 2. Email the user the PDF download link
    const userName = firstName ? `Hi ${firstName},` : "Hey,";
    const userBody = `${userName}

Here's the checklist you asked for:

${DOWNLOAD_URL}

12 questions. About 5 minutes to score. The third page tells you what to do with the result.

If 8 or more of the questions land easily — your operation is genuinely ready for AI. If 3 or fewer — the foundation needs work first. Either way, the answers are useful.

If you want a 30-minute walk-through of these questions against your specific operation, just reply to this email or book a slot directly: https://tomorrowstechai.com/contact

— John
Founder, TomorrowsTech AI
tomorrowstechai.com`;

    let userEmailOk = false;
    try {
      const userResp = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "Your Operations Audit Checklist · TomorrowsTech AI",
        text: userBody,
      });
      userEmailOk = !userResp.error;
      if (userResp.error) {
        console.error("User email send error:", userResp.error);
      }
    } catch (err) {
      console.error("User email exception:", err);
    }

    // 3. Notify John (only for genuinely new leads)
    if (audienceResult === "added") {
      try {
        await resend.emails.send({
          from: fromEmail,
          to: toEmail,
          subject: "New lead magnet download",
          text: `New download of the Operations Audit Checklist:

Email: ${email}
${firstName ? `Name: ${firstName}` : ""}
From IP: ${ip}

This contact has been added to your Resend audience:
https://resend.com/audiences/${audienceId}/contacts`,
        });
      } catch (err) {
        console.error("Notification email failed:", err);
      }
    }

    // Always return success — they get the download link even if email failed
    return NextResponse.json(
      {
        ok: true,
        downloadUrl: DOWNLOAD_URL,
        emailSent: userEmailOk,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Lead magnet API error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
