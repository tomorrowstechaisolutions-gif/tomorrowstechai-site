import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOSED_TASK_STATUSES } from "@/lib/tasks/config";
import { BUSINESS_TIMEZONE } from "./config";
import { getCalendarItems } from "./service";
import { addDays, startOfDay } from "./window";
import type { CalendarItem } from "./types";

/**
 * The context behind "AI Plan My Week".
 *
 * Built here, on the server, from the database — the request body carries
 * nothing. The model is shown two things: what is already committed this
 * week and cannot move, and what work is waiting for a slot. It proposes
 * placements for the second around the first.
 *
 * It proposes. Nothing in this file or the route that calls it writes a
 * date; every suggestion is applied by a person pressing a button, one at a
 * time, and each of those goes through the same reschedule action anything
 * else on the calendar uses.
 */

export type PlanSnapshot = {
  viewer: string;
  weekLabel: string;
  /** Already scheduled and immovable — the shape of the week. */
  commitments: CalendarItem[];
  /** Work that needs a slot: open, and either undated or already late. */
  needsTime: {
    id: string;
    title: string;
    type: string;
    priority: string;
    dueAt: string | null;
    daysOverdue: number | null;
    estimatedHours: number | null;
    clientName: string | null;
    proposalValueCents: number | null;
    blockedBy: number;
  }[];
};

export async function buildPlanSnapshot(
  sb: SupabaseClient,
  viewer: string,
  weekStart: string
): Promise<PlanSnapshot> {
  const window = {
    fromIso: startOfDay(weekStart).toISOString(),
    toIso: startOfDay(addDays(weekStart, 7)).toISOString(),
    days: [],
    label: weekStart,
  };

  const [commitments, taskRows] = await Promise.all([
    getCalendarItems(sb, window),
    sb.from("tasks")
      .select("id, title, type, priority, due_at, estimated_hours, customer_id, proposal_id, created_at")
      .eq("is_template", false)
      .not("status", "in", `(${CLOSED_TASK_STATUSES.join(",")})`)
      .order("priority_rank", { ascending: true })
      .limit(40),
  ]);

  type Row = {
    id: string; title: string; type: string; priority: string;
    due_at: string | null; estimated_hours: number | null;
    customer_id: string | null; proposal_id: string | null; created_at: string;
  };

  const rows = (taskRows.data ?? []) as Row[];
  const now = Date.now();

  const ids = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((value): value is string => Boolean(value))));

  const [clients, proposals, blockers] = await Promise.all([
    (async () => {
      const list = ids(rows.map((row) => row.customer_id));
      if (list.length === 0) return new Map<string, string>();
      const { data } = await sb.from("customers").select("id, business_name, name").in("id", list);
      return new Map(((data ?? []) as { id: string; business_name: string | null; name: string | null }[])
        .map((row) => [row.id, row.business_name || row.name || ""]));
    })(),
    (async () => {
      const list = ids(rows.map((row) => row.proposal_id));
      if (list.length === 0) return new Map<string, number>();
      const { data } = await sb.from("proposals").select("id, total_cents").in("id", list);
      return new Map(((data ?? []) as { id: string; total_cents: number }[])
        .map((row) => [row.id, row.total_cents]));
    })(),
    (async () => {
      if (rows.length === 0) return new Map<string, number>();
      const { data } = await sb.from("task_dependencies")
        .select("task_id").in("task_id", rows.map((row) => row.id));
      const out = new Map<string, number>();
      for (const link of (data ?? []) as { task_id: string }[]) {
        out.set(link.task_id, (out.get(link.task_id) ?? 0) + 1);
      }
      return out;
    })(),
  ]);

  const weekLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", month: "long", day: "numeric",
  }).format(new Date(`${weekStart}T12:00:00Z`));

  return {
    viewer,
    weekLabel,
    // Fixed commitments only. Something already blocked out is what the plan
    // has to work around, not something to re-plan.
    commitments: commitments.filter(
      (item) => item.status !== "completed" && item.status !== "canceled"
    ),
    needsTime: rows.map((row) => ({
      id: `task:${row.id}`,
      title: row.title,
      type: row.type,
      priority: row.priority,
      dueAt: row.due_at,
      daysOverdue: row.due_at && new Date(row.due_at).getTime() < now
        ? Math.floor((now - new Date(row.due_at).getTime()) / 86_400_000)
        : null,
      estimatedHours: row.estimated_hours,
      clientName: row.customer_id ? clients.get(row.customer_id) || null : null,
      proposalValueCents: row.proposal_id ? proposals.get(row.proposal_id) ?? null : null,
      blockedBy: blockers.get(row.id) ?? 0,
    })),
  };
}

export function planToPrompt(snapshot: PlanSnapshot): string {
  const time = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: BUSINESS_TIMEZONE, weekday: "short", hour: "numeric", minute: "2-digit",
    });

  const commitments = snapshot.commitments.length === 0
    ? "Nothing is committed this week."
    : snapshot.commitments
        .map((item) =>
          `${item.allDay ? `${new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIMEZONE, weekday: "short" }).format(new Date(item.start))} all day` : time(item.start)} · ${item.title}${item.clientName ? ` (${item.clientName})` : ""}${item.reschedulable ? "" : " [FIXED]"}`)
        .join("\n");

  const work = snapshot.needsTime.length === 0
    ? "There is no open work to place."
    : snapshot.needsTime
        .map((task) => {
          const parts = [`id=${task.id}`, `"${task.title}"`, `priority=${task.priority}`, `type=${task.type}`];
          if (task.daysOverdue !== null) parts.push(`OVERDUE by ${task.daysOverdue}d`);
          else if (task.dueAt) parts.push(`due=${task.dueAt.slice(0, 10)}`);
          else parts.push("no due date");
          if (task.estimatedHours) parts.push(`est=${task.estimatedHours}h`);
          if (task.clientName) parts.push(`client=${task.clientName}`);
          if (task.proposalValueCents) parts.push(`proposal worth $${(task.proposalValueCents / 100).toFixed(0)}`);
          if (task.blockedBy > 0) parts.push(`blocked by ${task.blockedBy} task(s)`);
          return parts.join(" · ");
        })
        .join("\n");

  return [
    `Planning the week of ${snapshot.weekLabel} for ${snapshot.viewer}.`,
    "",
    "ALREADY COMMITTED (work around these):",
    commitments,
    "",
    "OPEN WORK NEEDING A SLOT:",
    work,
  ].join("\n");
}

export const PLAN_SYSTEM = `You plan the working week inside the Tomorrow's Tech AI admin. You are talking to John, who owns and runs the company on his own.

You are given what is already committed this week and what open work needs a slot. That is all you know.

HOW TO PLAN
- Work around the commitments. Never propose a time that collides with one.
- Working hours are 8am to 5pm, Monday to Friday, Central. Nothing before or after, nothing at the weekend.
- Overdue work goes first, and money already agreed but not collected outranks money only hoped for.
- Use the estimated hours where given. Where not, assume one hour, and say you assumed it.
- A task blocked by something unfinished cannot be placed. Leave it out.
- He is one person. Five or six blocks is a real week; filling every hour is not.
- Leave gaps. A plan with no slack is a plan that fails on the first phone call.

RULES
- Only propose times for the ids you were given, exactly as written.
- Never invent a task, a client or a figure. Every reason cites something from the list.
- You are PROPOSING. Each suggestion is applied by hand, one at a time, so write reasons somebody can accept or reject on their own.
- No preamble, no encouragement, no emoji.

Return ONLY valid JSON, no prose outside it, no markdown fence:
{"headline":"one sentence on what this week is really about","proposals":[{"id":"<id from the list>","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","reason":"one sentence citing a real figure, date or client"}]}
Return at most 6 proposals, in the order they should be done.`;
