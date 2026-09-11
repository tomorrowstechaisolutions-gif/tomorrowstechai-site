import { NextResponse } from "next/server";
import { intakeLead } from "@/lib/campaign/intake";
import { getAiOperatorPlan } from "@/lib/ai-operator/plans";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACTS = ["Phone", "Text", "Email"];
const INDUSTRIES = ["Pool Company", "HVAC", "Roofing", "Tower / Telecom", "Plumbing", "Electrical", "Landscaping", "Automotive", "General Contractor", "Home Services", "Professional Services", "Other"];
const clean = (value: unknown, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const limit = rateLimit(`operator-intake:${ip}`, { max: 6, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    if (clean(body.hp_company_url, 500) || (typeof body.elapsed_ms === "number" && body.elapsed_ms < 1800)) return NextResponse.json({ ok: true });

    const fullName = clean(body.fullName, 200);
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() ?? "";
    const lastName = nameParts.join(" ");
    const email = clean(body.email, 200).toLowerCase();
    const phone = clean(body.phone, 40);
    const company = clean(body.company, 200);
    const industry = clean(body.industry, 100);
    const contactMethod = clean(body.contactMethod, 20);
    if (!firstName || !company || !EMAIL_RE.test(email) || phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Please complete your required contact information." }, { status: 400 });
    if (!INDUSTRIES.includes(industry) || !CONTACTS.includes(contactMethod)) return NextResponse.json({ error: "Please choose your industry and preferred contact method." }, { status: 400 });
    if (contactMethod === "Text" && body.smsConsent !== true) return NextResponse.json({ error: "Text contact requires your consent." }, { status: 400 });

    const plan = getAiOperatorPlan(clean(body.plan, 20));
    const websiteRaw = clean(body.website, 500);
    const website = websiteRaw && !/^https?:\/\//i.test(websiteRaw) ? `https://${websiteRaw}` : websiteRaw;
    const selectedChallenges = Array.isArray(body.challenges) ? body.challenges.map((x: unknown) => clean(x, 80)).filter(Boolean).slice(0, 12) : [];
    const details = [
      `AI Business Operator intake`, `Selected plan: ${plan.name} (${plan.price}/month; ${plan.setup})`,
      `Team size: ${clean(body.employees, 50) || "Not provided"}`, `Monthly leads: ${clean(body.monthlyLeads, 50) || "Not provided"}`,
      `Challenges: ${selectedChallenges.join(", ") || "Not provided"}`, `Preferred contact: ${contactMethod}`, `Best time: ${clean(body.bestTime, 50) || "Any time"}`,
      `Additional notes: ${clean(body.notes, 2000) || "None"}`,
    ].join("\n");
    const result = await intakeLead({ first_name: firstName, last_name: lastName, email, phone, business_name: company, business_type: industry, current_website: website ? "yes" : "no", website_url: website || null, services_interested: [`AI Business Operator — ${plan.name}`, ...selectedChallenges], timeline: clean(body.bestTime, 50) || null, source: "ai-business-operator-intake", campaign: plan.name, landing_page: `/get-started?plan=${plan.id}`, email_consent: true, sms_consent: contactMethod === "Text" && body.smsConsent === true, consent_text: contactMethod === "Text" ? "I agree to receive service-related text messages from Tomorrow’s Tech AI. Message and data rates may apply. Reply STOP to opt out." : null, ip_address: ip, user_agent: req.headers.get("user-agent") });
    if (!result.stored && result.reason === "insert_failed") return NextResponse.json({ error: "We couldn’t save your request. Please call (254) 555-0123." }, { status: 500 });
    if (result.leadId && supabaseConfigured()) {
      const db = supabaseAdmin();
      const { data: currentLead } = await db.from("leads").select("notes").eq("id", result.leadId).maybeSingle();
      const existingNotes = typeof currentLead?.notes === "string" ? currentLead.notes.trim() : "";
      await db.from("leads").update({ notes: existingNotes ? `${existingNotes}\n\n${details}` : details }).eq("id", result.leadId);
      await db.from("lead_events").insert({ lead_id: result.leadId, type: "operator_intake", body: `${plan.name} intake submitted. Preferred contact: ${contactMethod}.`, actor: "system", meta: { plan: plan.id, industry, employees: clean(body.employees, 50), monthly_leads: clean(body.monthlyLeads, 50), challenges: selectedChallenges, preferred_contact: contactMethod, best_time: clean(body.bestTime, 50) } });
    }
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) { console.error("AI operator intake error:", error); return NextResponse.json({ error: "Something went wrong. Please try again or call us." }, { status: 500 }); }
}
