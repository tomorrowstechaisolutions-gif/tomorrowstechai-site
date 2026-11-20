import { NextResponse } from "next/server";
import { Resend } from "resend";
import { intakeLead } from "@/lib/campaign/intake";
import { buildContactLeadFields } from "@/lib/blog/lead-attribution";
import { notifyOwner } from "@/lib/notifications/owner";
import { emailCopy } from "@/lib/system-emails/store";
import { buildOwnerContactEmail } from "@/lib/forms/email-content";
import { isBotSubmission } from "@/lib/spam-trap";
import { clientIp, rateLimitDurable } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 8000;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
const FROM_EMAIL =
  process.env.CONTACT_FROM_EMAIL || "Tomorrow’s Tech AI <hello@tomorrowstechai.com>";

export async function POST(request: Request) {
  try {
    const limit = await rateLimitDurable(`contact:${clientIp(request)}`, { max: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many messages in a short time. Try again in a little while, or email us directly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    // Return 200 so a bot can't tell it was caught, but send and store nothing.
    if (isBotSubmission(body as Record<string, unknown>, "contact", 2000)) {
      return NextResponse.json({ ok: true });
    }

    const { offer, attribution } = body as {
      offer?:{id?:string|null;slug?:string;name?:string;category?:string;price?:string;sourcePage?:string;cta?:string|null}|null;
      attribution?:unknown;
    };
    const name = text(body.name, 200);
    const email = text(body.email, 200);
    const company = text(body.company, 200);
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required" },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }
    // Rejected rather than cut short, so nobody's message is silently trimmed.
    if (message.length > MAX_MESSAGE) {
      return NextResponse.json(
        { error: "That message is too long. Keep it under 8,000 characters." },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY missing");
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    // Gated by its Notifications switch; switched off counts as success for the visitor.
    let error: unknown = null;
    await notifyOwner("lead.contact_form", `${name}${company ? ` · ${company}` : ""}`, async () => {
    const mail = buildOwnerContactEmail({ name, email, company, message }, await emailCopy("forms.owner_contact"));
    const res = await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      replyTo: email,
      subject: mail.subject,
      text: mail.text,
    });
    error = res.error;
    return !res.error;
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }

    const parts=name.trim().split(/\s+/); const firstName=parts.shift()||name; const lastName=parts.join(" ");
    // Source page, CTA position and campaign UTMs (validated in the builder).
    const { lead: attributed, eventMeta } = buildContactLeadFields(offer, attribution);
    const intake=await intakeLead({first_name:firstName,last_name:lastName,email,business_name:company||null,business_type:offer?.category||null,services_interested:offer?.name?[`${offer.category||"Service"} — ${offer.name} — ${offer.price||"Price not provided"}`]:[],source:"contact-form",campaign:offer?.name||null,...attributed,email_consent:true,sms_consent:false});
    // Keep what they actually wrote on the lead. Before this, the message only
    // reached the notification email and the CRM record had none of it.
    // 'form_submit' is one of the types the lead_events check constraint
    // allows (the earlier 'catalog_inquiry' type is not in it).
    if (intake.leadId) {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      const { error: eventError } = await supabaseAdmin().from("lead_events").insert({
        lead_id: intake.leadId,
        type: "form_submit",
        body: message,
        actor: "contact-form",
        meta: {
          kind: "contact_message",
          company: company || null,
          ...(offer
            ? { package_id: offer.id || null, package: offer.slug || null, package_name: offer.name || null, category: offer.category || null, price: offer.price || null }
            : {}),
          ...eventMeta,
        },
      });
      if (eventError) console.error("Contact message not saved to lead:", eventError.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact route error:", err);
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
