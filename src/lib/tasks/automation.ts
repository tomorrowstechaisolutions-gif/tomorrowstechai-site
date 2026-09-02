import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Priority } from "@/lib/supabase/types";
import type { TaskType } from "./config";
import { generateTasksFromTemplate } from "./templates";

/**
 * Where business events turn into work.
 *
 * These are service functions, not a workflow engine. Each one is called from
 * the action that already handles the event — conversion calls
 * onProjectCreated, and so on — so the automation lives next to the thing it
 * automates rather than in a rules table nobody can read.
 *
 * Every one of them is:
 *   • idempotent, because the events that trigger them get replayed;
 *   • non-fatal, because failing to open a follow-up task must never undo the
 *     sale, the project or the payment that caused it.
 *
 * Growing this later means adding a function here and calling it from one
 * more place. It does not mean rewriting any of these.
 */

export type AutomationResult = { created: number; note: string };

const NONE: AutomationResult = { created: 0, note: "Nothing to do." };

/** Creates one task unless a task with the same dedupe key already exists. */
async function ensureTask(
  sb: SupabaseClient,
  input: {
    title: string;
    notes?: string | null;
    type: TaskType;
    priority?: Priority;
    dueInDays?: number;
    owner?: string | null;
    actor?: string | null;
    leadId?: string | null;
    customerId?: string | null;
    jobId?: string | null;
    proposalId?: string | null;
    /** Uniqueness is per entity: one "chase the deposit" per proposal. */
    dedupeOn: { column: "lead_id" | "customer_id" | "job_id" | "proposal_id"; value: string };
  }
): Promise<boolean> {
  const { count } = await sb
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq(input.dedupeOn.column, input.dedupeOn.value)
    .eq("title", input.title)
    .eq("done", false);
  if ((count ?? 0) > 0) return false;

  const due = new Date();
  due.setDate(due.getDate() + (input.dueInDays ?? 1));
  due.setHours(17, 0, 0, 0);

  const { data } = await sb
    .from("tasks")
    .insert({
      title: input.title,
      notes: input.notes ?? null,
      kind: "task",
      type: input.type,
      status: "not_started",
      priority: input.priority ?? "medium",
      due_at: due.toISOString(),
      owner: input.owner ?? null,
      created_by: input.actor ?? "system",
      lead_id: input.leadId ?? null,
      customer_id: input.customerId ?? null,
      job_id: input.jobId ?? null,
      proposal_id: input.proposalId ?? null,
      source: "system",
    })
    .select("id")
    .single();

  if (data?.id) {
    await sb.from("task_events").insert({
      task_id: data.id,
      event_type: "created",
      body: "Opened automatically by a business event.",
      actor: input.actor ?? "system",
    });
  }
  return Boolean(data);
}

/**
 * A proposal was signed. The money may not have landed yet, so this does not
 * open the build — it opens the one thing that has to happen next.
 */
export async function onProposalAccepted(
  sb: SupabaseClient,
  input: {
    proposalId: string;
    proposalNumber: string;
    clientName: string | null;
    owner?: string | null;
    actor?: string | null;
    paymentDue: boolean;
  }
): Promise<AutomationResult> {
  const who = input.clientName ? ` — ${input.clientName}` : "";
  const created = await ensureTask(sb, {
    title: input.paymentDue
      ? `Confirm payment on ${input.proposalNumber}`
      : `Start delivery for ${input.proposalNumber}`,
    notes: input.paymentDue
      ? `Signed${who}. The project cannot be created until the agreed payment clears.`
      : `Signed${who}. Nothing is due at signature, so this can be converted into a project now.`,
    type: input.paymentDue ? "billing" : "proposal",
    priority: "high",
    dueInDays: 1,
    owner: input.owner,
    actor: input.actor,
    proposalId: input.proposalId,
    dedupeOn: { column: "proposal_id", value: input.proposalId },
  });

  return created
    ? { created: 1, note: "Opened the next step on the signed proposal." }
    : NONE;
}

/**
 * A project exists. This is where the package's delivery workflow becomes
 * real tasks with real dates.
 */
export async function onProjectCreated(
  sb: SupabaseClient,
  input: {
    jobId: string;
    packageKey?: string | null;
    customerId?: string | null;
    leadId?: string | null;
    proposalId?: string | null;
    serviceId?: string | null;
    owner?: string | null;
    actor?: string | null;
    startDate?: Date;
  }
): Promise<AutomationResult> {
  const result = await generateTasksFromTemplate(sb, {
    packageKey: input.packageKey,
    jobId: input.jobId,
    customerId: input.customerId,
    leadId: input.leadId,
    proposalId: input.proposalId,
    serviceId: input.serviceId,
    owner: input.owner,
    actor: input.actor,
    startDate: input.startDate,
  });

  if (result.skipped && result.created === 0) {
    return {
      created: 0,
      note: result.templateKey
        ? "Delivery tasks already exist for this project."
        : "No delivery workflow is defined for that package yet.",
    };
  }
  return { created: result.created, note: `Opened ${result.created} delivery tasks.` };
}

/** The same thing, named for the event a sale fires. */
export async function onWebsiteSold(
  sb: SupabaseClient,
  input: Parameters<typeof onProjectCreated>[1]
): Promise<AutomationResult> {
  return onProjectCreated(sb, input);
}

/**
 * The client finished the intake wizard. Production can start, so the tasks
 * that were waiting on their content stop waiting.
 */
export async function onClientIntakeCompleted(
  sb: SupabaseClient,
  input: { jobId: string; actor?: string | null }
): Promise<AutomationResult> {
  const { data } = await sb
    .from("tasks")
    .update({ status: "ready" })
    .eq("job_id", input.jobId)
    .eq("status", "waiting")
    .select("id");

  const unblocked = (data ?? []).length;
  if (unblocked > 0) {
    await sb.from("task_events").insert(
      (data as { id: string }[]).map((row) => ({
        task_id: row.id,
        event_type: "status_changed",
        body: "Client intake was submitted, so this is no longer waiting on them.",
        actor: input.actor ?? "system",
      }))
    );
  }

  return unblocked > 0
    ? { created: 0, note: `Moved ${unblocked} task${unblocked === 1 ? "" : "s"} to Ready.` }
    : NONE;
}

/** A project finished. Verification and the follow-up window, not silence. */
export async function onProjectCompleted(
  sb: SupabaseClient,
  input: {
    jobId: string;
    customerId?: string | null;
    owner?: string | null;
    actor?: string | null;
  }
): Promise<AutomationResult> {
  const checks: { title: string; notes: string; type: TaskType; days: number }[] = [
    { title: "Verify the live site after launch", notes: "SSL, forms, analytics and every page on a phone.", type: "quality", days: 1 },
    { title: "Book the 30-day check-in", notes: "A month after launch, while the site is meeting real traffic.", type: "support", days: 3 },
    { title: "Ask for a review and portfolio permission", notes: "Best asked the week it goes live, not months later.", type: "sales", days: 7 },
  ];

  let created = 0;
  for (const check of checks) {
    const made = await ensureTask(sb, {
      title: check.title,
      notes: check.notes,
      type: check.type,
      priority: "medium",
      dueInDays: check.days,
      owner: input.owner,
      actor: input.actor,
      jobId: input.jobId,
      customerId: input.customerId,
      dedupeOn: { column: "job_id", value: input.jobId },
    });
    if (made) created += 1;
  }

  return created > 0
    ? { created, note: `Opened ${created} launch follow-up tasks.` }
    : NONE;
}
