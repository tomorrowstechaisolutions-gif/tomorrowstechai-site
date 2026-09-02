import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chicagoDate, zonedMidnightUtc } from "@/lib/dashboard/period";
import type { Priority } from "@/lib/supabase/types";
import {
  CLOSED_TASK_STATUSES, TASKS_PER_PAGE, WAITING_STATUSES,
  type TaskGroup, type TaskSort, type TaskStatus, type TaskTab, type TaskType,
} from "./config";
import type {
  Task, TaskAttachment, TaskChecklistItem, TaskComment,
  TaskDetail, TaskEvent, TaskListRow,
} from "./types";

/**
 * The read side of Tasks.
 *
 * Everything runs on the request-scoped client, so RLS applies and an account
 * that is not in admin_users reads nothing. Filtering, sorting and pagination
 * all happen in Postgres: the browser is never handed the whole table and
 * asked to find twenty-five rows in it.
 */

export type TaskQuery = {
  tab: TaskTab;
  q?: string;
  status?: string;
  type?: string;
  priority?: string;
  owner?: string;
  client?: string;
  project?: string;
  sort: TaskSort;
  group: TaskGroup;
  page: number;
};

export type TaskKpis = {
  dueToday: number;
  dueTodayUrgent: number;
  overdue: number;
  overdueUrgent: number;
  thisWeek: number;
  thisWeekDone: number;
  waiting: number;
  completedThisWeek: number;
};

export type TaskWorkspace = {
  rows: TaskListRow[];
  total: number;
  page: number;
  pageCount: number;
  kpis: TaskKpis;
  tabCounts: Record<TaskTab, number | null>;
  owners: string[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
};

/** Chicago day boundaries as UTC instants, which is what due_at is stored in. */
function dayBounds(offsetDays = 0) {
  const today = chicagoDate();
  const [y, m, d] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d + offsetDays));
  const end = new Date(Date.UTC(y, m - 1, d + offsetDays + 1));
  const iso = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return {
    fromIso: zonedMidnightUtc(iso(start)).toISOString(),
    toIso: zonedMidnightUtc(iso(end)).toISOString(),
  };
}

/** Monday through Sunday of the current Chicago week. */
function weekBounds() {
  const today = chicagoDate();
  const [y, m, d] = today.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0 = Sunday. Shift so Monday is the first day.
  const offsetToMonday = (probe.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(y, m - 1, d - offsetToMonday));
  const end = new Date(Date.UTC(y, m - 1, d - offsetToMonday + 7));
  const iso = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return {
    fromIso: zonedMidnightUtc(iso(start)).toISOString(),
    toIso: zonedMidnightUtc(iso(end)).toISOString(),
  };
}

const CLOSED_LIST = `(${CLOSED_TASK_STATUSES.join(",")})`;

/** Every list query starts here: real tasks only, never template blueprints. */
function base(sb: SupabaseClient, select: string, head = false) {
  return sb
    .from("tasks")
    .select(select, head ? { count: "exact", head: true } : { count: "exact" })
    .eq("is_template", false);
}

async function countOf(query: PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await query;
  return count ?? 0;
}

export async function loadTaskKpis(sb: SupabaseClient): Promise<TaskKpis> {
  const today = dayBounds();
  const week = weekBounds();
  const nowIso = new Date().toISOString();

  const [
    dueToday, dueTodayUrgent, overdue, overdueUrgent,
    thisWeek, thisWeekDone, waiting, completedThisWeek,
  ] = await Promise.all([
    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST)
      .gte("due_at", today.fromIso).lt("due_at", today.toIso)),
    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST)
      .gte("due_at", today.fromIso).lt("due_at", today.toIso)
      .in("priority", ["critical", "high"])),

    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST)
      .lt("due_at", nowIso)),
    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST)
      .lt("due_at", nowIso).eq("priority", "critical")),

    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST)
      .gte("due_at", week.fromIso).lt("due_at", week.toIso)),
    countOf(base(sb, "id", true).eq("status", "completed")
      .gte("due_at", week.fromIso).lt("due_at", week.toIso)),

    countOf(base(sb, "id", true).in("status", WAITING_STATUSES)),

    countOf(base(sb, "id", true).eq("status", "completed")
      .gte("done_at", week.fromIso).lt("done_at", week.toIso)),
  ]);

  return {
    dueToday, dueTodayUrgent, overdue, overdueUrgent,
    thisWeek, thisWeekDone, waiting, completedThisWeek,
  };
}

/** Applies the tab. Each one is a different question about the same table. */
function applyTab(
  query: ReturnType<typeof base>,
  tab: TaskTab,
  viewer: string
): ReturnType<typeof base> {
  const today = dayBounds();

  switch (tab) {
    case "mine":
      return query.not("status", "in", CLOSED_LIST).eq("owner", viewer);
    case "today":
      // Due today OR already late — both are things to deal with today.
      return query.not("status", "in", CLOSED_LIST).lt("due_at", today.toIso);
    case "upcoming":
      return query.not("status", "in", CLOSED_LIST).gte("due_at", today.toIso);
    case "waiting":
      return query.in("status", WAITING_STATUSES);
    case "completed":
      return query.eq("status", "completed");
    case "all":
    default:
      // "All" means all open work. Finished tasks have their own tab, and
      // burying today's four under six months of completed ones is not a list
      // anybody uses.
      return query.not("status", "in", CLOSED_LIST);
  }
}

export async function loadTaskTabCounts(
  sb: SupabaseClient,
  viewer: string
): Promise<Record<TaskTab, number | null>> {
  const today = dayBounds();

  const [mine, all, todayCount, upcoming, waiting, completed] = await Promise.all([
    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST).eq("owner", viewer)),
    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST)),
    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST).lt("due_at", today.toIso)),
    countOf(base(sb, "id", true).not("status", "in", CLOSED_LIST).gte("due_at", today.toIso)),
    countOf(base(sb, "id", true).in("status", WAITING_STATUSES)),
    countOf(base(sb, "id", true).eq("status", "completed")),
  ]);

  return {
    mine, all, today: todayCount, upcoming, waiting, completed,
  };
}

const ROW_SELECT = `
  id, title, notes, type, status, priority, due_at, due_time, owner,
  lead_id, customer_id, job_id, proposal_id, parent_task_id,
  blocked_reason, tags, updated_at
`;

export async function loadTaskWorkspace(
  sb: SupabaseClient,
  query: TaskQuery,
  viewer: string
): Promise<TaskWorkspace> {
  let rows = applyTab(base(sb, ROW_SELECT), query.tab, viewer);

  if (query.status && query.status !== "all") rows = rows.eq("status", query.status);
  if (query.type && query.type !== "all") rows = rows.eq("type", query.type);
  if (query.priority && query.priority !== "all") rows = rows.eq("priority", query.priority);
  if (query.owner && query.owner !== "all") rows = rows.eq("owner", query.owner);
  if (query.client && query.client !== "all") rows = rows.eq("customer_id", query.client);
  if (query.project && query.project !== "all") rows = rows.eq("job_id", query.project);

  const needle = (query.q ?? "").trim();
  if (needle) {
    const escaped = needle.replace(/[%,()]/g, " ");
    rows = rows.or(`title.ilike.%${escaped}%,notes.ilike.%${escaped}%`);
  }

  // Sorting. Every option is a real column, so the database does the work and
  // page two is genuinely the next twenty-five.
  switch (query.sort) {
    case "priority":
      rows = rows.order("priority_rank", { ascending: true })
                 .order("due_at", { ascending: true, nullsFirst: false });
      break;
    case "created":
      rows = rows.order("created_at", { ascending: false });
      break;
    case "updated":
      rows = rows.order("updated_at", { ascending: false });
      break;
    case "title":
      rows = rows.order("title", { ascending: true });
      break;
    case "due":
    default:
      rows = rows.order("due_at", { ascending: true, nullsFirst: false })
                 .order("priority_rank", { ascending: true });
      break;
  }

  const page = Math.max(1, query.page || 1);
  const from = (page - 1) * TASKS_PER_PAGE;
  const { data, count, error } = await rows.range(from, from + TASKS_PER_PAGE - 1);
  if (error) throw new Error(`Could not load tasks: ${error.message}`);

  type Raw = Pick<Task,
    | "id" | "title" | "notes" | "type" | "status" | "priority" | "due_at"
    | "due_time" | "owner" | "lead_id" | "customer_id" | "job_id"
    | "proposal_id" | "parent_task_id" | "blocked_reason" | "tags" | "updated_at">;
  const raw = (data ?? []) as unknown as Raw[];
  const ids = raw.map((row) => row.id);

  // Relations and per-row counts, resolved for THIS PAGE only. Twenty-five
  // rows means five small lookups, not a join per row and not the whole table.
  const [clients, projects, checklist, comments, attachments, subtasks] = await Promise.all([
    clientNames(sb, raw.map((r) => r.customer_id)),
    projectNames(sb, raw.map((r) => r.job_id)),
    childCounts(sb, "task_checklist_items", ids, "is_completed"),
    childCounts(sb, "task_comments", ids),
    childCounts(sb, "task_attachments", ids),
    subtaskCounts(sb, ids),
  ]);

  const now = Date.now();
  const list: TaskListRow[] = raw.map((row) => {
    const checks = checklist.get(row.id);
    return {
      id: row.id,
      title: row.title,
      subtitle: row.notes ? row.notes.split("\n")[0].slice(0, 140) : null,
      type: row.type as TaskType,
      status: row.status as TaskStatus,
      priority: row.priority as Priority,
      dueAt: row.due_at,
      dueTime: row.due_time,
      overdue: Boolean(
        row.due_at &&
        new Date(row.due_at).getTime() < now &&
        !CLOSED_TASK_STATUSES.includes(row.status as TaskStatus)
      ),
      owner: row.owner,
      clientName: row.customer_id ? clients.get(row.customer_id) ?? null : null,
      projectName: row.job_id ? projects.get(row.job_id) ?? null : null,
      clientId: row.customer_id,
      projectId: row.job_id,
      leadId: row.lead_id,
      proposalId: row.proposal_id,
      parentTaskId: row.parent_task_id,
      blockedReason: row.blocked_reason,
      checklistTotal: checks?.total ?? 0,
      checklistDone: checks?.done ?? 0,
      commentCount: comments.get(row.id)?.total ?? 0,
      attachmentCount: attachments.get(row.id)?.total ?? 0,
      subtaskCount: subtasks.get(row.id) ?? 0,
      tags: row.tags ?? [],
      updatedAt: row.updated_at,
    };
  });

  const [kpis, tabCounts, facets] = await Promise.all([
    loadTaskKpis(sb),
    loadTaskTabCounts(sb, viewer),
    loadTaskFacets(sb),
  ]);

  const total = count ?? list.length;

  return {
    rows: list,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / TASKS_PER_PAGE)),
    kpis,
    tabCounts,
    owners: facets.owners,
    clients: facets.clients,
    projects: facets.projects,
  };
}

/**
 * Names for a set of ids, in one query, skipped entirely when there are none.
 * Two functions rather than one with a `table` argument: a template-string
 * select defeats supabase-js's type inference and hands back an error type.
 */
function uniqueIds(ids: (string | null)[]): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

async function clientNames(
  sb: SupabaseClient,
  ids: (string | null)[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = uniqueIds(ids);
  if (unique.length === 0) return out;

  const { data } = await sb
    .from("customers")
    .select("id, business_name, name")
    .in("id", unique);

  for (const row of (data ?? []) as { id: string; business_name: string | null; name: string | null }[]) {
    const name = row.business_name || row.name;
    if (name) out.set(row.id, name);
  }
  return out;
}

async function projectNames(
  sb: SupabaseClient,
  ids: (string | null)[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = uniqueIds(ids);
  if (unique.length === 0) return out;

  const { data } = await sb
    .from("jobs")
    .select("id, title, business_name")
    .in("id", unique);

  for (const row of (data ?? []) as { id: string; title: string | null; business_name: string | null }[]) {
    const name = row.title || row.business_name;
    if (name) out.set(row.id, name);
  }
  return out;
}

async function childCounts(
  sb: SupabaseClient,
  table: "task_checklist_items" | "task_comments" | "task_attachments",
  taskIds: string[],
  doneColumn?: string
): Promise<Map<string, { total: number; done: number }>> {
  const out = new Map<string, { total: number; done: number }>();
  if (taskIds.length === 0) return out;

  const columns = doneColumn ? `task_id, ${doneColumn}` : "task_id";
  const { data } = await sb.from(table).select(columns).in("task_id", taskIds);

  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const key = row.task_id as string;
    const entry = out.get(key) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (doneColumn && row[doneColumn] === true) entry.done += 1;
    out.set(key, entry);
  }
  return out;
}

async function subtaskCounts(
  sb: SupabaseClient,
  taskIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (taskIds.length === 0) return out;

  const { data } = await sb
    .from("tasks")
    .select("parent_task_id")
    .in("parent_task_id", taskIds);

  for (const row of (data ?? []) as { parent_task_id: string }[]) {
    out.set(row.parent_task_id, (out.get(row.parent_task_id) ?? 0) + 1);
  }
  return out;
}

/** The values the filter dropdowns can actually offer. */
export async function loadTaskFacets(sb: SupabaseClient): Promise<{
  owners: string[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}> {
  const [ownerRows, clientRows, projectRows] = await Promise.all([
    sb.from("tasks").select("owner").eq("is_template", false)
      .not("owner", "is", null).limit(1000),
    sb.from("customers").select("id, business_name, name")
      .order("updated_at", { ascending: false }).limit(200),
    sb.from("jobs").select("id, title, business_name")
      .order("updated_at", { ascending: false }).limit(200),
  ]);

  return {
    owners: Array.from(
      new Set(((ownerRows.data ?? []) as { owner: string | null }[])
        .map((row) => row.owner).filter((owner): owner is string => Boolean(owner)))
    ).sort(),
    clients: ((clientRows.data ?? []) as { id: string; business_name: string | null; name: string | null }[])
      .map((row) => ({ id: row.id, name: row.business_name || row.name || "Unnamed client" })),
    projects: ((projectRows.data ?? []) as { id: string; title: string | null; business_name: string | null }[])
      .map((row) => ({ id: row.id, name: row.title || row.business_name || "Untitled project" })),
  };
}

/** Overdue plus due today — what the sidebar badge counts. */
export async function loadTaskAttentionCount(sb: SupabaseClient): Promise<number> {
  const today = dayBounds();
  return countOf(
    base(sb, "id", true).not("status", "in", CLOSED_LIST).lt("due_at", today.toIso)
  );
}

/** Everything the detail drawer renders, in one pass. */
export async function loadTaskDetail(
  sb: SupabaseClient,
  id: string
): Promise<TaskDetail | null> {
  const { data } = await sb.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const task = data as Task;

  const [
    checklist, comments, attachments, events,
    dependsRows, blockingRows, subtaskRows,
  ] = await Promise.all([
    sb.from("task_checklist_items").select("*").eq("task_id", id)
      .order("sort_order", { ascending: true })
      .then((r) => (r.data ?? []) as TaskChecklistItem[]),
    sb.from("task_comments").select("*").eq("task_id", id)
      .order("created_at", { ascending: true })
      .then((r) => (r.data ?? []) as TaskComment[]),
    sb.from("task_attachments").select("*").eq("task_id", id)
      .order("created_at", { ascending: true })
      .then((r) => (r.data ?? []) as TaskAttachment[]),
    sb.from("task_events").select("*").eq("task_id", id)
      .order("created_at", { ascending: false }).limit(100)
      .then((r) => (r.data ?? []) as TaskEvent[]),
    sb.from("task_dependencies").select("depends_on_task_id").eq("task_id", id)
      .then((r) => (r.data ?? []) as { depends_on_task_id: string }[]),
    sb.from("task_dependencies").select("task_id").eq("depends_on_task_id", id)
      .then((r) => (r.data ?? []) as { task_id: string }[]),
    sb.from("tasks").select("id, title, status, priority").eq("parent_task_id", id)
      .order("sort_order", { ascending: true })
      .then((r) => (r.data ?? []) as { id: string; title: string; status: TaskStatus; priority: Priority }[]),
  ]);

  const relatedIds = Array.from(new Set([
    ...dependsRows.map((row) => row.depends_on_task_id),
    ...blockingRows.map((row) => row.task_id),
    ...(task.parent_task_id ? [task.parent_task_id] : []),
  ]));

  const related = new Map<string, { id: string; title: string; status: TaskStatus }>();
  if (relatedIds.length > 0) {
    const { data: rows } = await sb
      .from("tasks").select("id, title, status").in("id", relatedIds);
    for (const row of (rows ?? []) as { id: string; title: string; status: TaskStatus }[]) {
      related.set(row.id, row);
    }
  }

  const [clientName, projectName, proposal, service] = await Promise.all([
    task.customer_id
      ? clientNames(sb, [task.customer_id]).then((m) => m.get(task.customer_id!) ?? null)
      : Promise.resolve(null),
    task.job_id
      ? projectNames(sb, [task.job_id]).then((m) => m.get(task.job_id!) ?? null)
      : Promise.resolve(null),
    task.proposal_id
      ? sb.from("proposals").select("proposal_number").eq("id", task.proposal_id)
          .maybeSingle().then((r) => (r.data?.proposal_number as string | undefined) ?? null)
      : Promise.resolve(null),
    task.service_id
      ? sb.from("catalog_items").select("name").eq("id", task.service_id)
          .maybeSingle().then((r) => (r.data?.name as string | undefined) ?? null)
      : Promise.resolve(null),
  ]);

  return {
    task,
    checklist,
    comments,
    attachments,
    events,
    dependsOn: dependsRows
      .map((row) => related.get(row.depends_on_task_id))
      .filter((row): row is { id: string; title: string; status: TaskStatus } => Boolean(row)),
    blocking: blockingRows
      .map((row) => related.get(row.task_id))
      .filter((row): row is { id: string; title: string; status: TaskStatus } => Boolean(row)),
    subtasks: subtaskRows,
    clientName,
    projectName,
    proposalNumber: proposal,
    serviceName: service,
    parentTitle: task.parent_task_id ? related.get(task.parent_task_id)?.title ?? null : null,
  };
}

/** Candidates for the "attach this task to something" pickers. */
export async function loadTaskLinkOptions(sb: SupabaseClient): Promise<{
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  leads: { id: string; name: string }[];
  proposals: { id: string; name: string }[];
  services: { id: string; name: string }[];
  parents: { id: string; name: string }[];
}> {
  const [facets, leads, proposals, services, parents] = await Promise.all([
    loadTaskFacets(sb),
    sb.from("leads").select("id, first_name, last_name, business_name")
      .order("updated_at", { ascending: false }).limit(200),
    sb.from("proposals").select("id, proposal_number, title")
      .order("updated_at", { ascending: false }).limit(200),
    sb.from("catalog_items").select("id, name").eq("active", true)
      .order("position", { ascending: true }).limit(100),
    sb.from("tasks").select("id, title").eq("is_template", false)
      .not("status", "in", CLOSED_LIST)
      .order("updated_at", { ascending: false }).limit(200),
  ]);

  return {
    clients: facets.clients,
    projects: facets.projects,
    leads: ((leads.data ?? []) as { id: string; first_name: string | null; last_name: string | null; business_name: string | null }[])
      .map((row) => ({
        id: row.id,
        name: [row.first_name, row.last_name].filter(Boolean).join(" ")
          || row.business_name || "Unnamed lead",
      })),
    proposals: ((proposals.data ?? []) as { id: string; proposal_number: string; title: string }[])
      .map((row) => ({ id: row.id, name: `${row.proposal_number} — ${row.title}` })),
    services: ((services.data ?? []) as { id: string; name: string }[])
      .map((row) => ({ id: row.id, name: row.name })),
    parents: ((parents.data ?? []) as { id: string; title: string }[])
      .map((row) => ({ id: row.id, name: row.title })),
  };
}
