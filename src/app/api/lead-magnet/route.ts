import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { notifyOwner } from "@/lib/notifications/owner";
import { emailCopy } from "@/lib/system-emails/store";
import {
  MAGNETS, SITE, buildMagnetDownloadEmail, buildOwnerMagnetEmail,
} from "@/lib/forms/email-content";
import { isBotSubmission } from "@/lib/spam-trap";
import { clientIp, rateLimitDurable } from "@/lib/rate-limit";
import { intakeLead } from "@/lib/campaign/intake";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Records a download as a CRM lead: source "lead_magnet", tagged with the
 * guide, and attributed to the page and UTM tags it came from (so a LinkedIn
 * post linking to /free/<guide>?utm_source=linkedin shows up as such).
 * Best effort: a CRM hiccup never costs the visitor their download.
 */
async function recordDownloadLead(opts: {
  email: string;
  firstName: string;
  magnetId: string;
  magnetTitle: string;
  ip: string;
  req: NextRequest;
}) {
  try {
    let landing: URL | null = null;
    try {
      const ref = opts.req.headers.get("referer");
      landing = ref ? new URL(ref) : null;
    } catch {
      landing = null;
    }
    const utm = (k: string) => landing?.searchParams.get(k)?.slice(0, 200) || null;

    const result = await intakeLead({
      first_name: opts.firstName,
      last_name: "",
      email: opts.email,
      services_interested: [`Free guide: ${opts.magnetTitle}`],
      source: "lead_magnet",
      campaign: opts.magnetTitle,
      landing_page: landing ? landing.pathname : null,
      utm_source: utm("utm_source"),
      utm_medium: utm("utm_medium"),
      utm_campaign: utm("utm_campaign"),
      utm_content: utm("utm_content"),
      utm_term: utm("utm_term"),
      email_consent: true,
      sms_consent: false,
      consent_text: "Requested a free guide by email and joined the Tomorrow’s Tech AI email list.",
      ip_address: opts.ip,
      user_agent: opts.req.headers.get("user-agent"),
      schedule_followups: false,
    });
    if (!result.stored || !result.leadId || !supabaseConfigured()) return;

    const db = supabaseAdmin();
    const tags = ["lead_magnet", `magnet:${opts.magnetId}`];
    const { data: current } = await db.from("leads").select("tags").eq("id", result.leadId).maybeSingle();
    const existing = ((current as { tags?: string[] | null } | null)?.tags ?? []) as string[];
    await db.from("leads").update({ tags: Array.from(new Set([...existing, ...tags])) }).eq("id", result.leadId);
    await db.from("lead_events").insert({
      lead_id: result.leadId,
      type: "form_submit",
      body: `Downloaded the free guide: ${opts.magnetTitle}.`,
      actor: "system",
      meta: { magnet: opts.magnetId, landing_page: landing?.pathname ?? null, utm_source: utm("utm_source"), duplicate: result.duplicate },
    });
  } catch (err) {
    console.error("Lead magnet CRM record failed:", err);
  }
}

const DEFAULT_AUDIENCE_ID = "47085ffe-414f-4530-a900-9d4ff86ad98d";

// Whitelist of lead magnets and their emails: src/lib/forms/email-content.ts.

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const limit = await rateLimitDurable(`lead-magnet:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
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

    // Looks exactly like a real success (the PDF link is public anyway), but
    // nothing is emailed and nobody joins the list. A real person caught by
    // mistake still gets their download.
    if (isBotSubmission(body as Record<string, unknown>, "lead-magnet", 1500)) {
      return NextResponse.json(
        { ok: true, downloadUrl: `${SITE}${magnet.pdfPath}`, emailSent: true, title: magnet.title },
        { status: 200 }
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

    // 3. Save them in the CRM as a lead, tagged with the guide.
    await recordDownloadLead({ email, firstName, magnetId: magnet.id, magnetTitle: magnet.title, ip, req });

    // 4. Notify John of the new lead
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
