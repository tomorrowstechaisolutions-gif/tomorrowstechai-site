import { NextResponse } from "next/server";
import { intakeLead } from "@/lib/campaign/intake";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KINDS = ["business", "partner"] as const;
const AI_USE = ["None", "Limited", "Some AI tools", "Advanced"];
const PILOT_INTEREST = ["Yes", "Maybe", "I would like more information"];
const ORGANIZATION_TYPES = ["Economic Development Corporation", "City / County", "Workforce Organization", "College / University", "Nonprofit", "Chamber of Commerce", "Government Agency", "Other"];
const MODERNIZATION = ["Customer service", "Phone / AI receptionist", "CRM", "Scheduling", "Workflow automation", "Website", "E-commerce", "Marketing", "Social media", "Employee productivity", "Data / reporting", "Other"];
const PARTNERSHIP = ["Funding / Grant Partnership", "Business Recruitment", "Workforce Training", "Education", "Program Sponsorship", "Economic Development", "Community Outreach", "Other"];

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function list(value: unknown, allowed: readonly string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && allowed.includes(item)).slice(0, allowed.length)
    : [];
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts.shift() || name, lastName: parts.join(" ") };
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limited = rateLimit(`ctai-interest:${ip}`, { max: 8, windowMs: 60 * 60 * 1000 });
    if (!limited.ok) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const kind = text(body.kind, 20);
    if (!(KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: "Invalid inquiry type." }, { status: 400 });

    const elapsed = Number(body.elapsed_ms || 0);
    if (text(body.hp_company_url, 300) || elapsed < 1500) return NextResponse.json({ ok: true });

    const contactName = text(body.contact_name, 150);
    const email = text(body.email, 200).toLowerCase();
    const phone = text(body.phone, 40);
    const city = text(body.city, 100);
    const consent = body.consent === "yes";
    const organization = kind === "business" ? text(body.business_name, 200) : text(body.organization_name, 200);

    if (!contactName || !organization || !city || !consent) return NextResponse.json({ error: "Please complete all required fields and provide contact permission." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

    const modernization = list(body.modernization, MODERNIZATION);
    const partnershipInterest = list(body.partnership_interest, PARTNERSHIP);
    const aiUse = text(body.ai_use, 30);
    const pilotInterest = text(body.pilot_interest, 60);
    const organizationType = text(body.organization_type, 100);
    if (kind === "business" && (!AI_USE.includes(aiUse) || !PILOT_INTEREST.includes(pilotInterest) || !text(body.challenge, 2000) || !text(body.industry, 120) || !text(body.zip, 10))) {
      return NextResponse.json({ error: "Please complete all required business fields." }, { status: 400 });
    }
    if (kind === "partner" && (!ORGANIZATION_TYPES.includes(organizationType) || !text(body.title, 120) || !text(body.message, 2500))) {
      return NextResponse.json({ error: "Please complete all required organization fields." }, { status: 400 });
    }

    const { firstName, lastName } = splitName(contactName);
    const source = kind === "business" ? "Central Texas AI Initiative" : "Central Texas AI Partner Inquiry";
    const services = kind === "business" ? modernization : partnershipInterest;
    const result = await intakeLead({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      business_name: organization,
      business_type: kind === "business" ? text(body.industry, 120) : organizationType,
      website_url: kind === "partner" ? text(body.website, 300) || null : null,
      services_interested: services,
      timeline: kind === "business" ? pilotInterest : "Partnership discussion",
      source,
      campaign: "Central Texas AI Business Modernization Initiative",
      landing_page: "/central-texas-ai",
      email_consent: true,
      sms_consent: false,
      consent_text: "Permission to contact regarding the Central Texas AI Business Modernization Initiative.",
      ip_address: ip,
      user_agent: request.headers.get("user-agent"),
    });

    if (!result.stored || !result.leadId) {
      return NextResponse.json({ error: "We could not save your inquiry. Please try again or contact john@tomorrowstechai.com." }, { status: 503 });
    }

    if (supabaseConfigured()) {
      const details = kind === "business"
        ? { city, zip: text(body.zip, 10), industry: text(body.industry, 120), employee_count: text(body.employee_count, 20), ai_use: aiUse, modernization, challenge: text(body.challenge, 2000), pilot_interest: pilotInterest }
        : { city, title: text(body.title, 120), organization_type: organizationType, website: text(body.website, 300) || null, partnership_interest: partnershipInterest, message: text(body.message, 2500) };
      const { error } = await supabaseAdmin().from("lead_events").insert({
        lead_id: result.leadId,
        type: "form_submit",
        body: kind === "business" ? "Central Texas AI Initiative business interest form." : "Central Texas AI Initiative partner inquiry form.",
        actor: "system",
        meta: { source, inquiry_kind: kind, ...details },
      });
      if (error) console.error("Central Texas AI lead detail insert failed:", error.message);
    }

    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("Central Texas AI interest route error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
