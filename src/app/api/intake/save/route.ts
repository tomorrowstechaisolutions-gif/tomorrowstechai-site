import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { getIntakeByToken, saveStep } from "@/lib/intake/service";
import {
  DOMAIN_STATUSES,
  PRIMARY_CTAS,
  SOCIAL_NETWORKS,
  TOTAL_STEPS,
} from "@/lib/intake/config";

export const runtime = "nodejs";

/** Long-form answers get room; a single line does not need any. */
const LIMITS: Record<string, number> = {
  business_name: 200, contact_name: 200, email: 320, phone: 40,
  business_address: 500, service_area: 500, business_hours: 500,
  google_business_url: 500,
  business_description: 5000, services_offered: 5000,
  home_page_content: 20000, services_page_content: 20000,
  contact_page_info: 2000, testimonials: 10000,
  brand_colors: 500, example_websites: 1000, legal_text: 10000,
  domain_name: 253, registrar: 200, domain_notes: 2000,
};

function pick<T extends readonly string[]>(list: T, v: unknown): T[number] | null {
  return typeof v === "string" && (list as readonly string[]).includes(v)
    ? (v as T[number])
    : null;
}

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`intake-save:${ip}`, { max: 120, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many saves. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.token !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const loaded = await getIntakeByToken(body.token);
  if (loaded === "not_found") {
    return NextResponse.json({ error: "That link is not valid." }, { status: 404 });
  }
  if (loaded === "expired") {
    return NextResponse.json({ error: "That link has expired." }, { status: 410 });
  }
  if (loaded.intake.status === "submitted") {
    return NextResponse.json(
      { error: "This intake has already been submitted." },
      { status: 409 }
    );
  }

  const step = Number(body.step);
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) {
    return NextResponse.json({ error: "Invalid step." }, { status: 400 });
  }

  const raw = (body.fields ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const [key, max] of Object.entries(LIMITS)) {
    if (!(key in raw)) continue;
    const v = typeof raw[key] === "string" ? (raw[key] as string).trim().slice(0, max) : "";
    patch[key] = v.length ? v : null;
  }

  if ("primary_cta" in raw) patch.primary_cta = pick(PRIMARY_CTAS, raw.primary_cta);
  if ("domain_status" in raw) {
    patch.domain_status = pick(
      DOMAIN_STATUSES.map((d) => d.value) as unknown as readonly string[],
      raw.domain_status
    );
  }

  // Only known networks, only strings, capped. An open jsonb column that the
  // public can write is a place to stash anything otherwise.
  if ("social_links" in raw && raw.social_links && typeof raw.social_links === "object") {
    const src = raw.social_links as Record<string, unknown>;
    const links: Record<string, string> = {};
    for (const net of SOCIAL_NETWORKS) {
      const v = src[net.key];
      if (typeof v === "string" && v.trim()) links[net.key] = v.trim().slice(0, 500);
    }
    patch.social_links = links;
  }

  for (const flag of ["attest_turnaround", "attest_rights"] as const) {
    if (flag in raw) patch[flag] = raw[flag] === true;
  }

  try {
    const intake = await saveStep(loaded.intake, step, patch);
    return NextResponse.json({ ok: true, intake });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save." },
      { status: 500 }
    );
  }
}
