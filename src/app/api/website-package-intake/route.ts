import { NextResponse } from "next/server";
import { intakeLead } from "@/lib/campaign/intake";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { getPublicPackage } from "@/lib/catalog/public";
import { catalogPrice } from "@/lib/catalog/types";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFERRAL_OPTIONS = ["Google", "Facebook", "Instagram", "LinkedIn", "Referral", "Existing Customer", "Other"];
const CONSENT_TEXT = "I agree to be contacted by Tomorrow’s Tech AI about my website project.";
const clean = (value: unknown, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const limit = rateLimit(`website-package-intake:${ip}`, { max: 6, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    if (clean(body.hp_company_url, 500) || (typeof body.elapsed_ms === "number" && body.elapsed_ms < 1800)) return NextResponse.json({ ok: true });

    const selectedPackage = await getPublicPackage(clean(body.packageId, 120),"websites");
    const fullName = clean(body.fullName, 200);
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() ?? "";
    const lastName = nameParts.join(" ");
    const email = clean(body.email, 200).toLowerCase();
    const phone = clean(body.phone, 40);
    const company = clean(body.company, 200);
    const project = clean(body.project, 2000);
    const referral = clean(body.referral, 60);

    if (!selectedPackage) return NextResponse.json({ error: "Please choose a website package." }, { status: 400 });
    if (!firstName || !company || !EMAIL_RE.test(email) || phone.replace(/\D/g, "").length < 10 || project.length < 10) {
      return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
    }
    if (body.consent !== true) return NextResponse.json({ error: "Please agree to be contacted about your website project." }, { status: 400 });
    if (referral && !REFERRAL_OPTIONS.includes(referral)) return NextResponse.json({ error: "Please choose a valid referral source." }, { status: 400 });

    const websiteRaw = clean(body.website, 500);
    const website = websiteRaw && !/^https?:\/\//i.test(websiteRaw) ? `https://${websiteRaw}` : websiteRaw;
    const details = [
      "Website package inquiry",
      `Service category: ${selectedPackage.category}`,
      `Selected package: ${selectedPackage.name} (${catalogPrice(selectedPackage)})`,
      `Source page: /website-intake`,
      `Project description: ${project}`,
      `How they heard about us: ${referral || "Not provided"}`,
    ].join("\n");

    const result = await intakeLead({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      business_name: company,
      business_type: "Website project",
      current_website: website ? "yes" : "no",
      website_url: website || null,
      services_interested: [`Website Package — ${selectedPackage.name}`],
      source: "website-package-intake",
      campaign: `${selectedPackage.name} · ${catalogPrice(selectedPackage)}`,
      landing_page: `/website-intake?package=${selectedPackage.slug}`,
      email_consent: true,
      sms_consent: false,
      consent_text: CONSENT_TEXT,
      ip_address: ip,
      user_agent: req.headers.get("user-agent"),
    });

    if (!result.stored) return NextResponse.json({ error: "We couldn’t save your request. Please call (254) 563-2130." }, { status: 500 });

    if (result.leadId && supabaseConfigured()) {
      const db = supabaseAdmin();
      const { data: currentLead } = await db.from("leads").select("notes").eq("id", result.leadId).maybeSingle();
      const existingNotes = typeof currentLead?.notes === "string" ? currentLead.notes.trim() : "";
      await db.from("leads").update({ notes: existingNotes ? `${existingNotes}\n\n${details}` : details }).eq("id", result.leadId);
      await db.from("lead_events").insert({
        lead_id: result.leadId,
        type: "website_package_intake",
        body: `${selectedPackage.name} website inquiry submitted.`,
        actor: "system",
        meta: { package_id:selectedPackage.id,package: selectedPackage.slug, package_name: selectedPackage.name, category:selectedPackage.category,price:catalogPrice(selectedPackage),source_page:"/website-intake", project, referral: referral || null },
      });
    }

    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("Website package intake error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again or call us." }, { status: 500 });
  }
}
