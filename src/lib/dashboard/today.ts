import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { todayPeriod } from "./period";
import { CLOSED_STATUSES, type Priority, type TaskKind } from "@/lib/supabase/types";

/**
 * Section 4 — Today.
 *
 * Seven different tables, one list. The day is not lived one module at a time,
 * so the dashboard does not present it that way.
 *
 * Only rows from `tasks` are checkable here — everything else is a fact about
 * another record (a meeting exists, an invoice is unpaid) and is closed by
 * dealing with that record, not by ticking a box.
 */

export type TodayKind =
  | "task"
  | "meeting"
  | "followup"
  | "callback"
  | "deadline"
  | "invoice"
  | "content";

export type TodayItem = {
  id: string;
  kind: TodayKind;
  title: string;
  subtitle: string | null;
  /** When it is due. Null for an undated task. */
  at: string | null;
  overdue: boolean;
  priority: Priority;
  href: string;
  /** Set only for real task rows — the checkbox writes back to this id. */
  taskId?: string;
};

export type TodayBoard = {
  items: TodayItem[];
  doneToday: number;
  overdueCount: number;
};

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const TASK_KIND_TO_TODAY: Record<TaskKind, TodayKind> = {
  task: "task",
  followup: "followup",
  meeting: "meeting",
  callback: "callback",
  deadline: "deadline",
  invoice: "invoice",
  content: "content",
  other: "task",
};

export async function loadToday(sb: SupabaseClient): Promise<TodayBoard> {
  const day = todayPeriod();
  const endOfDay = day.toIso;
  const now = Date.now();

  const [tasks, appointments, jobs, callbacks, invoices, posts, doneToday] =
    await Promise.all([
      sb
        .from("tasks")
        .select("id, title, notes, kind, priority, due_at, lead_id, job_id")
        .eq("done", false)
        .or(`due_at.lt.${endOfDay},due_at.is.null`)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(30)
        .then((r) => unwrap(r, "tasks")),

      sb
        .from("appointments")
        .select("id, scheduled_at, source, notes, lead_id")
        .eq("status", "scheduled")
        .gte("scheduled_at", day.fromIso)
        .lt("scheduled_at", endOfDay)
        .then((r) => unwrap(r, "appointments")),

      sb
        .from("jobs")
        .select("id, title, business_name, due_at, stage, next_milestone")
        .is("completed_at", null)
        .not("due_at", "is", null)
        .lt("due_at", endOfDay)
        .limit(20)
        .then((r) => unwrap(r, "job deadlines")),

      sb
        .from("leads")
        .select("id, first_name, last_name, business_name, next_followup_at")
        .not("next_followup_at", "is", null)
        .lt("next_followup_at", endOfDay)
        .not("lead_status", "in", `(${CLOSED_STATUSES.join(",")})`)
        .eq("do_not_contact", false)
        .limit(20)
        .then((r) => unwrap(r, "callbacks")),

      sb
        .from("invoices")
        .select("id, kind, description, amount_cents, launch_cents, sent_at, expires_at, lead_id")
        .eq("status", "sent")
        .limit(20)
        .then((r) => unwrap(r, "open invoices")),

      sb
        .from("social_posts")
        .select("id, platform, body, scheduled_at, status")
        .in("status", ["scheduled", "needs_approval"])
        .lt("scheduled_at", endOfDay)
        .limit(20)
        .then((r) => unwrap(r, "scheduled posts")),

      sb
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("done", true)
        .gte("done_at", day.fromIso)
        .then((r) => r.count ?? 0),
    ]);

  const items: TodayItem[] = [];

  for (const t of tasks as {
    id: string;
    title: string;
    notes: string | null;
    kind: TaskKind;
    priority: Priority;
    due_at: string | null;
    lead_id: string | null;
    job_id: string | null;
  }[]) {
    items.push({
      id: `task:${t.id}`,
      taskId: t.id,
      kind: TASK_KIND_TO_TODAY[t.kind] ?? "task",
      title: t.title,
      subtitle: t.notes,
      at: t.due_at,
      overdue: t.due_at !== null && new Date(t.due_at).getTime() < now,
      priority: t.priority,
      href: t.lead_id
        ? `/admin/leads/${t.lead_id}`
        : t.job_id
          ? `/admin/jobs/${t.job_id}`
          : "/admin/tasks",
    });
  }

  for (const a of appointments as {
    id: string;
    scheduled_at: string | null;
    source: string;
    notes: string | null;
    lead_id: string | null;
  }[]) {
    items.push({
      id: `appt:${a.id}`,
      kind: "meeting",
      title: a.notes?.slice(0, 90) || "Scheduled call",
      subtitle: `Booked via ${a.source}`,
      at: a.scheduled_at,
      overdue: false,
      priority: "high",
      href: a.lead_id ? `/admin/leads/${a.lead_id}` : "/admin/calendar",
    });
  }

  for (const j of jobs as {
    id: string;
    title: string;
    business_name: string | null;
    due_at: string;
    stage: string;
    next_milestone: string | null;
  }[]) {
    const overdue = new Date(j.due_at).getTime() < now;
    items.push({
      id: `job:${j.id}`,
      kind: "deadline",
      title: j.next_milestone || `${j.title} — ${j.stage}`,
      subtitle: j.business_name,
      at: j.due_at,
      overdue,
      priority: overdue ? "critical" : "high",
      href: `/admin/jobs/${j.id}`,
    });
  }

  for (const l of callbacks as {
    id: string;
    first_name: string;
    last_name: string;
    business_name: string | null;
    next_followup_at: string;
  }[]) {
    const overdue = new Date(l.next_followup_at).getTime() < now;
    items.push({
      id: `lead:${l.id}`,
      kind: "callback",
      title: `Call ${l.first_name} ${l.last_name}`.trim(),
      subtitle: l.business_name,
      at: l.next_followup_at,
      overdue,
      priority: overdue ? "critical" : "high",
      href: `/admin/leads/${l.id}`,
    });
  }

  for (const inv of invoices as {
    id: string;
    kind: "launch" | "upsell";
    description: string | null;
    amount_cents: number;
    launch_cents: number;
    sent_at: string;
    expires_at: string | null;
    lead_id: string | null;
  }[]) {
    const expired =
      inv.expires_at !== null && new Date(inv.expires_at).getTime() < now;
    const stale = now - new Date(inv.sent_at).getTime() > 7 * 86400_000;
    if (!expired && !stale) continue;

    const cents = inv.kind === "launch" ? inv.launch_cents : inv.amount_cents;
    items.push({
      id: `inv:${inv.id}`,
      kind: "invoice",
      title: `Chase payment — $${(cents / 100).toLocaleString("en-US")}`,
      subtitle: inv.description ?? (expired ? "Checkout link expired" : "Sent over a week ago"),
      at: inv.expires_at ?? inv.sent_at,
      overdue: expired,
      priority: expired ? "critical" : "medium",
      href: inv.lead_id ? `/admin/leads/${inv.lead_id}` : "/admin/finance/invoices",
    });
  }

  for (const p of posts as {
    id: string;
    platform: string;
    body: string;
    scheduled_at: string | null;
    status: string;
  }[]) {
    items.push({
      id: `post:${p.id}`,
      kind: "content",
      title:
        p.status === "needs_approval"
          ? `Approve post — ${p.platform}`
          : `Post goes out — ${p.platform}`,
      subtitle: p.body.slice(0, 90) || null,
      at: p.scheduled_at,
      overdue: false,
      priority: p.status === "needs_approval" ? "high" : "low",
      href: "/admin/marketing/social",
    });
  }

  items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.at && b.at) return a.at.localeCompare(b.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });

  return {
    items,
    doneToday: doneToday as number,
    overdueCount: items.filter((i) => i.overdue).length,
  };
}
