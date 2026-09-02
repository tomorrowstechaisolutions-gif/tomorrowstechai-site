"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES,
  isClosed, type TaskStatus, type TaskType,
} from "@/lib/tasks/config";
import { onProjectCreated } from "@/lib/tasks/automation";
import type { Priority, TaskKind } from "@/lib/supabase/types";

/**
 * Every write the Tasks screen makes.
 *
 * A `"use server"` file may export nothing but async functions, so the shared
 * vocabulary lives in src/lib/tasks/config.ts and is imported by both this
 * file and the forms.
 *
 * All of these run on the request-scoped client, so RLS applies and an
 * account that is not in admin_users writes nothing.
 *
 * Inline edits — status, priority, owner, due date — deliberately have no
 * confirmation step. They are one click, they are reversible, and every one
 * of them writes a task_events row, so the change is recoverable from the
 * history rather than prevented by a dialog. Deleting is the exception.
 */

const TASKS = "/admin/tasks";

function touch(id?: string | null) {
  revalidatePath(TASKS);
  revalidatePath("/admin");
  if (id) revalidatePath(`${TASKS}/${id}`);
}

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return {
    supabase: await createSupabaseServerClient(),
    actor: session.admin.email,
  };
}

function str(fd: FormData, key: string, max = 4000): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function flag(fd: FormData, key: string): boolean {
  const value = fd.get(key);
  return value === "on" || value === "1" || value === "true";
}

function numberOrNull(raw: string): number | null {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

function dateOrNull(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function timeOrNull(raw: string): string | null {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(raw) ? raw : null;
}

/**
 * A date and an optional time become the single instant every existing query
 * sorts on. With no time, 5pm Central — so "due Tuesday" is not already
 * overdue at one minute past midnight on Tuesday.
 */
function dueInstant(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const [hours, minutes] = (time ?? "17:00").split(":").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  // Central is UTC-5 or UTC-6; Date handles the offset from a local-ish string.
  const at = new Date(Date.UTC(y, m - 1, d, (hours ?? 17) + 5, minutes ?? 0, 0));
  return at.toISOString();
}

function statusOrNull(raw: string): TaskStatus | null {
  return (TASK_STATUSES as readonly string[]).includes(raw) ? (raw as TaskStatus) : null;
}

function typeOrDefault(raw: string): TaskType {
  return (TASK_TYPES as readonly string[]).includes(raw) ? (raw as TaskType) : "internal";
}

function priorityOrDefault(raw: string): Priority {
  return TASK_PRIORITIES.includes(raw as Priority) ? (raw as Priority) : "medium";
}

async function logEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  taskId: string,
  eventType: string,
  body: string,
  actor: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("task_events").insert({
    task_id: taskId,
    event_type: eventType,
    body,
    actor,
    metadata,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Create and edit
// ═══════════════════════════════════════════════════════════════════════

export async function createTaskAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const title = str(formData, "title", 300);
  if (!title) throw new Error("A task needs a name.");

  const dueDate = dateOrNull(str(formData, "due_date", 20));
  const dueTime = timeOrNull(str(formData, "due_time", 10));

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title,
      notes: str(formData, "description", 8000) || null,
      kind: "task" as TaskKind,
      type: typeOrDefault(str(formData, "type", 40)),
      status: statusOrNull(str(formData, "status", 30)) ?? "not_started",
      priority: priorityOrDefault(str(formData, "priority", 20)),
      due_at: dueInstant(dueDate, dueTime),
      due_time: dueTime,
      start_date: dateOrNull(str(formData, "start_date", 20)),
      estimated_hours: numberOrNull(str(formData, "estimated_hours", 10)),
      owner: str(formData, "owner", 200) || actor,
      created_by: actor,
      customer_id: str(formData, "customer_id", 40) || null,
      job_id: str(formData, "job_id", 40) || null,
      lead_id: str(formData, "lead_id", 40) || null,
      proposal_id: str(formData, "proposal_id", 40) || null,
      service_id: str(formData, "service_id", 40) || null,
      parent_task_id: str(formData, "parent_task_id", 40) || null,
      tags: str(formData, "tags", 500)
        .split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Could not create the task: ${error?.message ?? "unknown"}`);

  await logEvent(supabase, data.id as string, "created", `Created by ${actor}.`, actor);

  // A dependency chosen at creation time, wired once the row exists.
  const dependsOn = str(formData, "depends_on", 40);
  if (dependsOn && dependsOn !== data.id) {
    await supabase.from("task_dependencies").insert({
      task_id: data.id,
      depends_on_task_id: dependsOn,
      dependency_type: "blocks",
    });
    await logEvent(supabase, data.id as string, "dependency_added", "Waits on another task.", actor);
  }

  touch(data.id as string);
}

export async function updateTaskAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  if (!id) return;

  const { data: before } = await supabase
    .from("tasks")
    .select("status, priority, owner, due_at, title")
    .eq("id", id)
    .maybeSingle();
  if (!before) return;

  const dueDate = dateOrNull(str(formData, "due_date", 20));
  const dueTime = timeOrNull(str(formData, "due_time", 10));
  const nextStatus = statusOrNull(str(formData, "status", 30)) ?? (before.status as TaskStatus);
  const nextPriority = priorityOrDefault(str(formData, "priority", 20));
  const nextOwner = str(formData, "owner", 200) || null;
  const nextDue = dueInstant(dueDate, dueTime);

  const { error } = await supabase
    .from("tasks")
    .update({
      title: str(formData, "title", 300) || before.title,
      notes: str(formData, "description", 8000) || null,
      type: typeOrDefault(str(formData, "type", 40)),
      status: nextStatus,
      priority: nextPriority,
      due_at: nextDue,
      due_time: dueTime,
      start_date: dateOrNull(str(formData, "start_date", 20)),
      estimated_hours: numberOrNull(str(formData, "estimated_hours", 10)),
      actual_hours: numberOrNull(str(formData, "actual_hours", 10)),
      owner: nextOwner,
      customer_id: str(formData, "customer_id", 40) || null,
      job_id: str(formData, "job_id", 40) || null,
      lead_id: str(formData, "lead_id", 40) || null,
      proposal_id: str(formData, "proposal_id", 40) || null,
      service_id: str(formData, "service_id", 40) || null,
      blocked_reason: nextStatus === "blocked"
        ? str(formData, "blocked_reason", 1000) || null
        : null,
      tags: str(formData, "tags", 500)
        .split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    })
    .eq("id", id);

  if (error) throw new Error(`Could not save the task: ${error.message}`);

  // One event per thing that actually changed, rather than one "edited".
  if (nextStatus !== before.status) {
    await logEvent(supabase, id, "status_changed",
      `${before.status} → ${nextStatus}`, actor,
      { from: before.status, to: nextStatus });
  }
  if (nextPriority !== before.priority) {
    await logEvent(supabase, id, "priority_changed",
      `${before.priority} → ${nextPriority}`, actor);
  }
  if (nextOwner !== before.owner) {
    await logEvent(supabase, id, "assigned",
      nextOwner ? `Assigned to ${nextOwner}.` : "Unassigned.", actor);
  }
  if (nextDue !== before.due_at) {
    await logEvent(supabase, id, "due_changed",
      nextDue ? `Due ${nextDue.slice(0, 10)}.` : "Due date cleared.", actor);
  }

  touch(id);
}

// ═══════════════════════════════════════════════════════════════════════
// Inline edits — one click, no dialog
// ═══════════════════════════════════════════════════════════════════════

export async function setTaskStatusAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  const next = statusOrNull(str(formData, "status", 30));
  if (!id || !next) return;

  const { data: before } = await supabase
    .from("tasks").select("status").eq("id", id).maybeSingle();
  if (!before || before.status === next) return;

  const { error } = await supabase.from("tasks").update({ status: next }).eq("id", id);
  if (error) throw new Error(`Could not change the status: ${error.message}`);

  await logEvent(
    supabase, id,
    isClosed(next) ? "completed" : isClosed(before.status as TaskStatus) ? "reopened" : "status_changed",
    `${before.status} → ${next}`, actor, { from: before.status, to: next }
  );

  touch(id);
}

export async function setTaskPriorityAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  if (!id) return;

  const next = priorityOrDefault(str(formData, "priority", 20));
  const { data: before } = await supabase
    .from("tasks").select("priority").eq("id", id).maybeSingle();
  if (!before || before.priority === next) return;

  await supabase.from("tasks").update({ priority: next }).eq("id", id);
  await logEvent(supabase, id, "priority_changed", `${before.priority} → ${next}`, actor);
  touch(id);
}

export async function setTaskOwnerAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  if (!id) return;

  const next = str(formData, "owner", 200) || null;
  await supabase.from("tasks").update({ owner: next }).eq("id", id);
  await logEvent(supabase, id, "assigned",
    next ? `Assigned to ${next}.` : "Unassigned.", actor);
  touch(id);
}

/** Used by both the inline date cell and the drawer's Reschedule button. */
export async function rescheduleTaskAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  if (!id) return;

  const date = dateOrNull(str(formData, "due_date", 20));
  const time = timeOrNull(str(formData, "due_time", 10));
  const due = dueInstant(date, time);

  await supabase.from("tasks").update({ due_at: due, due_time: time }).eq("id", id);
  await logEvent(supabase, id, "due_changed",
    due ? `Rescheduled to ${due.slice(0, 10)}.` : "Due date cleared.", actor);
  touch(id);
}

export async function completeTaskAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  if (!id) return;

  const reopen = flag(formData, "reopen");
  const { error } = await supabase
    .from("tasks")
    .update({ status: reopen ? "in_progress" : "completed" })
    .eq("id", id);
  if (error) throw new Error(`Could not update the task: ${error.message}`);

  await logEvent(supabase, id, reopen ? "reopened" : "completed",
    reopen ? "Reopened." : "Marked complete.", actor);
  touch(id);
}

/** The one destructive action, and the only one the UI confirms. */
export async function deleteTaskAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  if (!id) return;

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(`Could not delete the task: ${error.message}`);

  touch();
  redirect(TASKS);
}

// ═══════════════════════════════════════════════════════════════════════
// Checklist
// ═══════════════════════════════════════════════════════════════════════

export async function addChecklistItemAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  const title = str(formData, "title", 300);
  if (!id || !title) return;

  const { count } = await supabase
    .from("task_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("task_id", id);

  await supabase.from("task_checklist_items").insert({
    task_id: id,
    title,
    sort_order: count ?? 0,
  });

  touch(id);
}

export async function toggleChecklistItemAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const itemId = str(formData, "item_id", 40);
  const taskId = str(formData, "task_id", 40);
  if (!itemId) return;

  const { data: item } = await supabase
    .from("task_checklist_items")
    .select("id, task_id, title, is_completed")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return;

  const next = !item.is_completed;
  // completed_at is stamped by the trigger in 0017, not here.
  await supabase
    .from("task_checklist_items")
    .update({ is_completed: next })
    .eq("id", itemId);

  if (next) {
    await logEvent(supabase, item.task_id as string, "checklist_completed",
      `Checklist: ${item.title}`, actor);
  }

  touch(taskId || (item.task_id as string));
}

export async function deleteChecklistItemAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const itemId = str(formData, "item_id", 40);
  const taskId = str(formData, "task_id", 40);
  if (!itemId) return;

  await supabase.from("task_checklist_items").delete().eq("id", itemId);
  touch(taskId);
}

// ═══════════════════════════════════════════════════════════════════════
// Comments
// ═══════════════════════════════════════════════════════════════════════

export async function addTaskCommentAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  const comment = str(formData, "comment", 8000);
  if (!id || !comment) return;

  const { error } = await supabase.from("task_comments").insert({
    task_id: id,
    author: actor,
    comment,
  });
  if (error) throw new Error(`Could not save the comment: ${error.message}`);

  await logEvent(supabase, id, "comment_added", comment.slice(0, 160), actor);
  touch(id);
}

export async function deleteTaskCommentAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const commentId = str(formData, "comment_id", 40);
  const taskId = str(formData, "task_id", 40);
  if (!commentId) return;

  await supabase.from("task_comments").delete().eq("id", commentId);
  touch(taskId);
}

// ═══════════════════════════════════════════════════════════════════════
// Attachments
// ═══════════════════════════════════════════════════════════════════════

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function uploadTaskAttachmentAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  const file = formData.get("file");
  if (!id || !(file instanceof File) || file.size === 0) return;

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("That file is larger than the 25 MB limit.");
  }

  // Namespaced by task, with a random prefix so two files of the same name
  // never collide and a path is not guessable from the task id alone.
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "attachment";
  const path = `${id}/${crypto.randomUUID().slice(0, 8)}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("task-attachments")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { error } = await supabase.from("task_attachments").insert({
    task_id: id,
    file_name: file.name.slice(0, 200),
    storage_path: path,
    mime_type: file.type || null,
    file_size: file.size,
    uploaded_by: actor,
  });
  if (error) throw new Error(`Could not record the attachment: ${error.message}`);

  await logEvent(supabase, id, "attachment_added", file.name.slice(0, 160), actor);
  touch(id);
}

export async function deleteTaskAttachmentAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const attachmentId = str(formData, "attachment_id", 40);
  const taskId = str(formData, "task_id", 40);
  if (!attachmentId) return;

  const { data: attachment } = await supabase
    .from("task_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();

  if (attachment?.storage_path) {
    await supabase.storage.from("task-attachments").remove([attachment.storage_path as string]);
  }
  await supabase.from("task_attachments").delete().eq("id", attachmentId);

  touch(taskId);
}

// ═══════════════════════════════════════════════════════════════════════
// Subtasks and dependencies
// ═══════════════════════════════════════════════════════════════════════

export async function addSubtaskAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const parentId = str(formData, "task_id", 40);
  const title = str(formData, "title", 300);
  if (!parentId || !title) return;

  const { data: parent } = await supabase
    .from("tasks")
    .select("type, owner, customer_id, job_id, lead_id, proposal_id, due_at")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent) return;

  // A subtask inherits the parent's context so it is not an orphan with a
  // name, and its own status so it can be finished independently.
  const { data } = await supabase
    .from("tasks")
    .insert({
      title,
      kind: "task" as TaskKind,
      type: parent.type,
      status: "not_started",
      priority: "medium",
      parent_task_id: parentId,
      owner: parent.owner ?? actor,
      created_by: actor,
      customer_id: parent.customer_id,
      job_id: parent.job_id,
      lead_id: parent.lead_id,
      proposal_id: parent.proposal_id,
      due_at: parent.due_at,
      source: "manual",
    })
    .select("id")
    .single();

  if (data?.id) {
    await logEvent(supabase, parentId, "subtask_added", title, actor, { subtask_id: data.id });
    await logEvent(supabase, data.id as string, "created", "Created as a subtask.", actor);
  }

  touch(parentId);
}

export async function addTaskDependencyAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  const dependsOn = str(formData, "depends_on", 40);
  if (!id || !dependsOn || id === dependsOn) return;

  // One hop of cycle protection beyond the database's self-reference check:
  // if the other task already waits on this one, adding this would deadlock
  // both of them and neither could ever be started.
  const { count } = await supabase
    .from("task_dependencies")
    .select("id", { count: "exact", head: true })
    .eq("task_id", dependsOn)
    .eq("depends_on_task_id", id);
  if ((count ?? 0) > 0) {
    throw new Error("That task already waits on this one — the two would block each other.");
  }

  const { error } = await supabase.from("task_dependencies").insert({
    task_id: id,
    depends_on_task_id: dependsOn,
    dependency_type: "blocks",
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`Could not add the dependency: ${error.message}`);
  }

  await logEvent(supabase, id, "dependency_added", "Now waits on another task.", actor);
  touch(id);
}

export async function removeTaskDependencyAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "task_id", 40);
  const dependsOn = str(formData, "depends_on", 40);
  if (!id || !dependsOn) return;

  await supabase
    .from("task_dependencies")
    .delete()
    .eq("task_id", id)
    .eq("depends_on_task_id", dependsOn);

  touch(id);
}

// ═══════════════════════════════════════════════════════════════════════
// Templates
// ═══════════════════════════════════════════════════════════════════════

/**
 * Opens a package's delivery workflow against a project, by hand.
 *
 * The same function conversion calls automatically — this is the button for
 * a project that already existed before the workflow did.
 */
export async function generateProjectTasksAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const jobId = str(formData, "job_id", 40);
  if (!jobId) return;

  const { data: job } = await supabase
    .from("jobs")
    .select("id, package, customer_id, lead_id, started_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) throw new Error("That project no longer exists.");

  // jobs.package is the delivery vocabulary; task_templates.package_key is
  // the sales one. They agree for everything except the $399, whose job rows
  // have said "launch_package" since 0004.
  const packageKey = job.package === "launch_package" ? "classic_399" : (job.package as string);

  const result = await onProjectCreated(supabase, {
    jobId,
    packageKey,
    customerId: job.customer_id as string | null,
    leadId: job.lead_id as string | null,
    owner: actor,
    actor,
    startDate: job.started_at ? new Date(job.started_at as string) : new Date(),
  });

  if (result.created === 0) throw new Error(result.note);

  touch();
  revalidatePath(`/admin/jobs/${jobId}`);
}
