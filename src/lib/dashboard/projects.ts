import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/lib/supabase/types";
import type { JobStage } from "@/lib/jobs/config";

/**
 * Section 5 — Active Projects.
 *
 * `jobs` is the project record. Its stages are the delivery workflow; the
 * seven statuses shown on the dashboard are a presentation of those stages
 * plus one derived state — At Risk — which is a fact about the due date, not
 * a stage anyone sets by hand.
 */

export const PROJECT_STATUSES = [
  "Planning",
  "In Progress",
  "Waiting on Client",
  "Review",
  "Launching",
  "Complete",
  "At Risk",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const STAGE_TO_STATUS: Record<JobStage, ProjectStatus> = {
  Intake: "Planning",
  Content: "Waiting on Client",
  Build: "In Progress",
  Review: "Review",
  Launch: "Launching",
  Handoff: "Launching",
  Complete: "Complete",
  "On Hold": "Waiting on Client",
};

export const STATUS_TONE: Record<ProjectStatus, "ok" | "warn" | "risk" | "muted"> = {
  Planning: "muted",
  "In Progress": "ok",
  "Waiting on Client": "warn",
  Review: "ok",
  Launching: "ok",
  Complete: "muted",
  "At Risk": "risk",
};

export type ProjectRow = {
  id: string;
  title: string;
  client: string | null;
  type: ProjectType;
  typeLabel: string;
  stage: JobStage;
  status: ProjectStatus;
  /** Share of the job checklist ticked. null when the job has no checklist. */
  progress: number | null;
  tasksDone: number;
  tasksTotal: number;
  dueAt: string | null;
  daysLeft: number | null;
  valueCents: number;
  owner: string | null;
  nextMilestone: string | null;
  href: string;
};

type CustomerRef = { business_name: string | null; name: string | null };

/**
 * PostgREST returns a to-one embed as an object, but the generated types call
 * it an array. Accept both rather than casting through `unknown` and hoping.
 */
function one<T>(v: T | T[] | null): T | null {
  if (v === null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function loadProjects(
  sb: SupabaseClient,
  limit = 8
): Promise<{ rows: ProjectRow[]; total: number; atRisk: number }> {
  const jobs = unwrap(
    await sb
      .from("jobs")
      .select(
        "id, title, business_name, project_type, stage, due_at, value_cents, owner, next_milestone, customers(business_name, name), job_tasks(done)"
      )
      .is("completed_at", null)
      .neq("stage", "Complete")
      .order("due_at", { ascending: true, nullsFirst: false }),
    "active jobs"
  ) as {
    id: string;
    title: string;
    business_name: string | null;
    project_type: ProjectType;
    stage: JobStage;
    due_at: string | null;
    value_cents: number;
    owner: string | null;
    next_milestone: string | null;
    customers: CustomerRef | CustomerRef[] | null;
    job_tasks: { done: boolean }[] | null;
  }[];

  const now = Date.now();

  const rows: ProjectRow[] = jobs.map((j) => {
    const customer = one(j.customers);
    const tasks = j.job_tasks ?? [];
    const tasksDone = tasks.filter((t) => t.done).length;
    const overdue = j.due_at !== null && new Date(j.due_at).getTime() < now;

    return {
      id: j.id,
      title: j.title,
      client: j.business_name ?? customer?.business_name ?? customer?.name ?? null,
      type: j.project_type,
      typeLabel: PROJECT_TYPE_LABELS[j.project_type] ?? "Other",
      stage: j.stage,
      // Overdue outranks the stage: a job "In Progress" that blew its date is
      // not in progress, it is in trouble.
      status: overdue ? "At Risk" : (STAGE_TO_STATUS[j.stage] ?? "In Progress"),
      progress: tasks.length > 0 ? tasksDone / tasks.length : null,
      tasksDone,
      tasksTotal: tasks.length,
      dueAt: j.due_at,
      daysLeft:
        j.due_at === null
          ? null
          : Math.ceil((new Date(j.due_at).getTime() - now) / 86400_000),
      valueCents: j.value_cents,
      owner: j.owner,
      nextMilestone: j.next_milestone,
      href: `/admin/jobs/${j.id}`,
    };
  });

  return {
    rows: rows.slice(0, limit),
    total: rows.length,
    atRisk: rows.filter((r) => r.status === "At Risk").length,
  };
}
