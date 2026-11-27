import "server-only";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { notifyOwner } from "@/lib/notifications/owner";
import { businessProfile } from "@/lib/settings/profile-store";
import { siteOrigin } from "@/lib/stripe/client";
import { getCourse } from "./catalog";
import { ACCESS_COOKIE, ACCESS_MAX_AGE_SECONDS, normalizeEmail, readAccess, signAccess, signLogin } from "./access-token";

/**
 * Enrollments: who bought which course.
 *
 * A purchase is recorded from two places, whichever gets there first: the
 * success redirect (/api/academy/claim) and the Stripe webhook. Both call
 * recordEnrollment(); the unique Stripe session id makes the second one a
 * no-op, and only the call that actually created the row sends the emails.
 */

/** Login links in the purchase email last a week; links asked for later last an hour. */
export const PURCHASE_LINK_TTL = 60 * 60 * 24 * 7;
export const RESTORE_LINK_TTL = 60 * 60;

export type CookieSpec = { name: string; value: string; maxAge: number };

/** The courses the current visitor can open, from their signed cookie. */
export async function currentAccess(): Promise<{ email: string | null; courses: Set<string> }> {
  const store = await cookies();
  const access = readAccess(store.get(ACCESS_COOKIE)?.value);
  return { email: access?.email ?? null, courses: new Set(access?.courses ?? []) };
}

/** A fresh access cookie for this email holding exactly these courses. */
export function accessCookie(email: string, courses: string[]): CookieSpec | null {
  const value = signAccess(email, courses);
  return value ? { name: ACCESS_COOKIE, value, maxAge: ACCESS_MAX_AGE_SECONDS } : null;
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

/** Every course this email has paid for or been given. */
export async function coursesFor(email: string): Promise<string[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabaseAdmin()
    .from("academy_enrollments")
    .select("course_slug")
    .ilike("email", normalizeEmail(email))
    .neq("status", "refunded");
  if (error) {
    console.error("Academy: enrollment lookup failed:", error.message);
    return [];
  }
  return Array.from(new Set((data ?? []).map((r) => r.course_slug as string)));
}

export function loginUrl(email: string, ttlSeconds: number, next?: string): string | null {
  const token = signLogin(email, ttlSeconds);
  if (!token) return null;
  const params = new URLSearchParams({ t: token });
  if (next) params.set("next", next);
  return `${siteOrigin()}/api/academy/access/verify?${params.toString()}`;
}

async function sendEmail(to: string, subject: string, text: string, replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const res = await new Resend(apiKey).emails.send({
    from: process.env.CONTACT_FROM_EMAIL || "Tomorrow’s Tech AI <hello@tomorrowstechai.com>",
    to,
    subject,
    text,
    ...(replyTo ? { replyTo } : {}),
  });
  if (res.error) console.error("Academy email failed:", res.error.message);
  return !res.error;
}

export async function sendLoginEmail(email: string, ttlSeconds: number, intro: string, next?: string): Promise<boolean> {
  const url = loginUrl(email, ttlSeconds, next);
  if (!url) return false;
  const hours = Math.round(ttlSeconds / 3600);
  const lasts = hours >= 48 ? `${Math.round(hours / 24)} days` : hours <= 1 ? "one hour" : `${hours} hours`;
  return sendEmail(
    email,
    "Your Tomorrow’s Tech AI Academy access",
    `${intro}

Open your courses:
${url}

The link works for ${lasts}. After that, get a new one any time at ${siteOrigin()}/academy/access using this email address.

— John
Tomorrow’s Tech AI Academy
${siteOrigin()}/academy`
  );
}

export type EnrollmentInput = {
  email: string;
  courseSlug: string;
  stripeSessionId: string;
  stripePaymentIntent: string | null;
  amountCents: number;
};

/**
 * Records a paid enrollment once. Returns true when this call created it.
 * Throws on a database error so the webhook answers 500 and Stripe retries.
 */
export async function recordEnrollment(input: EnrollmentInput): Promise<boolean> {
  const db = supabaseAdmin();
  const email = normalizeEmail(input.email);
  const course = getCourse(input.courseSlug);

  const { error } = await db.from("academy_enrollments").insert({
    email,
    course_slug: input.courseSlug,
    status: "paid",
    stripe_session_id: input.stripeSessionId,
    stripe_payment_intent: input.stripePaymentIntent,
    amount_cents: input.amountCents,
  });

  if (error) {
    if (error.code !== "23505") throw new Error(`Record the enrollment: ${error.message}`);
    // Unique clash. Either this session was already recorded (a replay, fine),
    // or the same person bought the same course twice: they keep access, and
    // John is told so he can refund the second charge.
    const { data: same } = await db.from("academy_enrollments").select("id").eq("stripe_session_id", input.stripeSessionId).maybeSingle();
    if (!same) {
      await notifyOwner("academy.sale", `Possible double purchase: ${email} bought ${course?.title ?? input.courseSlug} again. Check Stripe and refund session ${input.stripeSessionId}.`, async () => {
        const inbox = process.env.CONTACT_TO_EMAIL || (await businessProfile()).email;
        if (!inbox) return false;
        return sendEmail(inbox, `Academy: possible double purchase · ${email}`, `${email} already had ${course?.title ?? input.courseSlug} and paid again.\n\nStripe checkout session: ${input.stripeSessionId}\nAmount: $${(input.amountCents / 100).toFixed(2)}\n\nThey kept their access. Refund the second charge in Stripe if it was a mistake.`);
      });
    }
    return false;
  }

  // Money goes on the books next to everything else. Keyed on the session so a replay can't double it.
  if (input.amountCents > 0) {
    const { error: revenueError } = await db.from("revenue_events").upsert(
      {
        kind: "initial",
        category: "other",
        description: `Academy course: ${course?.title ?? input.courseSlug}`,
        amount_cents: input.amountCents,
        campaign: "Academy",
        occurred_at: new Date().toISOString(),
        external_id: `${input.stripeSessionId}:academy`,
      },
      { onConflict: "external_id", ignoreDuplicates: true }
    );
    if (revenueError) console.error("Academy: revenue booking failed:", revenueError.message);
  }

  const title = course?.title ?? input.courseSlug;
  await sendLoginEmail(
    email,
    PURCHASE_LINK_TTL,
    `Thanks for enrolling in ${title}. You're in.`,
    `/academy/${input.courseSlug}`
  ).catch((err) => console.error("Academy welcome email failed:", err));

  await notifyOwner(
    "academy.sale",
    `$${(input.amountCents / 100).toFixed(2)} · ${title} · ${email}`,
    async () => {
      const inbox = process.env.CONTACT_TO_EMAIL || (await businessProfile()).email;
      if (!inbox) return false;
      return sendEmail(
        inbox,
        `Academy sale: ${title} · $${(input.amountCents / 100).toFixed(2)}`,
        `New Academy enrollment.\n\nCourse: ${title}\nStudent: ${email}\nPaid: $${(input.amountCents / 100).toFixed(2)}\nStripe session: ${input.stripeSessionId}\n\nThey were emailed a link to their course.`,
        email
      );
    },
    "/admin/finance"
  );

  return true;
}

// ── Certificates ──────────────────────────────────────────────────────────────

export type Certificate = { id: string; name: string; course_slug: string; score: number; issued_at: string };

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function certificateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `TTA-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Issues a certificate, or returns the one this person already has for the course. */
export async function issueCertificate(email: string, name: string, courseSlug: string, score: number): Promise<Certificate> {
  const db = supabaseAdmin();
  const normalized = normalizeEmail(email);
  const existing = await db
    .from("academy_certificates")
    .select("id, name, course_slug, score, issued_at")
    .ilike("email", normalized)
    .eq("course_slug", courseSlug)
    .maybeSingle();
  if (existing.data) return existing.data as Certificate;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db
      .from("academy_certificates")
      .insert({ id: certificateCode(), email: normalized, name, course_slug: courseSlug, score })
      .select("id, name, course_slug, score, issued_at")
      .single();
    if (!error && data) return data as Certificate;
    if (error && error.code !== "23505") throw new Error(`Issue the certificate: ${error.message}`);
  }
  throw new Error("Could not issue a certificate code.");
}

export async function getCertificate(id: string): Promise<Certificate | null> {
  if (!supabaseConfigured() || !/^TTA-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) return null;
  const { data } = await supabaseAdmin()
    .from("academy_certificates")
    .select("id, name, course_slug, score, issued_at")
    .eq("id", id)
    .maybeSingle();
  return (data as Certificate | null) ?? null;
}
