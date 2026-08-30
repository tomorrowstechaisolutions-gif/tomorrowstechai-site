"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  EXPENSE_CATEGORIES,
  PROJECT_TYPES,
  SOCIAL_PLATFORMS,
  TASK_KINDS,
  type ExpenseCategory,
  type ProjectType,
  type SocialPlatform,
  type TaskKind,
} from "@/lib/supabase/types";
import { DEFAULT_JOB_TASKS, dueDateFrom, PROMISED_DAYS } from "@/lib/jobs/config";

/**
 * Writes the command-center dashboard needs.
 *
 * Same posture as actions.ts: every one re-checks the admin, and every one
 * goes through the request-scoped client so RLS applies on top of the check.
 * The service role is never touched here.
 */
async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email, userId: session.user.id };
}

function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function toCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

/** A datetime-local value ("2026-08-30T14:00") → ISO, or null. */
function toIso(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const DASHBOARD = "/admin";

// ── Today ───────────────────────────────────────────────────────────────────

/**
 * Ticking something off the Today card.
 *
 * Only real task rows are checkable. A meeting or an unpaid invoice on that
 * list is a fact about another record; it goes away when that record changes,
 * not when a box is ticked, so there is nothing here to mark them with.
 */
export async function toggleTaskDone(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  if (!id) return;

  const done = str(formData, "done", 10) === "true";

  await supabase
    .from("tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", id);

  revalidatePath(DASHBOARD);
}

// ── Quick Add ───────────────────────────────────────────────────────────────

export async function quickAddTask(formData: FormData) {
  const { supabase } = await requireAdmin();
  const title = str(formData, "title", 200);
  if (!title) return;

  const kind = str(formData, "kind", 20) as TaskKind;
  const priority = str(formData, "priority", 10);

  await supabase.from("tasks").insert({
    title,
    notes: str(formData, "notes", 2000) || null,
    kind: TASK_KINDS.includes(kind) ? kind : "task",
    priority: ["low", "medium", "high", "critical"].includes(priority) ? priority : "medium",
    due_at: toIso(str(formData, "due_at", 40)),
    source: "manual",
  });

  revalidatePath(DASHBOARD);
}

export async function quickAddLead(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const email = str(formData, "email", 200).toLowerCase();
  const firstName = str(formData, "first_name", 100);
  if (!email || !firstName) return;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      first_name: firstName,
      last_name: str(formData, "last_name", 100),
      email,
      phone: str(formData, "phone", 40) || null,
      business_name: str(formData, "business_name", 200) || null,
      // Typed in by hand, so the source says so. Attribution that claims a
      // channel it did not come from poisons every cost-per-lead number.
      source: "manual",
      lead_status: "New",
      services_interested: [],
      // Consent was not collected through a form, so it is not assumed.
      email_consent: false,
      sms_consent: false,
    })
    .select("id")
    .single();

  if (error || !data) return;

  await supabase.from("lead_events").insert({
    lead_id: data.id,
    type: "system",
    body: "Lead added by hand from the dashboard.",
    actor,
  });

  revalidatePath(DASHBOARD);
  redirect(`/admin/leads/${data.id}`);
}

export async function quickAddClient(formData: FormData) {
  const { supabase } = await requireAdmin();
  const email = str(formData, "email", 200).toLowerCase();
  if (!email) return;

  await supabase.from("customers").insert({
    name: str(formData, "name", 200) || null,
    business_name: str(formData, "business_name", 200) || null,
    email,
    phone: str(formData, "phone", 40) || null,
    status: "active",
    mrr_cents: toCents(str(formData, "mrr", 20)),
    won_at: new Date().toISOString(),
  });

  revalidatePath(DASHBOARD);
}

export async function quickAddProject(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const title = str(formData, "title", 200);
  if (!title) return;

  const type = str(formData, "project_type", 40) as ProjectType;
  const projectType = PROJECT_TYPES.includes(type) ? type : "website";
  const dueRaw = str(formData, "due_at", 40);

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      title,
      business_name: str(formData, "business_name", 200) || null,
      project_type: projectType,
      value_cents: toCents(str(formData, "value", 20)),
      owner: str(formData, "owner", 100) || null,
      next_milestone: str(formData, "next_milestone", 200) || null,
      stage: "Intake",
      package: projectType === "website" ? "launch_package" : projectType,
      promised_days: PROMISED_DAYS,
      due_at: toIso(dueRaw) ?? dueDateFrom(new Date()),
    })
    .select("id")
    .single();

  if (error || !data) return;

  // The delivery checklist is what makes every job run the same way. A project
  // created from the dashboard gets it too, not just one made from a sale.
  await supabase.from("job_tasks").insert(
    DEFAULT_JOB_TASKS.map((t, i) => ({
      job_id: data.id,
      stage: t.stage,
      label: t.label,
      position: i,
    }))
  );

  await supabase.from("job_events").insert({
    job_id: data.id,
    kind: "system",
    body: "Project opened from the dashboard.",
    actor,
  });

  revalidatePath(DASHBOARD);
  redirect(`/admin/jobs/${data.id}`);
}

export async function quickAddSocialPost(formData: FormData) {
  const { supabase } = await requireAdmin();
  const body = str(formData, "body", 4000);
  const platform = str(formData, "platform", 40) as SocialPlatform;
  if (!body || !SOCIAL_PLATFORMS.includes(platform)) return;

  const scheduledAt = toIso(str(formData, "scheduled_at", 40));

  await supabase.from("social_posts").insert({
    platform,
    body,
    link_url: str(formData, "link_url", 500) || null,
    scheduled_at: scheduledAt,
    // Nothing here publishes anything. Until a platform connection exists and
    // a publisher is built, a scheduled post is a reminder, and 'scheduled'
    // would be a promise the system cannot keep.
    status: scheduledAt ? "scheduled" : "draft",
    generated_by: "human",
  });

  revalidatePath(DASHBOARD);
}

export async function quickAddExpense(formData: FormData) {
  const { supabase } = await requireAdmin();
  const amount = toCents(str(formData, "amount", 20));
  if (amount <= 0) return;

  const category = str(formData, "category", 40) as ExpenseCategory;

  await supabase.from("expenses").insert({
    category: EXPENSE_CATEGORIES.includes(category) ? category : "other",
    vendor: str(formData, "vendor", 200) || null,
    description: str(formData, "description", 500) || null,
    amount_cents: amount,
    recurring: str(formData, "recurring", 10) === "on",
  });

  revalidatePath(DASHBOARD);
}

// ── AI review queue ─────────────────────────────────────────────────────────

/**
 * Approve or reject a proposed action.
 *
 * Approving does NOT carry the action out. It records that a named human said
 * yes; execution is a separate, deliberate step per action kind. The database
 * refuses an approved row with no reviewer, so this cannot be short-circuited
 * by a future caller either.
 */
export async function reviewAiAction(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData, "action_id", 40);
  const decision = str(formData, "decision", 20);
  if (!id || !["approved", "rejected"].includes(decision)) return;

  await supabase
    .from("ai_actions")
    .update({
      status: decision,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "proposed");

  revalidatePath(DASHBOARD);
}

export async function dismissInsight(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "insight_id", 40);
  if (!id) return;

  await supabase.from("ai_insights").update({ status: "dismissed" }).eq("id", id);
  revalidatePath(DASHBOARD);
}
