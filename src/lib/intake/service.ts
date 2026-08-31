import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  STARTER_PACKAGE,
  STARTER_PROMISED_DAYS,
  TOTAL_STEPS,
  missingRequirements,
  type FileKind,
  type IntakeFile,
  type IntakeRecord,
} from "./config";

const BUCKET = "client-intake";

/**
 * 24 random bytes, base64url. The client's only credential, so it has to be
 * long enough that guessing is pointless and URL-safe enough to survive being
 * pasted into a phone browser from an email.
 */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function intakeUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://tomorrowstechai.com").replace(/\/$/, "");
  return `${base}/intake/${token}`;
}

export type LoadedIntake = {
  intake: IntakeRecord;
  files: IntakeFile[];
};

/** Why a token did not open anything. The caller decides what to say. */
export type LoadFailure = "not_found" | "expired";

export async function getIntakeByToken(
  token: string
): Promise<LoadedIntake | LoadFailure> {
  const db = supabaseAdmin();

  const { data } = await db
    .from("client_intakes")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!data) return "not_found";

  const intake = data as IntakeRecord;

  // A submitted intake stays readable after expiry — the client should be able
  // to look at what they sent. Only an unfinished one goes cold.
  if (
    intake.status !== "submitted" &&
    new Date(intake.token_expires_at).getTime() < Date.now()
  ) {
    return "expired";
  }

  const { data: fileRows } = await db
    .from("intake_files")
    .select("*")
    .eq("intake_id", intake.id)
    .order("created_at", { ascending: true });

  return { intake, files: (fileRows ?? []) as IntakeFile[] };
}

/**
 * Opens an intake and returns the link to send. Called when a Starter sale
 * lands; safe to call again for the same job, which is what "resend" does.
 */
export async function createIntake(input: {
  jobId?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  businessName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<{ intake: IntakeRecord; url: string }> {
  const db = supabaseAdmin();

  if (input.jobId) {
    const { data: existing } = await db
      .from("client_intakes")
      .select("*")
      .eq("job_id", input.jobId)
      .maybeSingle();

    if (existing) {
      const intake = existing as IntakeRecord;
      return { intake, url: intakeUrl(intake.token) };
    }
  }

  const token = newToken();

  const { data, error } = await db
    .from("client_intakes")
    .insert({
      job_id: input.jobId ?? null,
      customer_id: input.customerId ?? null,
      lead_id: input.leadId ?? null,
      package: STARTER_PACKAGE,
      token,
      // Prefilled from what the sale already told us, so the client is not
      // retyping the name they just paid under.
      business_name: input.businessName ?? null,
      contact_name: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Could not open an intake: ${error?.message ?? "unknown"}`);
  }

  if (input.jobId) {
    await db.from("jobs").update({ stage: "Intake Required" }).eq("id", input.jobId);
    await db.from("job_events").insert({
      job_id: input.jobId,
      kind: "note",
      body: "Intake link issued. Waiting on the client's content — the build clock has not started.",
    });
  }

  return { intake: data as IntakeRecord, url: intakeUrl(token) };
}

/** Extends a link that went cold without minting a new one. */
export async function refreshToken(intakeId: string, days = 30): Promise<void> {
  const db = supabaseAdmin();
  const expires = new Date(Date.now() + days * 86_400_000).toISOString();
  await db.from("client_intakes").update({ token_expires_at: expires }).eq("id", intakeId);
}

/**
 * Saves one step. Only the columns the caller passed are written, and only
 * ones the whitelist allows — the token identifies a client, it does not
 * entitle them to set job_id or flip status.
 */
const WRITABLE = new Set([
  "business_name", "contact_name", "email", "phone", "business_address",
  "service_area", "business_hours", "google_business_url",
  "business_description", "services_offered", "home_page_content",
  "services_page_content", "contact_page_info", "primary_cta", "testimonials",
  "brand_colors", "example_websites", "legal_text", "social_links",
  "domain_status", "domain_name", "registrar", "domain_notes",
  "attest_turnaround", "attest_rights",
]);

export async function saveStep(
  intake: IntakeRecord,
  step: number,
  patch: Record<string, unknown>
): Promise<IntakeRecord> {
  const db = supabaseAdmin();

  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (WRITABLE.has(key)) update[key] = value;
  }

  // Furthest step reached, never backwards — someone stepping back to fix
  // step 2 has not un-finished step 4.
  const nextStep = Math.min(Math.max(step, intake.current_step), TOTAL_STEPS);
  update.current_step = nextStep;

  const { data, error } = await db
    .from("client_intakes")
    .update(update)
    .eq("id", intake.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Could not save that step: ${error?.message ?? "unknown"}`);
  }
  return data as IntakeRecord;
}

export async function addFile(
  intake: IntakeRecord,
  kind: FileKind,
  file: File
): Promise<IntakeFile> {
  const db = supabaseAdmin();

  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is larger than 25MB.");
  }

  const { count } = await db
    .from("intake_files")
    .select("id", { count: "exact", head: true })
    .eq("intake_id", intake.id);

  if ((count ?? 0) >= MAX_FILES) {
    throw new Error(`That is already ${MAX_FILES} files — plenty to work with.`);
  }

  // Original name kept for the admin, but never used as the storage key: it
  // arrives from a browser and can contain anything at all.
  const safeExt = (file.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  const path = `${intake.id}/${kind}/${randomBytes(8).toString("hex")}${safeExt}`;

  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });

  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data, error } = await db
    .from("intake_files")
    .insert({
      intake_id: intake.id,
      kind,
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select("*")
    .single();

  if (error || !data) {
    await db.storage.from(BUCKET).remove([path]);
    throw new Error(`Could not record that file: ${error?.message ?? "unknown"}`);
  }

  return data as IntakeFile;
}

export async function removeFile(intake: IntakeRecord, fileId: string): Promise<void> {
  const db = supabaseAdmin();

  const { data } = await db
    .from("intake_files")
    .select("*")
    .eq("id", fileId)
    .eq("intake_id", intake.id)
    .maybeSingle();

  if (!data) return;

  const file = data as IntakeFile;
  await db.storage.from(BUCKET).remove([file.storage_path]);
  await db.from("intake_files").delete().eq("id", file.id);
}

/** Short-lived signed URL. Admin viewing only; the bucket is never public. */
export async function signedFileUrl(path: string, seconds = 600): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export type SubmitResult =
  | { ok: true; intake: IntakeRecord }
  | { ok: false; missing: { field: string; label: string; step: number }[] };

/**
 * The gate. Re-checks completeness on the server rather than trusting that
 * the wizard disabled its own button, then moves the job to Intake Submitted.
 *
 * The stage does NOT jump to Ready to Build. Someone still has to look at what
 * arrived — "they sent something" and "we can build from it" are different
 * claims, and only a person can make the second one.
 */
export async function submitIntake(intake: IntakeRecord): Promise<SubmitResult> {
  const db = supabaseAdmin();

  const { data: fileRows } = await db
    .from("intake_files")
    .select("*")
    .eq("intake_id", intake.id);

  const files = (fileRows ?? []) as IntakeFile[];
  const missing = missingRequirements(intake, files);

  if (missing.length > 0) return { ok: false, missing };

  const { data, error } = await db
    .from("client_intakes")
    .update({ status: "submitted", submitted_at: new Date().toISOString(), current_step: TOTAL_STEPS })
    .eq("id", intake.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Could not submit: ${error?.message ?? "unknown"}`);
  }

  if (intake.job_id) {
    await db.from("jobs").update({ stage: "Intake Submitted" }).eq("id", intake.job_id);
    await db.from("job_events").insert({
      job_id: intake.job_id,
      kind: "note",
      body: `Intake submitted — ${files.length} file${files.length === 1 ? "" : "s"} received. Check it, then move to Ready to Build to start the ${STARTER_PROMISED_DAYS}-day clock.`,
    });
  }

  return { ok: true, intake: data as IntakeRecord };
}
