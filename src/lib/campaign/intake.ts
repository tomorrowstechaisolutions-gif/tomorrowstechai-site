import "server-only";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { scoreLead } from "./scoring";
import type { ScoreReason } from "@/lib/supabase/types";

/**
 * The single door every lead comes through — website form and Meta Instant
 * Forms both land here, so they get identical dedupe, scoring and follow-up
 * scheduling.
 */

export type IntakeInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  business_type?: string | null;
  current_website?: "yes" | "no" | null;
  website_url?: string | null;
  services_interested?: string[];
  timeline?: string | null;
  source?: string;
  campaign?: string | null;
  adset?: string | null;
  ad?: string | null;
  placement?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  fbclid?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  gclid?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  meta_leadgen_id?: string | null;
  meta_form_id?: string | null;
  meta_page_id?: string | null;
  email_consent?: boolean;
  sms_consent?: boolean;
  consent_text?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

export type IntakeResult = {
  stored: boolean;
  duplicate: boolean;
  leadId: string | null;
  score: number;
  reasons: ScoreReason[];
  reason?: string;
};

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8) return `+${digits}`;
  return null;
}

/** Attribution fields never overwritten once set — the first ad that paid for
 *  a lead keeps the credit even if they come back through a different link. */
const ATTRIBUTION_FIELDS = [
  "source",
  "campaign",
  "adset",
  "ad",
  "placement",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "landing_page",
  "referrer",
] as const;

/** Fields safe to fill in on a returning lead, but only where blank. */
const FILL_IF_EMPTY = [
  "phone",
  "business_name",
  "business_type",
  "current_website",
  "website_url",
  "timeline",
  "meta_leadgen_id",
  "meta_form_id",
  "meta_page_id",
] as const;

export async function intakeLead(input: IntakeInput): Promise<IntakeResult> {
  const services = (input.services_interested ?? []).filter(Boolean);
  const { score, reasons } = scoreLead({
    currentWebsite: input.current_website ?? null,
    timeline: input.timeline ?? null,
    services,
    phone: input.phone ?? null,
    businessName: input.business_name ?? null,
    businessType: input.business_type ?? null,
  });

  if (!supabaseConfigured()) {
    // The database is not the lead's only home — emails still go out. Never
    // fail the visitor's submission because storage isn't wired up yet.
    return {
      stored: false,
      duplicate: false,
      leadId: null,
      score,
      reasons,
      reason: "supabase_not_configured",
    };
  }

  const db = supabaseAdmin();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);

  // ── Find an existing contact: same email, or same phone. ────────────────
  let existing: { id: string; services_interested: string[]; submission_count: number } | null = null;

  if (input.meta_leadgen_id) {
    const { data } = await db
      .from("leads")
      .select("id, services_interested, submission_count")
      .eq("meta_leadgen_id", input.meta_leadgen_id)
      .maybeSingle();
    if (data) {
      // Meta redelivers webhooks. Same leadgen_id means we already have it.
      return {
        stored: true,
        duplicate: true,
        leadId: data.id,
        score,
        reasons,
        reason: "meta_replay",
      };
    }
  }

  {
    const { data } = await db
      .from("leads")
      .select("id, services_interested, submission_count")
      .ilike("email", email)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data && data.length) existing = data[0];
  }

  if (!existing && phone) {
    const { data } = await db
      .from("leads")
      .select("id, services_interested, submission_count")
      .eq("phone", phone)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data && data.length) existing = data[0];
  }

  // ── Returning lead: enrich, never clobber. ──────────────────────────────
  if (existing) {
    const patch: Record<string, unknown> = {
      submission_count: (existing.submission_count ?? 1) + 1,
      lead_score: score,
      lead_score_reasons: reasons,
    };

    // Union the service interest rather than replacing it.
    const mergedServices = Array.from(
      new Set([...(existing.services_interested ?? []), ...services])
    );
    if (mergedServices.length) patch.services_interested = mergedServices;

    if (input.sms_consent) {
      patch.sms_consent = true;
      patch.consent_text = input.consent_text ?? null;
      patch.consent_at = new Date().toISOString();
    }

    for (const field of FILL_IF_EMPTY) {
      const value = field === "phone" ? phone : (input[field] as unknown);
      if (value !== undefined && value !== null && value !== "") {
        patch[`__maybe_${field}`] = value;
      }
    }

    // Only write the "fill if empty" fields that are actually empty today.
    const { data: current } = await db
      .from("leads")
      .select(FILL_IF_EMPTY.join(","))
      .eq("id", existing.id)
      .maybeSingle();

    for (const field of FILL_IF_EMPTY) {
      const proposed = patch[`__maybe_${field}`];
      delete patch[`__maybe_${field}`];
      const currentValue = current
        ? (current as unknown as Record<string, unknown>)[field]
        : null;
      if (proposed !== undefined && (currentValue === null || currentValue === "")) {
        patch[field] = proposed;
      }
    }

    await db.from("leads").update(patch).eq("id", existing.id);

    await db.from("lead_events").insert({
      lead_id: existing.id,
      type: "duplicate_merge",
      body: `Submitted the form again via ${input.source ?? "website"}. Original attribution kept.`,
      actor: "system",
      meta: {
        new_source: input.source ?? "website",
        new_campaign: input.campaign ?? input.utm_campaign ?? null,
        new_landing_page: input.landing_page ?? null,
      },
    });

    await scheduleFollowups(existing.id, true);

    return { stored: true, duplicate: true, leadId: existing.id, score, reasons };
  }

  // ── New lead. ───────────────────────────────────────────────────────────
  const row: Record<string, unknown> = {
    first_name: input.first_name.trim().slice(0, 100),
    last_name: input.last_name.trim().slice(0, 100),
    email,
    phone,
    business_name: input.business_name?.trim().slice(0, 200) ?? null,
    business_type: input.business_type ?? null,
    current_website: input.current_website ?? null,
    website_url: input.website_url ?? null,
    services_interested: services,
    timeline: input.timeline ?? null,
    lead_status: "New",
    lead_score: score,
    lead_score_reasons: reasons,
    email_consent: input.email_consent ?? true,
    sms_consent: input.sms_consent ?? false,
    consent_text: input.consent_text ?? null,
    consent_at: new Date().toISOString(),
    ip_address: input.ip_address ?? null,
    user_agent: input.user_agent?.slice(0, 500) ?? null,
    fbp: input.fbp ?? null,
    fbc: input.fbc ?? null,
    meta_leadgen_id: input.meta_leadgen_id ?? null,
    meta_form_id: input.meta_form_id ?? null,
    meta_page_id: input.meta_page_id ?? null,
  };

  for (const field of ATTRIBUTION_FIELDS) {
    const value = input[field];
    if (value !== undefined) row[field] = value ?? null;
  }
  if (!row.source) row.source = "website";

  const { data: inserted, error } = await db
    .from("leads")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("Lead insert failed:", error?.message);
    return {
      stored: false,
      duplicate: false,
      leadId: null,
      score,
      reasons,
      reason: "insert_failed",
    };
  }

  await db.from("lead_events").insert({
    lead_id: inserted.id,
    type: "form_submit",
    body: `New lead via ${row.source}.`,
    actor: "system",
    meta: {
      campaign: row.campaign ?? null,
      utm_campaign: row.utm_campaign ?? null,
      landing_page: row.landing_page ?? null,
      score,
    },
  });

  await scheduleFollowups(inserted.id, false);

  return { stored: true, duplicate: false, leadId: inserted.id, score, reasons };
}

/**
 * Queues the follow-up sequence. Nothing sends from here — a scheduled job
 * drains `lead_followups`. Rows are created once per lead; a returning lead
 * does not restart the sequence.
 */
async function scheduleFollowups(leadId: string, isDuplicate: boolean) {
  if (isDuplicate) return;

  const db = supabaseAdmin();
  const now = Date.now();
  const rows = [
    { step: "confirmation", due_at: new Date(now).toISOString() },
    { step: "followup_24h", due_at: new Date(now + 24 * 3600 * 1000).toISOString() },
    { step: "followup_72h", due_at: new Date(now + 72 * 3600 * 1000).toISOString() },
  ].map((r) => ({ ...r, lead_id: leadId, channel: "email", status: "pending" }));

  const { error } = await db.from("lead_followups").upsert(rows, {
    onConflict: "lead_id,step",
    ignoreDuplicates: true,
  });
  if (error) console.error("Follow-up scheduling failed:", error.message);
}

/**
 * Stops the automated sales sequence. Called when a lead replies, books,
 * purchases, opts out, or an admin closes them. Anything already sent stays
 * sent; everything still pending is cancelled.
 */
export async function cancelPendingFollowups(leadId: string, why: string) {
  if (!supabaseConfigured()) return;
  const db = supabaseAdmin();
  await db
    .from("lead_followups")
    .update({ status: "cancelled", error: why })
    .eq("lead_id", leadId)
    .eq("status", "pending");
}
