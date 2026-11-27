import { NextResponse } from "next/server";
import { Resend } from "resend";
import { isBotSubmission } from "@/lib/spam-trap";
import { intakeLead } from "@/lib/campaign/intake";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { notifyOwner } from "@/lib/notifications/owner";
import { businessProfile } from "@/lib/settings/profile-store";
import { getCourse } from "@/lib/academy/catalog";

export const runtime = "nodejs";

/**
 * Academy sign-ups: the founding-student list for a course, and requests for
 * corporate training.
 *
 * They land in the CRM like every other lead (intakeLead: same dedupe and
 * attribution), tagged "academy" plus "academy:<course>" so John can pull the
 * list for any one course when it opens. Students are not sales leads, so the
 * website-package follow-ups are never queued for them.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limited = rateLimit(`academy-waitlist:${ip}`, { max: 8, windowMs: 60 * 60 * 1000 });
    if (!limited.ok) return NextResponse.json({ error: "Too many sign-ups from here. Try again later." }, { status: 429 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const kind = text(body.kind, 20) === "corporate" ? "corporate" : "course";
    if (isBotSubmission(body, `academy/${kind}`, 1200)) return NextResponse.json({ ok: true });

    const name = text(body.name, 150);
    const email = text(body.email, 200).toLowerCase();
    const company = text(body.company, 200);
    const teamSize = text(body.team_size, 40);
    const message = text(body.message, 2000);
    const courseSlug = text(body.course, 80);
    const course = courseSlug ? getCourse(courseSlug) : undefined;

    if (!name) return NextResponse.json({ error: "Please add your name." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (kind === "corporate" && !company) return NextResponse.json({ error: "Please add your company name." }, { status: 400 });

    const parts = name.split(/\s+/);
    const firstName = parts.shift() || name;
    const lastName = parts.join(" ");
    const what = kind === "corporate" ? "Corporate AI training" : course ? course.title : "The Academy (any course)";
    const tags = ["academy", kind === "corporate" ? "academy:corporate" : `academy:${course?.slug ?? "general"}`];

    const result = await intakeLead({
      first_name: firstName,
      last_name: lastName,
      email,
      business_name: company || null,
      services_interested: [what],
      timeline: kind === "corporate" ? teamSize || null : "Founding student list",
      source: "academy",
      campaign: kind === "corporate" ? "Academy corporate training" : "Academy founding students",
      landing_page: course ? `/academy/${course.slug}` : "/academy",
      email_consent: true,
      sms_consent: false,
      consent_text: "I'd like Tomorrow’s Tech AI to email me about the Academy.",
      ip_address: ip,
      user_agent: request.headers.get("user-agent"),
      schedule_followups: false,
    });

    if (result.stored && result.leadId && supabaseConfigured()) {
      const db = supabaseAdmin();
      const { data: current } = await db.from("leads").select("tags").eq("id", result.leadId).maybeSingle();
      const existing = ((current as { tags?: string[] | null } | null)?.tags ?? []) as string[];
      const { error: tagError } = await db.from("leads").update({ tags: Array.from(new Set([...existing, ...tags])) }).eq("id", result.leadId);
      if (tagError) console.error("Academy tag update failed:", tagError.message);

      const { error: eventError } = await db.from("lead_events").insert({
        lead_id: result.leadId,
        type: "form_submit",
        body: kind === "corporate"
          ? `Academy: corporate training request from ${company}${teamSize ? ` (${teamSize})` : ""}.`
          : `Academy: joined the founding-student list for ${what}.`,
        actor: "system",
        meta: { academy: kind, course: course?.slug ?? null, company, team_size: teamSize, message, duplicate: result.duplicate },
      });
      if (eventError) console.error("Academy lead event insert failed:", eventError.message);
    }

    // John hears about every one, even if the CRM write failed, so nobody is lost.
    const apiKey = process.env.RESEND_API_KEY;
    const ownerInbox = process.env.CONTACT_TO_EMAIL || (await businessProfile()).email;
    const emailed = await notifyOwner("lead.academy", `${what}: ${name}`, async () => {
      if (!apiKey || !ownerInbox) return false;
      const lines = [
        kind === "corporate" ? "New corporate training request from the Academy." : "Someone joined an Academy founding-student list.",
        "",
        `Course: ${what}`,
        `Name: ${name}`,
        `Email: ${email}`,
        company ? `Company: ${company}` : "",
        teamSize ? `Team size: ${teamSize}` : "",
        message ? `\nMessage:\n${message}` : "",
        "",
        result.stored ? "Saved to the CRM, tagged academy." : `Not saved to the CRM (${result.reason ?? "unknown reason"}). This email is the only record.`,
      ].filter((l) => l !== "");
      const res = await new Resend(apiKey).emails.send({
        from: process.env.CONTACT_FROM_EMAIL || "Tomorrow’s Tech AI <hello@tomorrowstechai.com>",
        to: ownerInbox,
        replyTo: email,
        subject: kind === "corporate" ? `Academy: corporate training · ${company}` : `Academy: new founding student · ${what}`,
        text: lines.join("\n"),
      });
      return !res.error;
    }, result.leadId ? `/admin/leads/${result.leadId}` : "/admin/leads");

    if (!result.stored && !emailed) {
      return NextResponse.json({ error: "We couldn't save that. Please try again in a minute." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("Academy waitlist route error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
