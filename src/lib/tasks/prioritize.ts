import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Priority } from "@/lib/supabase/types";
import { CLOSED_TASK_STATUSES, PRIORITY_LABELS, TYPE_LABELS, type TaskStatus, type TaskType } from "./config";

/**
 * The context behind "AI Prioritize My Day".
 *
 * Built here, on the server, from the database — exactly as the dashboard
 * advisor does it. The request body picks nothing but who is asking; every
 * fact the model sees comes from this function. That is what stops a caller
 * from feeding it a fake $50,000 proposal to move a task up the list.
 *
 * The model ranks and explains. It does not write: nothing in this file or
 * the route that calls it changes a task.
 */

export type PriorityCandidate = {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  dueAt: string | null;
  daysOverdue: number | null;
  ageDays: number;
  estimatedHours: number | null;
  clientName: string | null;
  projectName: string | null;
  /** The one-time value of a linked proposal, in cents. Real or absent. */
  proposalValueCents: number | null;
  proposalNumber: string | null;
  blockedBy: string[];
  blocking: number;
};

export type PrioritySnapshot = {
  viewer: string;
  today: string;
  candidates: PriorityCandidate[];
};

const MAX_CANDIDATES = 40;

export async function buildPrioritySnapshot(
  sb: SupabaseClient,
  viewer: string
): Promise<PrioritySnapshot> {
  const closed = `(${CLOSED_TASK_STATUSES.join(",")})`;

  const { data } = await sb
    .from("tasks")
    .select("id, title, type, status, priority, due_at, created_at, estimated_hours, customer_id, job_id, proposal_id")
    .eq("is_template", false)
    .not("status", "in", closed)
    .order("priority_rank", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(MAX_CANDIDATES);

  type Raw = {
    id: string; title: string; type: TaskType; status: TaskStatus; priority: Priority;
    due_at: string | null; created_at: string; estimated_hours: number | null;
    customer_id: string | null; job_id: string | null; proposal_id: string | null;
  };
  const rows = (data ?? []) as Raw[];
  const ids = rows.map((row) => row.id);

  const ids_ = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((v): v is string => Boolean(v))));

  const [clients, projects, proposals, deps, blocking] = await Promise.all([
    (async () => {
      const list = ids_(rows.map((r) => r.customer_id));
      if (list.length === 0) return new Map<string, string>();
      const { data: found } = await sb.from("customers")
        .select("id, business_name, name").in("id", list);
      return new Map(((found ?? []) as { id: string; business_name: string | null; name: string | null }[])
        .map((row) => [row.id, row.business_name || row.name || ""]));
    })(),
    (async () => {
      const list = ids_(rows.map((r) => r.job_id));
      if (list.length === 0) return new Map<string, string>();
      const { data: found } = await sb.from("jobs").select("id, title").in("id", list);
      return new Map(((found ?? []) as { id: string; title: string | null }[])
        .map((row) => [row.id, row.title || ""]));
    })(),
    (async () => {
      const list = ids_(rows.map((r) => r.proposal_id));
      if (list.length === 0) return new Map<string, { number: string; cents: number }>();
      const { data: found } = await sb.from("proposals")
        .select("id, proposal_number, total_cents").in("id", list);
      return new Map(((found ?? []) as { id: string; proposal_number: string; total_cents: number }[])
        .map((row) => [row.id, { number: row.proposal_number, cents: row.total_cents }]));
    })(),
    (async () => {
      if (ids.length === 0) return new Map<string, string[]>();
      const { data: links } = await sb.from("task_dependencies")
        .select("task_id, depends_on_task_id").in("task_id", ids);
      const upstreamIds = ids_(((links ?? []) as { depends_on_task_id: string }[])
        .map((l) => l.depends_on_task_id));
      const titles = new Map<string, string>();
      if (upstreamIds.length > 0) {
        const { data: up } = await sb.from("tasks")
          .select("id, title, status").in("id", upstreamIds);
        for (const row of (up ?? []) as { id: string; title: string; status: TaskStatus }[]) {
          // Only an UNFINISHED upstream task actually blocks anything.
          if (!CLOSED_TASK_STATUSES.includes(row.status)) titles.set(row.id, row.title);
        }
      }
      const out = new Map<string, string[]>();
      for (const link of (links ?? []) as { task_id: string; depends_on_task_id: string }[]) {
        const title = titles.get(link.depends_on_task_id);
        if (!title) continue;
        out.set(link.task_id, [...(out.get(link.task_id) ?? []), title]);
      }
      return out;
    })(),
    (async () => {
      if (ids.length === 0) return new Map<string, number>();
      const { data: links } = await sb.from("task_dependencies")
        .select("depends_on_task_id").in("depends_on_task_id", ids);
      const out = new Map<string, number>();
      for (const link of (links ?? []) as { depends_on_task_id: string }[]) {
        out.set(link.depends_on_task_id, (out.get(link.depends_on_task_id) ?? 0) + 1);
      }
      return out;
    })(),
  ]);

  const now = Date.now();
  const day = 86_400_000;

  return {
    viewer,
    today: new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago",
    }),
    candidates: rows.map((row) => {
      const proposal = row.proposal_id ? proposals.get(row.proposal_id) ?? null : null;
      const dueMs = row.due_at ? new Date(row.due_at).getTime() : null;
      return {
        id: row.id,
        title: row.title,
        type: row.type,
        status: row.status,
        priority: row.priority,
        dueAt: row.due_at,
        daysOverdue: dueMs && dueMs < now ? Math.floor((now - dueMs) / day) : null,
        ageDays: Math.floor((now - new Date(row.created_at).getTime()) / day),
        estimatedHours: row.estimated_hours,
        clientName: row.customer_id ? clients.get(row.customer_id) || null : null,
        projectName: row.job_id ? projects.get(row.job_id) || null : null,
        proposalValueCents: proposal?.cents ?? null,
        proposalNumber: proposal?.number ?? null,
        blockedBy: deps.get(row.id) ?? [],
        blocking: blocking.get(row.id) ?? 0,
      };
    }),
  };
}

/** The snapshot as the compact text the model reads. */
export function snapshotToPrompt(snapshot: PrioritySnapshot): string {
  if (snapshot.candidates.length === 0) {
    return `Today is ${snapshot.today}. ${snapshot.viewer} has no open tasks.`;
  }

  const lines = snapshot.candidates.map((task, index) => {
    const parts = [
      `[${index + 1}] id=${task.id}`,
      `"${task.title}"`,
      `type=${TYPE_LABELS[task.type]}`,
      `priority=${PRIORITY_LABELS[task.priority]}`,
      `status=${task.status}`,
    ];
    if (task.daysOverdue !== null) parts.push(`OVERDUE by ${task.daysOverdue}d`);
    else if (task.dueAt) parts.push(`due=${task.dueAt.slice(0, 10)}`);
    else parts.push("no due date");

    if (task.clientName) parts.push(`client=${task.clientName}`);
    if (task.projectName) parts.push(`project=${task.projectName}`);
    if (task.proposalValueCents !== null) {
      parts.push(`proposal=${task.proposalNumber} worth $${(task.proposalValueCents / 100).toFixed(0)}`);
    }
    if (task.estimatedHours !== null) parts.push(`est=${task.estimatedHours}h`);
    if (task.blockedBy.length > 0) parts.push(`BLOCKED BY: ${task.blockedBy.join("; ")}`);
    if (task.blocking > 0) parts.push(`blocks ${task.blocking} other task(s)`);
    parts.push(`age=${task.ageDays}d`);

    return parts.join(" · ");
  });

  return [
    `Today is ${snapshot.today}. These are the open tasks for ${snapshot.viewer}.`,
    "",
    ...lines,
  ].join("\n");
}

export const PRIORITIZE_SYSTEM = `You rank the day's work inside the Tomorrow's Tech AI admin. You are talking to John, who owns and runs the company on his own.

You are given every open task with its real priority, due date, client, linked proposal value, dependencies, estimated effort and age. That list is the only thing you know. 

HOW TO RANK
- Money that is already agreed but not collected outranks money that is only hoped for.
- A task that other tasks are blocked behind outranks one that blocks nothing.
- Overdue outranks upcoming, but a one-day-late low-priority task does not outrank an urgent one due today.
- A task that is itself BLOCKED BY something unfinished cannot be first. Say what has to happen before it.
- Prefer a short task that unblocks a project over a long task that unblocks nothing.
- He is one person. Five items is a day; ten is a fantasy.

RULES
- Never invent a fact. Every reason must cite something from the list: a figure, a date, a client name, a dependency.
- Never invent a task. Only rank tasks you were given, by their id.
- No preamble, no encouragement, no emoji. One short sentence per reason.
- If there is nothing meaningfully urgent, say so and return fewer items rather than padding the list.

Return ONLY valid JSON, no prose outside it, no markdown fence:
{"headline":"one sentence on what today is really about","items":[{"id":"<task id from the list>","reason":"one sentence citing a real figure, date, client or dependency"}]}
Return at most 5 items, most important first.`;
