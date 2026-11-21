import { NextResponse } from "next/server";
import { Resend } from "resend";
import { intakeLead } from "@/lib/campaign/intake";
import { guideAlert } from "@/lib/guide/alert";
import { guideStep, pathSummary } from "@/lib/guide/script";
import { notifyOwner } from "@/lib/notifications/owner";
import { clientIp, rateLimitDurable } from "@/lib/rate-limit";
import { isBotSubmission } from "@/lib/spam-trap";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

/**
 * The site guide's lead. Called twice in one visit: once when the visitor
 * gives their name and email, before the questions, and once at the end with
 * the answers they picked. The lead is matched by email, so the second call
 * adds to the first and creates nothing new.
 *
 * No follow-up emails are queued: those pitch a website package, and a guide
 * visitor may have asked about something else. John follows up himself.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || "Tomorrow’s Tech AI <hello@tomorrowstechai.com>";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.tomorrowstechai.com";

export async function POST(request: Request) {
  try {
    const limit = await rateLimitDurable(`guide:${clientIp(request)}`, { max: 12, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) return NextResponse.json({ error: "Too many tries in a short time. Give it a little while." }, { status: 429 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    // Answer 200 so a bot cannot tell it was caught, and store nothing.
    if (isBotSubmission(body, "guide", 1500)) return NextResponse.json({ ok: true });

    const name = text(body.name, 120);
    const email = text(body.email, 200).toLowerCase();
    const phone = text(body.phone, 40);
    if (!name || !EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter your name and a valid email address." }, { status: 400 });

    const outcome = guideStep(text(body.outcome, 60));
    const path = Array.isArray(body.path)
      ? body.path.slice(0, 6).map((p) => ({ id: text((p as { id?: unknown })?.id, 60), choice: Number((p as { choice?: unknown })?.choice) })).filter((p) => p.id && Number.isInteger(p.choice))
      : [];
    const summary = outcome?.kind === "outcome" ? pathSummary(path, outcome.id) : "";
    const typed = Array.isArray(body.words) ? body.words.slice(0, 6).map((w) => text(w, 400)).filter(Boolean) : [];

    const parts = name.split(/\s+/);
    const intake = await intakeLead({
      first_name: parts.shift() || name,
      last_name: parts.join(" "),
      email,
      phone: phone || null,
      services_interested: outcome?.kind === "outcome" ? [outcome.need] : [],
      source: "site-guide",
      campaign: "Site guide",
      landing_page: "/guide",
      referrer: text(body.referrer, 300) || null,
      ip_address: clientIp(request),
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      schedule_followups: false,
    });

    if (intake.leadId && summary && supabaseConfigured()) {
      const { error } = await supabaseAdmin().from("lead_events").insert({
        lead_id: intake.leadId,
        type: "note",
        body: `Site guide answers:\n${summary}${typed.length ? `\nIn their own words: ${typed.map((w) => `"${w}"`).join(" ")}` : ""}${text(body.wants_call, 5) === "yes" ? "\nAsked for a call from John." : ""}`,
        meta: { source: "site-guide", outcome: outcome?.id },
        actor: "site-guide",
      });
      if (error) console.error("[guide] the answers were not written on the lead:", error.message);
    }
    // Tell John. Once when they reach a recommendation, and again if they ask for a call.
    // An email that fails must never fail the visitor: the lead is already saved.
    if (outcome?.kind === "outcome" && summary) {
      const wantsCall = text(body.wants_call, 5) === "yes";
      // "Already a lead" means from before this visit. The first call of this same visit also makes the second one a duplicate, so the lead's age decides.
      let returning = false;
      if (intake.leadId && intake.duplicate && supabaseConfigured()) {
        const { data: lead } = await supabaseAdmin().from("leads").select("created_at").eq("id", intake.leadId).maybeSingle();
        returning = Boolean(lead?.created_at) && Date.now() - new Date(lead!.created_at as string).getTime() > 60 * 60 * 1000;
      }
      const mail = guideAlert({ name, email, phone, need: outcome.need, summary, typed, wantsCall, leadUrl: intake.leadId ? `${SITE}/admin/leads/${intake.leadId}` : null, returning });
      await notifyOwner("lead.guide", `${name} · ${outcome.need}${wantsCall ? " · call requested" : ""}`, async () => {
        if (!process.env.RESEND_API_KEY) return false;
        const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: FROM_EMAIL, to: [TO_EMAIL], replyTo: email, subject: mail.subject, text: mail.text });
        if (sent.error) console.error("[guide] alert email failed:", sent.error);
        return !sent.error;
      }, intake.leadId ? `/admin/leads/${intake.leadId}` : null).catch((err: unknown) => console.error("[guide] alert email failed:", err instanceof Error ? err.message : err));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[guide] lead failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "That did not go through. Try once more." }, { status: 500 });
  }
}
