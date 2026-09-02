/**
 * Row types for the task tables.
 * Kept in sync with 0007 (the original tasks table) and 0017 (this feature).
 */

import type { Priority, TaskKind } from "@/lib/supabase/types";
import type { TaskStatus, TaskType } from "./config";

export type Task = {
  id: string;
  title: string;
  notes: string | null;

  /** The dashboard's reminder shape. Untouched by the Tasks screen. */
  kind: TaskKind;
  /** The area of the business this work belongs to. */
  type: TaskType;
  status: TaskStatus;
  priority: Priority;

  /** Kept in step with `status` by a database trigger — see 0017. */
  done: boolean;
  done_at: string | null;

  due_at: string | null;
  due_time: string | null;
  start_date: string | null;

  /** `owner` is the assignee, as text, like every other owner column here. */
  owner: string | null;
  created_by: string | null;

  lead_id: string | null;
  customer_id: string | null;
  job_id: string | null;
  invoice_id: string | null;
  proposal_id: string | null;
  service_id: string | null;
  parent_task_id: string | null;

  estimated_hours: number | null;
  actual_hours: number | null;
  sort_order: number;
  tags: string[];
  blocked_reason: string | null;

  is_template: boolean;
  template_key: string | null;

  source: "manual" | "ai" | "system";
  created_at: string;
  updated_at: string;
};

export type TaskChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
};

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string | null;
  author: string;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type TaskAttachment = {
  id: string;
  task_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type TaskDependency = {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: "blocks" | "relates";
  created_at: string;
};

export type TaskEventType =
  | "created" | "assigned" | "status_changed" | "priority_changed"
  | "due_changed" | "completed" | "reopened" | "comment_added"
  | "attachment_added" | "checklist_completed" | "subtask_added"
  | "dependency_added" | "generated" | "note";

export type TaskEvent = {
  id: string;
  task_id: string;
  event_type: TaskEventType;
  body: string | null;
  actor: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type TaskTemplate = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  package_key: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TaskTemplateItem = {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: Priority;
  phase: string;
  offset_days: number;
  estimated_hours: number | null;
  depends_on_order: number | null;
  sort_order: number;
  created_at: string;
};

/** What a row in the table needs, with its relations already resolved. */
export type TaskListRow = {
  id: string;
  title: string;
  subtitle: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  dueAt: string | null;
  dueTime: string | null;
  overdue: boolean;
  owner: string | null;
  clientName: string | null;
  projectName: string | null;
  clientId: string | null;
  projectId: string | null;
  leadId: string | null;
  proposalId: string | null;
  parentTaskId: string | null;
  blockedReason: string | null;
  checklistTotal: number;
  checklistDone: number;
  commentCount: number;
  attachmentCount: number;
  subtaskCount: number;
  tags: string[];
  updatedAt: string;
};

/** Everything the detail drawer shows. */
export type TaskDetail = {
  task: Task;
  checklist: TaskChecklistItem[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  events: TaskEvent[];
  /** Tasks this one waits on, and the tasks waiting on it. */
  dependsOn: { id: string; title: string; status: TaskStatus }[];
  blocking: { id: string; title: string; status: TaskStatus }[];
  subtasks: { id: string; title: string; status: TaskStatus; priority: Priority }[];
  clientName: string | null;
  projectName: string | null;
  proposalNumber: string | null;
  serviceName: string | null;
  parentTitle: string | null;
};
