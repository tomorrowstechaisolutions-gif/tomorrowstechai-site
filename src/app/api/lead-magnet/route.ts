import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { notifyOwner } from "@/lib/notifications/owner";
import { emailCopy } from "@/lib/system-emails/store";
import {
  MAGNETS, SITE, buildMagnetDownloadEmail, buildOwnerMagnetEmail,
} from "@/lib/forms/email-content";

export const runtime = "nodejs";

// Rate limit
const recentSubmissions = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

const DEFAULT_AUDIENCE_ID = "47085ffe-414f-4530-a900-9d4ff86ad98d";

// Whitelist of lead magnets and their emails: src/lib/forms/email-content.ts.

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
    const magnetId =
      typeof body.magnet === "string" ? body.magnet.trim() : "operations-audit";

    if (!email || !isValidEmail(email) || email.length > 200) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const magnet = MAGNETS[magnetId];
    if (!magnet) {
      return NextResponse.json(
        { error: "Unknown download." },
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
        { error: "This download isn't configured yet. Try again shortly." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    // 1. Add to Resend audience
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

    // 2. Email the user the PDF link
    let userEmailOk = false;
    try {
      const userMail = buildMagnetDownloadEmail(magnet, firstName, await emailCopy("forms.magnet_download"));
      const userResp = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: userMail.subject,
        text: userMail.text,
      });
      userEmailOk = !userResp.error;
      if (userResp.error) {
        console.error("User email send error:", userResp.error);
      }
    } catch (err) {
      console.error("User email exception:", err);
    }

    // 3. Notify John of the new lead
    if (audienceResult === "added") {
      try {
        await notifyOwner("lead.magnet_download", `${magnet.title}: ${email}`, async () => {
          const mail = buildOwnerMagnetEmail({ magnet, email, firstName, ip, audienceId }, await emailCopy("forms.owner_magnet"));
          const res = await resend.emails.send({
            from: fromEmail,
            to: toEmail,
            subject: mail.subject,
            text: mail.text,
          });
          return !res.error;
        });
      } catch (err) {
        console.error("Notification email failed:", err);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        downloadUrl: `${SITE}${magnet.pdfPath}`,
        emailSent: userEmailOk,
        title: magnet.title,
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
