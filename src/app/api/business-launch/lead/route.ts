import { NextResponse } from "next/server";
import { intakeLead } from "@/lib/campaign/intake";
import { sendAdminNotification, sendLeadConfirmation } from "@/lib/campaign/emails";
import { sendCapiEvent } from "@/lib/meta/capi";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import {
  BUSINESS_TYPES,
  SERVICE_OPTIONS,
  TIMELINES,
} from "@/lib/campaign/config";
import { offerByName } from "@/lib/campaign/offers";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Anything not on the whitelist is dropped rather than trusted. */
function pickFrom<T extends readonly string[]>(
  list: T,
  value: unknown
): T[number] | null {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optional(value: unknown, max = 300): string | null {
  const v = text(value, max);
  return v.length ? v : null;
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);

    const limit = rateLimit(`bl-lead:${ip}`, { max: 6, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many submissions. Try again in a little while." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    // Which landing page this came from. Resolved against a whitelist, so a
    // crafted body cannot invent a campaign or a conversion value.
    const offer = offerByName(text(body.offer_name, 200));

    // ── Spam traps ────────────────────────────────────────────────────────
    // Return 200 so a bot can't tell it was caught, but store nothing.
    const honeypot = text(body.hp_company_url, 500);
    const elapsed = typeof body.elapsed_ms === "number" ? body.elapsed_ms : 99999;
    if (honeypot || elapsed < 1800) {
      return NextResponse.json({ ok: true });
    }

    // ── Validation ────────────────────────────────────────────────────────
    const first_name = text(body.first_name, 100);
    const last_name = text(body.last_name, 100);
    const email = text(body.email, 200).toLowerCase();
    const phone = text(body.phone, 40);
    const business_name = text(body.business_name, 200);

    if (!first_name || !last_name || !business_name) {
      return NextResponse.json(
        { error: "Name and business name are required." },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }
    if (phone.replace(/\D/g, "").length < 10) {
      return NextResponse.json(
        { error: "Enter a valid phone number." },
        { status: 400 }
      );
    }

    const rawServices: unknown[] = Array.isArray(body.services_interested)
      ? body.services_interested
      : [];
    const services = rawServices
      .map((s) => pickFrom(SERVICE_OPTIONS, s))
      .filter((s): s is (typeof SERVICE_OPTIONS)[number] => Boolean(s))
      .slice(0, SERVICE_OPTIONS.length);

    const website =
      body.current_website === "yes" || body.current_website === "no"
        ? body.current_website
        : null;

    const a = (body.attribution ?? {}) as Record<string, unknown>;

    const result = await intakeLead({
      first_name,
      last_name,
      email,
      phone,
      business_name,
      business_type: pickFrom(BUSINESS_TYPES, body.business_type),
      current_website: website,
      services_interested: services,
      timeline: pickFrom(TIMELINES, body.timeline),
      source: optional(a.source, 60) ?? "website",
      campaign: optional(a.campaign, 200) ?? offer.name,
      adset: optional(a.adset, 200),
      ad: optional(a.ad, 200),
      placement: optional(a.placement, 100),
      utm_source: optional(a.utm_source, 200),
      utm_medium: optional(a.utm_medium, 200),
      utm_campaign: optional(a.utm_campaign, 200),
      utm_content: optional(a.utm_content, 200),
      utm_term: optional(a.utm_term, 200),
      fbclid: optional(a.fbclid, 500),
      fbp: optional(a.fbp, 200),
      fbc: optional(a.fbc, 500),
      gclid: optional(a.gclid, 500),
      landing_page: optional(a.landing_page, 500) ?? "/business-launch",
      referrer: optional(a.referrer, 500),
      email_consent: true,
      sms_consent: body.sms_consent === true,
      consent_text: optional(body.consent_text, 500),
      ip_address: ip,
      user_agent: req.headers.get("user-agent"),
    });

    // ── Notifications. Never let an email failure fail the submission. ────
    const [, adminOk] = await Promise.all([
      sendLeadConfirmation({ firstName: first_name, email }),
      sendAdminNotification({
        leadId: result.leadId,
        firstName: first_name,
        lastName: last_name,
        email,
        phone,
        businessName: business_name,
        businessType: pickFrom(BUSINESS_TYPES, body.business_type),
        currentWebsite: website,
        services,
        timeline: pickFrom(TIMELINES, body.timeline),
        score: result.score,
        reasons: result.reasons,
        duplicate: result.duplicate,
        stored: result.stored,
        source: optional(a.source, 60) ?? "website",
        campaign: optional(a.campaign, 200) ?? offer.name,
        ad: optional(a.ad, 200),
        placement: optional(a.placement, 100),
        landingPage: optional(a.landing_page, 500),
      }),
    ]);

    if (result.leadId && supabaseConfigured()) {
      // The confirmation step is done the moment the email goes out.
      await supabaseAdmin()
        .from("lead_followups")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("lead_id", result.leadId)
        .eq("step", "confirmation")
        .eq("status", "pending");

      if (!adminOk) {
        await supabaseAdmin().from("lead_events").insert({
          lead_id: result.leadId,
          type: "email_failed",
          body: "Admin notification email did not send.",
          actor: "system",
        });
      }
    }

    // ── Server half of the Meta conversion, deduped by event_id. ──────────
    const eventId = text(body.event_id, 100);
    if (eventId) {
      await sendCapiEvent({
        eventName: "Lead",
        eventId,
        eventSourceUrl: optional(a.landing_page, 500)
          ? `https://tomorrowstechai.com${optional(a.landing_page, 500)}`
          : `https://tomorrowstechai.com/${offer.id}`,
        user: {
          email,
          phone,
          firstName: first_name,
          lastName: last_name,
          country: "us",
          fbp: optional(a.fbp, 200),
          fbc: optional(a.fbc, 500),
          externalId: result.leadId,
          clientIp: ip,
          userAgent: req.headers.get("user-agent"),
        },
        customData: {
          content_name: offer.name,
          value: offer.price,
          currency: offer.currency,
          lead_score: result.score,
        },
      });
    }

    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (err) {
    console.error("Business Launch lead route error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again, or call (254) 563-2130." },
      { status: 500 }
    );
  }
}
