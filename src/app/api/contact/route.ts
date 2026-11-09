import { NextResponse } from "next/server";
import { Resend } from "resend";
import { intakeLead } from "@/lib/campaign/intake";
import { buildContactLeadFields } from "@/lib/blog/lead-attribution";

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
const FROM_EMAIL =
  process.env.CONTACT_FROM_EMAIL || "Tomorrow’s Tech AI <hello@tomorrowstechai.com>";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, company, message,offer,attribution } = body as {
      name?: string;
      email?: string;
      company?: string;
      message?: string;
      offer?:{id?:string|null;slug?:string;name?:string;category?:string;price?:string;sourcePage?:string;cta?:string|null}|null;
      attribution?:unknown;
    };

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required" },
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

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      replyTo: email,
      subject: `New inquiry from ${name}${company ? ` · ${company}` : ""}`,
      text: [
        `New contact form submission on tomorrowstechai.com`,
        ``,
        `Name: ${name}`,
        `Email: ${email}`,
        company ? `Company: ${company}` : null,
        ``,
        `Message:`,
        message,
      ]
        .filter(Boolean)
        .join("\n"),
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
        body: String(message).trim().slice(0, 8000),
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
