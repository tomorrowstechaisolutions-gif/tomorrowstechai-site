import { NextResponse } from "next/server";
import { intakeLead } from "@/lib/campaign/intake";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import {
  AI_USE_OPTIONS,
  INITIATIVE_NAME,
  INITIATIVE_PATH,
  INITIATIVE_SOURCES,
  INITIATIVE_TAGS,
  MODERNIZATION_OPTIONS,
  ORGANIZATION_TYPES,
  PARTNERSHIP_OPTIONS,
  PILOT_INTEREST_OPTIONS,
  type InitiativeKind,
} from "@/lib/central-texas-ai/config";
import { sendInitiativeAdminNotice, sendInitiativeConfirmation } from "@/lib/central-texas-ai/emails";

export const runtime = "nodejs";

/**
 * Both Central Texas AI Initiative forms post here.
 *
 * Leads go into the existing CRM (`leads` via intakeLead — same dedupe and
 * first-touch attribution as every other form), identified by `source` and
 * `tags`. Every field the visitor typed is kept on the `form_submit` lead
 * event, which the lead page renders as "Initiative submission".
 *
 * These are NOT sales leads, so the automated 24h/72h package follow-ups are
 * never queued for them.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KINDS: readonly InitiativeKind[] = ["business", "partner"];

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

/** Accept "example.com" as well as "https://example.com"; drop anything else. */
function cleanUrl(raw: string): string | null {
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.hostname.includes(".") ? url.toString().slice(0, 300) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limited = rateLimit(`ctai-interest:${ip}`, { max: 8, windowMs: 60 * 60 * 1000 });
    if (!limited.ok) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const kind = text(body.kind, 20) as InitiativeKind;
    if (!KINDS.includes(kind)) return NextResponse.json({ error: "Invalid inquiry type." }, { status: 400 });

    // Bots: trap field filled, or the form submitted faster than a person can.
    // The trap's name deliberately contains no word a browser autofills on
    // (company, url, name, email…) — the old `hp_company_url` was being
    // filled by Chrome's organisation autofill, silently dropping real people.
    // Every drop is logged so it can never fail invisibly again.
    const elapsed = Number(body.elapsed_ms || 0);
    const trap = text(body.ctai_trap_zq, 300);
    if (trap || elapsed < 1500) {
      console.warn("Central Texas AI submission dropped as bot:", JSON.stringify({ kind, trapFilled: Boolean(trap), elapsed, email: text(body.email, 200) }));
      return NextResponse.json({ ok: true });
    }

    const contactName = text(body.contact_name, 150);
    const email = text(body.email, 200).toLowerCase();
    const phone = text(body.phone, 40);
    const city = text(body.city, 100);
    const consent = body.consent === "yes";
    const organization = kind === "business" ? text(body.business_name, 200) : text(body.organization_name, 200);

    if (!contactName || !organization || !city || !consent) return NextResponse.json({ error: "Please complete all required fields and provide contact permission." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

    const modernization = list(body.modernization, MODERNIZATION_OPTIONS);
    const partnershipInterest = list(body.partnership_interest, PARTNERSHIP_OPTIONS);
    const aiUse = text(body.ai_use, 30);
    const pilotInterest = text(body.pilot_interest, 60);
    const organizationType = text(body.organization_type, 100);
    if (kind === "business" && (!AI_USE_OPTIONS.includes(aiUse) || !PILOT_INTEREST_OPTIONS.includes(pilotInterest) || !text(body.challenge, 2000) || !text(body.industry, 120) || !text(body.zip, 10))) {
      return NextResponse.json({ error: "Please complete all required business fields." }, { status: 400 });
    }
    if (kind === "partner" && (!ORGANIZATION_TYPES.includes(organizationType) || !text(body.title, 120) || !text(body.message, 2500))) {
      return NextResponse.json({ error: "Please complete all required organization fields." }, { status: 400 });
    }

    const website = kind === "partner" ? cleanUrl(text(body.website, 300)) : null;

    // Everything the visitor typed, keyed as DETAIL_LABELS in the config expects.
    const details: Record<string, unknown> = kind === "business"
      ? {
          business_name: organization,
          contact_name: contactName,
          city,
          zip: text(body.zip, 10),
          industry: text(body.industry, 120),
          employee_count: text(body.employee_count, 20),
          ai_use: aiUse,
          modernization,
          challenge: text(body.challenge, 2000),
          pilot_interest: pilotInterest,
        }
      : {
          organization_name: organization,
          contact_name: contactName,
          title: text(body.title, 120),
          organization_type: organizationType,
          city,
          website,
          partnership_interest: partnershipInterest,
          message: text(body.message, 2500),
        };

    const { firstName, lastName } = splitName(contactName);
    const source = INITIATIVE_SOURCES[kind];
    const tags = INITIATIVE_TAGS[kind];

    const result = await intakeLead({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      business_name: organization,
      business_type: kind === "business" ? text(body.industry, 120) : organizationType,
      website_url: website,
      services_interested: kind === "business" ? modernization : partnershipInterest,
      timeline: kind === "business" ? pilotInterest : "Partnership discussion",
      source,
      campaign: INITIATIVE_NAME,
      landing_page: INITIATIVE_PATH,
      email_consent: true,
      sms_consent: false,
      consent_text: kind === "business"
        ? "I give Tomorrow’s Tech AI permission to contact me regarding the Central Texas AI Business Modernization Initiative."
        : "I give Tomorrow’s Tech AI permission to contact me about this partnership inquiry.",
      ip_address: ip,
      user_agent: request.headers.get("user-agent"),
      schedule_followups: false,
    });

    if (!result.stored || !result.leadId) {
      // Don't lose it: John still gets every field by email.
      await sendInitiativeAdminNotice({ kind, details, email, phone, leadId: null, duplicate: false, confirmationSent: false });
      return NextResponse.json({ error: "We could not save your inquiry. Please try again or contact john@tomorrowstechai.com." }, { status: 503 });
    }

    const confirmationSent = await sendInitiativeConfirmation(kind, email, firstName);

    if (supabaseConfigured()) {
      const db = supabaseAdmin();

      // Tags: union with whatever the contact already carries. A failure here
      // (e.g. the tags migration not applied yet) must not fail the visitor.
      const { data: current, error: readError } = await db.from("leads").select("tags").eq("id", result.leadId).maybeSingle();
      if (readError) {
        console.error("Central Texas AI tag read failed:", readError.message);
      } else {
        const existing = ((current as { tags?: string[] | null } | null)?.tags ?? []) as string[];
        const merged = Array.from(new Set([...existing, ...tags]));
        const { error: tagError } = await db.from("leads").update({ tags: merged }).eq("id", result.leadId);
        if (tagError) console.error("Central Texas AI tag update failed:", tagError.message);
      }

      const { error: eventError } = await db.from("lead_events").insert([
        {
          lead_id: result.leadId,
          type: "form_submit",
          body: kind === "business"
            ? `Central Texas AI Initiative — business interest form (${organization}).`
            : `Central Texas AI Initiative — partner inquiry from ${organization} (${organizationType}).`,
          actor: "system",
          meta: { initiative_form: kind, source, tags, duplicate: result.duplicate, email, phone, ...details },
        },
        {
          lead_id: result.leadId,
          type: confirmationSent ? "email_sent" : "email_failed",
          body: confirmationSent
            ? `Central Texas AI ${kind === "business" ? "business interest" : "partnership inquiry"} confirmation email sent.`
            : `Central Texas AI ${kind === "business" ? "business interest" : "partnership inquiry"} confirmation email failed to send.`,
          actor: "system",
          meta: { initiative_form: kind, template: `ctai_${kind}_confirmation` },
        },
      ]);
      if (eventError) console.error("Central Texas AI lead event insert failed:", eventError.message);
    }

    await sendInitiativeAdminNotice({ kind, details, email, phone, leadId: result.leadId, duplicate: result.duplicate, confirmationSent });

    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("Central Texas AI interest route error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
