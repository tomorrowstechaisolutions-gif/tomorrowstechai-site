"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { audienceSize, sanitizeFilters } from "@/lib/email-marketing/audience";
import { checkSendingDomain } from "@/lib/email-marketing/health";
import { buildRecipientList, sendCampaign, sendTestEmail } from "@/lib/email-marketing/send";
import { suppress, unsuppress } from "@/lib/email-marketing/suppression";
import {
  isEmail,
  normalizeEmail,
  slugify,
  type EmailBlock,
} from "@/lib/email-marketing/types";

/**
 * Writes for the Email Marketing screens.
 *
 * Same posture as every other action file here: re-check the admin on every
 * call, use the REQUEST-SCOPED client so RLS applies on top of that check,
 * and never reach for the service role — nothing on these screens needs to
 * read a secret. The provider key is read inside lib/email-marketing/send.ts
 * on the server and never crosses into a component.
 *
 * A NOTE ON THIS FILE'S SHAPE: a "use server" module may export nothing but
 * async functions. Constants and types live in lib/email-marketing/types.ts.
 * `export type` is fine — types are erased — but an exported const array
 * here is a build error that only `next build` surfaces.
 *
 * THE RULE THAT RUNS THROUGH THE SENDING ACTIONS: no action here decides on
 * its own whether a campaign may go out. The approval gate is a database
 * trigger and the suppression check is in the send path, so a bug in this
 * file cannot mail somebody who opted out.
 */

const EMAIL = "/admin/marketing/email";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email, role: session.admin.role };
}

/** Sending is owner/admin only. Viewers can look, not mail 1,800 people. */
async function requireSender() {
  const session = await requireAdmin();
  if (!["owner", "admin"].includes(session.role)) {
    throw new Error("You do not have permission to send campaigns.");
  }
  return session;
}

function text(form: FormData, key: string): string | null {
  const raw = form.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function required(form: FormData, key: string, label: string): string {
  const value = text(form, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function flag(form: FormData, key: string): boolean {
  const raw = form.get(key);
  return raw === "on" || raw === "true" || raw === "1";
}

function whole(form: FormData, key: string): number | null {
  const raw = text(form, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("That value must be a whole number.");
  return parsed;
}

/** Blocks arrive as JSON from the composer. Anything malformed is refused. */
function blocks(form: FormData, key = "blocks"): EmailBlock[] {
  const raw = text(form, key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed as EmailBlock[];
  } catch {
    throw new Error("The email content could not be read. Nothing was saved.");
  }
}

/**
 * A wall-clock time in a named zone, as a UTC instant.
 *
 * Done with Intl rather than a date library because the project has none,
 * and done in two passes because one is wrong for the hour either side of a
 * DST change — which is exactly when a mis-scheduled campaign goes out at
 * 3am and nobody can explain why.
 */
function zonedToUtc(date: string, time: string, timezone: string): string {
  const offsetAt = (instant: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(instant);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return asUtc - instant.getTime();
  };

  const naive = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(naive.getTime())) throw new Error("That date and time could not be read.");

  let guess = new Date(naive.getTime() - offsetAt(naive));
  guess = new Date(naive.getTime() - offsetAt(guess));
  return guess.toISOString();
}

async function logEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ids: { campaignId?: string | null; sequenceId?: string | null; audienceId?: string | null },
  kind: string,
  body: string,
  actor: string
) {
  // Activity is a record, not a gate: a failed log must never fail the write
  // it was describing.
  await supabase.from("email_campaign_events").insert({
    campaign_id: ids.campaignId ?? null,
    sequence_id: ids.sequenceId ?? null,
    audience_id: ids.audienceId ?? null,
    kind, body, actor,
  });
}

function refresh(campaignId?: string) {
  revalidatePath(EMAIL);
  if (campaignId) revalidatePath(`${EMAIL}/campaigns/${campaignId}`);
}

/* ── Campaigns ─────────────────────────────────────────────────────── */

export async function createCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const name = required(form, "name", "Campaign name");
  const slug = slugify(text(form, "slug") ?? `${name}-${Date.now().toString(36)}`);

  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      name,
      internal_name: text(form, "internal_name"),
      slug,
      description: text(form, "description"),
      campaign_type: text(form, "campaign_type") ?? "newsletter",
      customer_id: text(form, "customer_id"),
      audience_id: text(form, "audience_id"),
      template_id: text(form, "template_id"),
      brand_profile_id: text(form, "brand_profile_id"),
      sending_domain_id: text(form, "sending_domain_id"),
      service_id: text(form, "service_id"),
      owner: text(form, "owner") ?? actor,
      created_by: actor,
      approval_mode: text(form, "approval_mode") ?? "none",
      timezone: text(form, "timezone") ?? "America/Chicago",
      subject: text(form, "subject"),
      preview_text: text(form, "preview_text"),
      from_name: text(form, "from_name"),
      from_email: text(form, "from_email"),
      reply_to: text(form, "reply_to"),
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Another campaign already uses that slug.");
    throw new Error(error.message);
  }

  // Starting from a template copies its body ONCE. The campaign then owns
  // its content — editing the template later must not rewrite a campaign
  // that already went out.
  const templateId = text(form, "template_id");
  if (templateId) {
    const { data: template } = await supabase
      .from("email_templates")
      .select("subject, preview_text, blocks, tone")
      .eq("id", templateId)
      .maybeSingle();
    if (template) {
      await supabase
        .from("email_campaigns")
        .update({
          subject: text(form, "subject") ?? template.subject,
          preview_text: text(form, "preview_text") ?? template.preview_text,
          blocks: template.blocks ?? [],
          tone: template.tone ?? "default",
        })
        .eq("id", data.id);
    }
  }

  await logEvent(supabase, { campaignId: data.id }, "created", `${name} was created.`, actor);
  refresh(data.id);
  redirect(`${EMAIL}/campaigns/${data.id}`);
}

export async function updateCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const id = required(form, "campaign_id", "Campaign");

  const { error } = await supabase
    .from("email_campaigns")
    .update({
      name: required(form, "name", "Campaign name"),
      internal_name: text(form, "internal_name"),
      description: text(form, "description"),
      campaign_type: text(form, "campaign_type") ?? "newsletter",
      customer_id: text(form, "customer_id"),
      service_id: text(form, "service_id"),
      owner: text(form, "owner"),
      approval_mode: text(form, "approval_mode") ?? "none",
      sending_domain_id: text(form, "sending_domain_id"),
      brand_profile_id: text(form, "brand_profile_id"),
      timezone: text(form, "timezone") ?? "America/Chicago",
      notes: text(form, "notes"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, { campaignId: id }, "updated", "Campaign settings updated.", actor);
  refresh(id);
}

export async function saveCampaignContentAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const id = required(form, "campaign_id", "Campaign");

  const { error } = await supabase
    .from("email_campaigns")
    .update({
      subject: text(form, "subject"),
      preview_text: text(form, "preview_text"),
      from_name: text(form, "from_name"),
      from_email: text(form, "from_email"),
      reply_to: text(form, "reply_to"),
      tone: text(form, "tone") ?? "default",
      blocks: blocks(form),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, { campaignId: id }, "updated", "Email content updated.", actor);
  refresh(id);
}

export async function setCampaignAudienceAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const id = required(form, "campaign_id", "Campaign");
  const audienceId = text(form, "audience_id");

  const { error } = await supabase
    .from("email_campaigns")
    .update({ audience_id: audienceId })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Resolving now means the composer can show a real, suppression-aware
  // size before anybody commits to a send.
  if (audienceId) {
    const size = await audienceSize(supabase, audienceId);
    await supabase
      .from("email_audiences")
      .update({ cached_size: size.sendable, cached_at: new Date().toISOString() })
      .eq("id", audienceId);
    await logEvent(
      supabase, { campaignId: id }, "audience_changed",
      `Audience set. ${size.sendable} can be emailed; ${size.suppressed} are suppressed or have no consent.`,
      actor
    );
  }

  refresh(id);
}

/* ── Approval ──────────────────────────────────────────────────────── */

export async function requestApprovalAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const id = required(form, "campaign_id", "Campaign");

  const { error } = await supabase
    .from("email_campaigns")
    .update({ status: "waiting_approval", approval_status: "waiting" })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, { campaignId: id }, "approval_requested", "Approval requested.", actor);
  refresh(id);
}

export async function approveCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const id = required(form, "campaign_id", "Campaign");

  const { error } = await supabase
    .from("email_campaigns")
    .update({
      approval_status: "approved",
      approved_by: actor,
      approval_notes: text(form, "approval_notes"),
      status: "approved",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, { campaignId: id }, "approved", `Approved by ${actor}.`, actor);
  refresh(id);
}

export async function reviewCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const id = required(form, "campaign_id", "Campaign");
  const decision = required(form, "decision", "Decision");
  if (!["changes_requested", "rejected"].includes(decision)) {
    throw new Error("That is not a review decision.");
  }
  const notes = text(form, "approval_notes");
  if (!notes) throw new Error("Say what needs to change — a rejection with no reason cannot be acted on.");

  const { error } = await supabase
    .from("email_campaigns")
    .update({ approval_status: decision, approval_notes: notes, status: "draft" })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(
    supabase, { campaignId: id },
    decision === "rejected" ? "rejected" : "changes_requested",
    notes, actor
  );
  refresh(id);
}

/* ── Scheduling and sending ────────────────────────────────────────── */

export async function scheduleCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const id = required(form, "campaign_id", "Campaign");
  const date = required(form, "send_date", "Send date");
  const time = required(form, "send_time", "Send time");
  const timezone = text(form, "timezone") ?? "America/Chicago";

  const scheduledAt = zonedToUtc(date, time, timezone);
  if (new Date(scheduledAt).getTime() < Date.now() - 60_000) {
    throw new Error("That time is in the past. Pick a future time, or use Send Now.");
  }

  // Freezing the list at schedule time rather than at send time means the
  // size shown on the confirmation is the size that actually goes out.
  const built = await buildRecipientList(supabase, id);
  if (built.sendable === 0) {
    throw new Error(
      "Nobody in this audience can be emailed — everyone is suppressed, unsubscribed or has no consent recorded."
    );
  }

  const { error } = await supabase
    .from("email_campaigns")
    .update({ status: "scheduled", scheduled_at: scheduledAt, timezone })
    .eq("id", id);
  // The approval gate is a database trigger, so this is where an unapproved
  // campaign is refused — with the trigger's own sentence.
  if (error) throw new Error(error.message);

  await logEvent(
    supabase, { campaignId: id }, "scheduled",
    `Scheduled for ${date} ${time} (${timezone}) to ${built.sendable} recipients. ${built.skipped} suppressed.`,
    actor
  );
  refresh(id);
}

export async function unscheduleCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const id = required(form, "campaign_id", "Campaign");

  const { error } = await supabase
    .from("email_campaigns")
    .update({ status: "draft", scheduled_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, { campaignId: id }, "unscheduled", "Schedule cleared.", actor);
  refresh(id);
}

export async function sendCampaignNowAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const id = required(form, "campaign_id", "Campaign");

  const built = await buildRecipientList(supabase, id);
  if (built.sendable === 0) {
    throw new Error(
      "Nobody in this audience can be emailed — everyone is suppressed, unsubscribed or has no consent recorded."
    );
  }

  const summary = await sendCampaign(supabase, id, { limit: 500, actor });
  await logEvent(supabase, { campaignId: id }, "sending", summary.message, actor);
  refresh(id);
}

export async function sendTestAction(form: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = required(form, "campaign_id", "Campaign");
  const raw = required(form, "test_emails", "Test address");
  const addresses = raw.split(/[,;\s]+/).map(normalizeEmail).filter(Boolean);

  const bad = addresses.filter((a) => !isEmail(a));
  if (bad.length > 0) throw new Error(`Not a usable address: ${bad.join(", ")}`);

  const result = await sendTestEmail(supabase, id, addresses);
  if (!result.ok) throw new Error(result.message);
  refresh(id);
}

export async function pauseCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const id = required(form, "campaign_id", "Campaign");

  const { error } = await supabase
    .from("email_campaigns")
    .update({ status: "paused", scheduled_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Anyone already sent stays sent. Pausing stops the queue, it does not
  // recall mail, and the event says so plainly.
  await logEvent(
    supabase, { campaignId: id }, "paused",
    "Campaign paused. Anything already sent has gone; the rest of the queue is held.", actor
  );
  refresh(id);
}

export async function resumeCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const id = required(form, "campaign_id", "Campaign");

  const { error } = await supabase.from("email_campaigns").update({ status: "draft" }).eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, { campaignId: id }, "resumed", "Campaign moved back to draft.", actor);
  refresh(id);
}

export async function duplicateCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const id = required(form, "campaign_id", "Campaign");

  const { data: source, error } = await supabase
    .from("email_campaigns")
    .select(
      "name, internal_name, description, campaign_type, customer_id, audience_id, template_id, brand_profile_id, sending_domain_id, service_id, subject, preview_text, from_name, from_email, reply_to, blocks, tone, approval_mode, timezone"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!source) throw new Error("That campaign no longer exists.");

  const name = `${source.name} (copy)`;
  // A duplicate is ALWAYS a draft with no schedule and no approval, whatever
  // the original was. Copying an approved, scheduled campaign and having it
  // go out an hour later is the accident this prevents.
  const { data: created, error: insertError } = await supabase
    .from("email_campaigns")
    .insert({
      ...source,
      name,
      slug: slugify(`${name}-${Date.now().toString(36)}`),
      status: "draft",
      scheduled_at: null,
      sent_at: null,
      approval_status: source.approval_mode === "none" ? "not_required" : "waiting",
      approved_by: null,
      approved_at: null,
      created_by: actor,
      owner: actor,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  await logEvent(supabase, { campaignId: created.id }, "created", `Duplicated from ${source.name}.`, actor);
  refresh();
  redirect(`${EMAIL}/campaigns/${created.id}`);
}

export async function archiveCampaignAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const id = required(form, "campaign_id", "Campaign");

  const { error } = await supabase.from("email_campaigns").update({ is_archived: true }).eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, { campaignId: id }, "archived", "Campaign archived.", actor);
  refresh(id);
}

/* ── Audiences ─────────────────────────────────────────────────────── */

export async function saveAudienceAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const audienceId = text(form, "audience_id");
  const name = required(form, "name", "Audience name");

  // Multi-selects arrive as repeated keys; only allowlisted ones survive
  // sanitizeFilters, so a hand-crafted POST cannot smuggle a filter in.
  const list = (key: string) =>
    form.getAll(key).filter((v): v is string => typeof v === "string" && v.length > 0);

  const filters = sanitizeFilters({
    lead_status: list("lead_status"),
    business_type: list("business_type"),
    source: list("source"),
    customer_status: list("customer_status"),
    assigned_to: text(form, "assigned_to"),
    state: text(form, "state"),
    created_after: text(form, "created_after"),
    created_before: text(form, "created_before"),
    last_contacted_before: text(form, "last_contacted_before"),
    require_consent: flag(form, "require_consent"),
  });

  const row = {
    name,
    description: text(form, "description"),
    customer_id: text(form, "customer_id"),
    audience_type: text(form, "audience_type") ?? "dynamic_segment",
    source: text(form, "source_table") ?? "leads",
    filters,
    owner: text(form, "owner") ?? actor,
  };

  if (audienceId) {
    const { error } = await supabase.from("email_audiences").update(row).eq("id", audienceId);
    if (error) throw new Error(error.message);
    await logEvent(supabase, { audienceId }, "updated", `Audience "${name}" updated.`, actor);
    await refreshAudienceSize(supabase, audienceId);
  } else {
    const { data, error } = await supabase
      .from("email_audiences")
      .insert({ ...row, created_by: actor })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error(`An audience called "${name}" already exists.`);
      throw new Error(error.message);
    }
    await logEvent(supabase, { audienceId: data.id }, "created", `Audience "${name}" created.`, actor);
    await refreshAudienceSize(supabase, data.id);
  }

  refresh();
}

async function refreshAudienceSize(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  audienceId: string
) {
  try {
    const size = await audienceSize(supabase, audienceId);
    await supabase
      .from("email_audiences")
      .update({ cached_size: size.sendable, cached_at: new Date().toISOString() })
      .eq("id", audienceId);
  } catch {
    // A segment that cannot be resolved right now keeps its previous cached
    // figure, which is shown with its timestamp so nobody mistakes it for live.
  }
}

export async function refreshAudienceSizeAction(form: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const audienceId = required(form, "audience_id", "Audience");
  const size = await audienceSize(supabase, audienceId);
  await supabase
    .from("email_audiences")
    .update({ cached_size: size.sendable, cached_at: new Date().toISOString() })
    .eq("id", audienceId);
  refresh();
}

/**
 * Import addresses into a static list.
 *
 * Pasted text rather than a file upload, because that is what actually
 * happens: somebody copies a column out of a spreadsheet. Every row is
 * validated, deduplicated, and matched against existing leads so the CRM
 * stays the source of truth for consent rather than the CSV.
 *
 * NOTHING HERE RESUBSCRIBES ANYBODY. An imported address that is already on
 * the suppression list is added to the list as unsubscribed, so re-importing
 * an old spreadsheet cannot undo an opt-out. §26.
 */
export async function importAudienceMembersAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const audienceId = required(form, "audience_id", "Audience");
  const raw = required(form, "contacts", "Contacts");

  const rows: { email: string; first?: string; last?: string; company?: string }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // email, first, last, company — extra columns ignored.
    const [emailRaw, first, last, company] = trimmed.split(/\s*[,\t]\s*/);
    const email = normalizeEmail(emailRaw ?? "");
    if (!email || !isEmail(email)) continue;
    rows.push({ email, first, last, company });
  }

  if (rows.length === 0) throw new Error("No usable email addresses were found in that list.");

  const unique = [...new Map(rows.map((r) => [r.email, r] as const)).values()];
  const emails = unique.map((r) => r.email);

  const [{ data: leads }, { data: suppressed }] = await Promise.all([
    supabase.from("leads").select("id, email").in("email", emails),
    supabase.from("email_suppressions").select("email").in("email", emails),
  ]);

  const leadByEmail = new Map(
    (leads ?? []).map((l) => [normalizeEmail((l.email as string) ?? ""), l.id as string] as const)
  );
  const suppressedSet = new Set((suppressed ?? []).map((s) => normalizeEmail(s.email as string)));

  const payload = unique.map((r) => ({
    audience_id: audienceId,
    email: r.email,
    first_name: r.first || null,
    last_name: r.last || null,
    company: r.company || null,
    lead_id: leadByEmail.get(r.email) ?? null,
    // Already opted out? They join the list already unsubscribed.
    subscribed: !suppressedSet.has(r.email),
    source: "import",
  }));

  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await supabase
      .from("email_audience_members")
      .upsert(payload.slice(i, i + 200), { onConflict: "audience_id,email", ignoreDuplicates: false });
    if (error) throw new Error(`import: ${error.message}`);
  }

  await logEvent(
    supabase, { audienceId }, "audience_imported",
    `Imported ${payload.length} contacts. ${suppressedSet.size} were already unsubscribed and were added as unsubscribed.`,
    actor
  );
  await refreshAudienceSize(supabase, audienceId);
  refresh();
}

/* ── Templates ─────────────────────────────────────────────────────── */

export async function saveTemplateAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const templateId = text(form, "template_id");
  const name = required(form, "name", "Template name");

  const row = {
    name,
    description: text(form, "description"),
    customer_id: text(form, "customer_id"),
    brand_profile_id: text(form, "brand_profile_id"),
    category: text(form, "category") ?? "other",
    subject: text(form, "subject"),
    preview_text: text(form, "preview_text"),
    tone: text(form, "tone") ?? "default",
    blocks: blocks(form),
    status: text(form, "status") ?? "draft",
  };

  if (templateId) {
    const { error } = await supabase.from("email_templates").update(row).eq("id", templateId);
    if (error) throw new Error(error.message);
    // Templates are copied into a campaign at creation, never read at send
    // time, so editing one cannot change a campaign that already went out.
    await logEvent(supabase, {}, "template_updated", `Template "${name}" updated.`, actor);
  } else {
    const { error } = await supabase.from("email_templates").insert({ ...row, created_by: actor });
    if (error) {
      if (error.code === "23505") throw new Error(`A template called "${name}" already exists.`);
      throw new Error(error.message);
    }
    await logEvent(supabase, {}, "template_updated", `Template "${name}" created.`, actor);
  }

  refresh();
}

export async function archiveTemplateAction(form: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = required(form, "template_id", "Template");
  const { error } = await supabase
    .from("email_templates")
    .update({ is_archived: true, status: "archived" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

/* ── Sequences ─────────────────────────────────────────────────────── */

export async function saveSequenceAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const sequenceId = text(form, "sequence_id");
  const name = required(form, "name", "Sequence name");

  const row = {
    name,
    description: text(form, "description"),
    goal: text(form, "goal"),
    customer_id: text(form, "customer_id"),
    audience_id: text(form, "audience_id"),
    enrollment_trigger: text(form, "enrollment_trigger") ?? "manual",
    from_name: text(form, "from_name"),
    from_email: text(form, "from_email"),
    reply_to: text(form, "reply_to"),
    sending_domain_id: text(form, "sending_domain_id"),
    owner: text(form, "owner") ?? actor,
    // The exit rules default ON in the schema and the form ships them as
    // checkboxes, so unticking one is a deliberate act.
    exit_on_reply: flag(form, "exit_on_reply"),
    exit_on_meeting: flag(form, "exit_on_meeting"),
    exit_on_proposal_accepted: flag(form, "exit_on_proposal_accepted"),
    exit_on_conversion: flag(form, "exit_on_conversion"),
  };

  if (sequenceId) {
    const { error } = await supabase.from("email_sequences").update(row).eq("id", sequenceId);
    if (error) throw new Error(error.message);
    await logEvent(supabase, { sequenceId }, "updated", `Sequence "${name}" updated.`, actor);
  } else {
    const { data, error } = await supabase
      .from("email_sequences")
      .insert({ ...row, created_by: actor, status: "draft" })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error(`A sequence called "${name}" already exists.`);
      throw new Error(error.message);
    }
    await logEvent(supabase, { sequenceId: data.id }, "sequence_created", `Sequence "${name}" created.`, actor);
  }

  refresh();
}

export async function saveSequenceStepAction(form: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const sequenceId = required(form, "sequence_id", "Sequence");
  const stepId = text(form, "step_id");

  const conditionType = text(form, "condition_type") ?? "always";
  const conditionValue = text(form, "condition_value");
  if (["lead_stage", "has_tag"].includes(conditionType) && !conditionValue) {
    throw new Error("That condition needs a value — say which stage or which tag.");
  }

  const row = {
    sequence_id: sequenceId,
    step_number: whole(form, "step_number") ?? 1,
    name: text(form, "step_name"),
    delay_amount: whole(form, "delay_amount") ?? 0,
    delay_unit: text(form, "delay_unit") ?? "days",
    template_id: text(form, "template_id"),
    subject: text(form, "subject"),
    preview_text: text(form, "preview_text"),
    blocks: blocks(form),
    condition_type: conditionType,
    condition_value: conditionValue,
    status: text(form, "status") ?? "active",
  };

  if (stepId) {
    const { error } = await supabase.from("email_sequence_steps").update(row).eq("id", stepId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("email_sequence_steps").insert(row);
    if (error) {
      if (error.code === "23505") throw new Error("That step number is already taken in this sequence.");
      throw new Error(error.message);
    }
  }

  refresh();
}

export async function setSequenceStatusAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const id = required(form, "sequence_id", "Sequence");
  const status = required(form, "status", "Status");

  if (status === "active") {
    const { count } = await supabase
      .from("email_sequence_steps")
      .select("id", { count: "exact", head: true })
      .eq("sequence_id", id);
    if ((count ?? 0) === 0) {
      throw new Error("This sequence has no steps yet, so activating it would enroll people into nothing.");
    }
  }

  const { error } = await supabase.from("email_sequences").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(
    supabase, { sequenceId: id },
    status === "paused" ? "sequence_paused" : "updated",
    `Sequence status set to ${status}.`, actor
  );
  refresh();
}

export async function enrollInSequenceAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const sequenceId = required(form, "sequence_id", "Sequence");
  const audienceId = required(form, "audience_id", "Audience");

  const { resolveAudience } = await import("@/lib/email-marketing/audience");
  const resolved = await resolveAudience(supabase, audienceId);
  if (resolved.sendable.length === 0) {
    throw new Error("Nobody in that audience can be emailed, so there is nobody to enroll.");
  }

  const { data: firstStep } = await supabase
    .from("email_sequence_steps")
    .select("delay_amount, delay_unit")
    .eq("sequence_id", sequenceId)
    .eq("step_number", 1)
    .maybeSingle();
  if (!firstStep) throw new Error("This sequence has no first step yet.");

  const { delayMs } = await import("@/lib/email-marketing/types");
  const dueAt = new Date(
    Date.now() + delayMs(firstStep.delay_amount as number, firstStep.delay_unit as never)
  ).toISOString();

  const payload = resolved.sendable.map((c) => ({
    sequence_id: sequenceId,
    email: c.email,
    first_name: c.firstName,
    last_name: c.lastName,
    company: c.company,
    lead_id: c.leadId,
    customer_id: c.customerId,
    status: "active" as const,
    current_step: 0,
    next_send_at: dueAt,
    enrolled_by: actor,
  }));

  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await supabase
      .from("email_sequence_enrollments")
      .upsert(payload.slice(i, i + 200), { onConflict: "sequence_id,email", ignoreDuplicates: true });
    if (error) throw new Error(`enroll: ${error.message}`);
  }

  await logEvent(
    supabase, { sequenceId }, "enrolled",
    `Enrolled ${payload.length} contacts from "${resolved.name}". ${resolved.skipped.length} were skipped as suppressed or without consent.`,
    actor
  );
  refresh();
}

/* ── Suppression ───────────────────────────────────────────────────── */

export async function suppressEmailAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireAdmin();
  const email = normalizeEmail(required(form, "email", "Email address"));
  if (!isEmail(email)) throw new Error(`"${email}" is not a usable address.`);

  await suppress(supabase, {
    email,
    reason: (text(form, "reason") as never) ?? "manual",
    note: text(form, "note") ?? `Added by ${actor}.`,
  });
  refresh();
}

/**
 * Take an address off the suppression list.
 *
 * §26: resubscription is explicit and deliberate. This is the only path to
 * it, it is owner/admin only, it demands a written reason, and it records
 * who did it — because "why is this person receiving mail again" needs an
 * answer that is not a shrug.
 */
export async function unsuppressEmailAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const email = normalizeEmail(required(form, "email", "Email address"));
  const note = text(form, "note");
  if (!note) {
    throw new Error(
      "Say why this address is being resubscribed. Removing somebody from the suppression list needs a recorded reason."
    );
  }

  await unsuppress(supabase, email);
  await logEvent(
    supabase, {}, "note",
    `${email} was removed from the suppression list by ${actor}. Reason: ${note}`,
    actor
  );
  refresh();
}

/* ── Sending domain ────────────────────────────────────────────────── */

export async function saveSendingDomainAction(form: FormData): Promise<void> {
  const { supabase } = await requireSender();
  const domainId = text(form, "domain_id");

  const row = {
    domain: required(form, "domain", "Domain").toLowerCase(),
    provider: text(form, "provider") ?? "resend",
    from_email: text(form, "from_email"),
    from_name: text(form, "from_name"),
    reply_to: text(form, "reply_to"),
    daily_send_limit: whole(form, "daily_send_limit"),
    is_default: flag(form, "is_default"),
    notes: text(form, "notes"),
    // Authentication state is NOT settable from a form. It is only ever
    // written by a real provider check, which is the whole point of §35.
  };

  if (row.is_default) {
    await supabase.from("email_sending_domains").update({ is_default: false }).eq("is_default", true);
  }

  if (domainId) {
    const { error } = await supabase.from("email_sending_domains").update(row).eq("id", domainId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("email_sending_domains").insert(row);
    if (error) {
      if (error.code === "23505") throw new Error("That domain is already recorded.");
      throw new Error(error.message);
    }
  }

  refresh();
}

export async function checkDomainAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireSender();
  const domainId = required(form, "domain_id", "Domain");

  const result = await checkSendingDomain(supabase, domainId);
  await logEvent(supabase, {}, "domain_health_changed", result.message, actor);
  refresh();
  if (!result.ok) throw new Error(result.message);
}
