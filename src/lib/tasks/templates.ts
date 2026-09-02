import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Priority } from "@/lib/supabase/types";
import type { TaskType } from "./config";
import type { TaskTemplate, TaskTemplateItem } from "./types";

/**
 * Task templates: the delivery workflow for a package, stored as rows.
 *
 * The point of keeping these in the database rather than in an array inside a
 * component is that what a Classic build involves changes far more often than
 * this code does. Editing the workflow is then a data change, and every
 * project generated afterwards picks it up with no deploy.
 *
 * Generation is idempotent on (job_id, template_key). A business event that
 * fires twice — a webhook retry, a double-clicked button — produces one set
 * of tasks, not two.
 */

export async function listTemplates(sb: SupabaseClient): Promise<TaskTemplate[]> {
  const { data } = await sb
    .from("task_templates")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });
  return (data ?? []) as TaskTemplate[];
}

export async function templateForPackage(
  sb: SupabaseClient,
  packageKey: string | null | undefined
): Promise<TaskTemplate | null> {
  if (!packageKey) return null;
  const { data } = await sb
    .from("task_templates")
    .select("*")
    .eq("package_key", packageKey)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  return (data as TaskTemplate) ?? null;
}

export type GenerateInput = {
  /** One of these picks the workflow. `templateKey` wins if both are given. */
  templateKey?: string | null;
  packageKey?: string | null;

  jobId?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  proposalId?: string | null;
  serviceId?: string | null;

  owner?: string | null;
  actor?: string | null;
  /** Day zero. Every item's due date is this plus its offset. */
  startDate?: Date;
};

export type GenerateResult = {
  created: number;
  skipped: boolean;
  templateKey: string | null;
  taskIds: string[];
};

/** Chicago-business days are not modelled; offsets are plain calendar days. */
function dueFrom(start: Date, offsetDays: number): string {
  const due = new Date(start);
  due.setDate(due.getDate() + offsetDays);
  // End of the working day rather than midnight, so "due Tuesday" is not
  // already overdue at one minute past midnight on Tuesday.
  due.setHours(17, 0, 0, 0);
  return due.toISOString();
}

export async function generateTasksFromTemplate(
  sb: SupabaseClient,
  input: GenerateInput
): Promise<GenerateResult> {
  const template = input.templateKey
    ? await sb.from("task_templates").select("*").eq("key", input.templateKey)
        .maybeSingle().then((r) => (r.data as TaskTemplate) ?? null)
    : await templateForPackage(sb, input.packageKey);

  if (!template) {
    return { created: 0, skipped: true, templateKey: input.templateKey ?? null, taskIds: [] };
  }

  // Already generated for this project? Then this is a replay, not a request.
  if (input.jobId) {
    const { count } = await sb
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("job_id", input.jobId)
      .eq("template_key", template.key);
    if ((count ?? 0) > 0) {
      return { created: 0, skipped: true, templateKey: template.key, taskIds: [] };
    }
  }

  const { data: itemRows } = await sb
    .from("task_template_items")
    .select("*")
    .eq("template_id", template.id)
    .order("sort_order", { ascending: true });

  const items = (itemRows ?? []) as TaskTemplateItem[];
  if (items.length === 0) {
    return { created: 0, skipped: true, templateKey: template.key, taskIds: [] };
  }

  const start = input.startDate ?? new Date();

  const { data: inserted, error } = await sb
    .from("tasks")
    .insert(
      items.map((item) => ({
        title: item.title,
        // The phase is carried into the note so a generated task still says
        // where in delivery it sits, without a column only templates use.
        notes: [item.description, `${template.name} · ${item.phase}`]
          .filter(Boolean).join("\n\n"),
        kind: "task",
        type: item.type as TaskType,
        status: "not_started",
        priority: item.priority as Priority,
        due_at: dueFrom(start, item.offset_days),
        start_date: start.toISOString().slice(0, 10),
        estimated_hours: item.estimated_hours,
        sort_order: item.sort_order,
        owner: input.owner ?? null,
        created_by: input.actor ?? "system",
        job_id: input.jobId ?? null,
        customer_id: input.customerId ?? null,
        lead_id: input.leadId ?? null,
        proposal_id: input.proposalId ?? null,
        service_id: input.serviceId ?? null,
        template_key: template.key,
        source: "system",
      }))
    )
    .select("id, sort_order");

  if (error || !inserted) {
    throw new Error(`Could not generate the project tasks: ${error?.message ?? "unknown"}`);
  }

  const byOrder = new Map<number, string>();
  for (const row of inserted as { id: string; sort_order: number }[]) {
    byOrder.set(row.sort_order, row.id);
  }

  // Dependencies, translated from positions to the rows that now exist.
  const links = items
    .filter((item) => item.depends_on_order !== null)
    .map((item) => ({
      task_id: byOrder.get(item.sort_order),
      depends_on_task_id: byOrder.get(item.depends_on_order as number),
      dependency_type: "blocks" as const,
    }))
    .filter((link): link is { task_id: string; depends_on_task_id: string; dependency_type: "blocks" } =>
      Boolean(link.task_id && link.depends_on_task_id && link.task_id !== link.depends_on_task_id));

  if (links.length > 0) {
    await sb.from("task_dependencies").insert(links);
  }

  const taskIds = Array.from(byOrder.values());
  if (taskIds.length > 0) {
    await sb.from("task_events").insert(
      taskIds.map((taskId) => ({
        task_id: taskId,
        event_type: "generated",
        body: `Created from the ${template.name} workflow.`,
        actor: input.actor ?? "system",
        metadata: { template_key: template.key, job_id: input.jobId ?? null },
      }))
    );
  }

  return { created: taskIds.length, skipped: false, templateKey: template.key, taskIds };
}
