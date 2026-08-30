import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";

/**
 * Section 11 — Recent activity.
 *
 * A union over the event tables that already exist. There is no `activities`
 * table on purpose: a copy of these rows would be a cache with no owner, and
 * it would be wrong the first time a webhook wrote to one table and not the
 * other.
 */

export type ActivityModule =
  | "lead"
  | "project"
  | "finance"
  | "social"
  | "task"
  | "ai";

export type ActivityItem = {
  id: string;
  module: ActivityModule;
  title: string;
  subtitle: string | null;
  at: string;
  href: string;
};

const LEAD_EVENT_TITLES: Record<string, string> = {
  form_submit: "New lead received",
  status_change: "Lead status changed",
  email_sent: "Email sent to lead",
  email_failed: "Email to lead failed",
  call: "Call logged",
  sms: "Text logged",
  note: "Note added to lead",
  followup_sent: "Automated follow-up sent",
  appointment: "Appointment booked",
  revenue: "Revenue recorded",
  duplicate_merge: "Returning lead merged",
  system: "System event",
};

export async function loadActivity(
  sb: SupabaseClient,
  limit = 12
): Promise<ActivityItem[]> {
  // Each table is capped independently, then the merged list is trimmed. One
  // chatty table can't crowd the others out of the feed.
  const per = Math.max(6, limit);

  const [leadEvents, jobEvents, revenue, invoices, posts, tasks] = await Promise.all([
    sb
      .from("lead_events")
      .select("id, lead_id, created_at, type, body, actor")
      .order("created_at", { ascending: false })
      .limit(per)
      .then((r) => unwrap(r, "lead events")),
    sb
      .from("job_events")
      .select("id, job_id, created_at, kind, body, from_stage, to_stage")
      .order("created_at", { ascending: false })
      .limit(per)
      .then((r) => unwrap(r, "job events")),
    sb
      .from("revenue_events")
      .select("id, lead_id, occurred_at, kind, category, description, amount_cents")
      .order("occurred_at", { ascending: false })
      .limit(per)
      .then((r) => unwrap(r, "revenue events")),
    sb
      .from("invoices")
      .select("id, lead_id, status, kind, description, amount_cents, launch_cents, paid_at, sent_at")
      .order("sent_at", { ascending: false })
      .limit(per)
      .then((r) => unwrap(r, "invoices")),
    sb
      .from("social_posts")
      .select("id, platform, body, published_at, status")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(per)
      .then((r) => unwrap(r, "published posts")),
    sb
      .from("tasks")
      .select("id, title, done_at, lead_id, job_id")
      .eq("done", true)
      .not("done_at", "is", null)
      .order("done_at", { ascending: false })
      .limit(per)
      .then((r) => unwrap(r, "completed tasks")),
  ]);

  const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
  const items: ActivityItem[] = [];

  for (const e of leadEvents as {
    id: string;
    lead_id: string;
    created_at: string;
    type: string;
    body: string | null;
    actor: string;
  }[]) {
    items.push({
      id: `le:${e.id}`,
      module: "lead",
      title: LEAD_EVENT_TITLES[e.type] ?? "Lead activity",
      subtitle: e.body?.slice(0, 120) ?? null,
      at: e.created_at,
      href: `/admin/leads/${e.lead_id}`,
    });
  }

  for (const e of jobEvents as {
    id: string;
    job_id: string;
    created_at: string;
    kind: string;
    body: string | null;
    from_stage: string | null;
    to_stage: string | null;
  }[]) {
    items.push({
      id: `je:${e.id}`,
      module: "project",
      title:
        e.kind === "stage_change" && e.to_stage
          ? `Project moved to ${e.to_stage}`
          : e.kind === "task"
            ? "Project checklist updated"
            : "Project activity",
      subtitle: e.body?.slice(0, 120) ?? null,
      at: e.created_at,
      href: `/admin/jobs/${e.job_id}`,
    });
  }

  for (const r of revenue as {
    id: string;
    lead_id: string | null;
    occurred_at: string;
    kind: string;
    category: string;
    description: string | null;
    amount_cents: number;
  }[]) {
    items.push({
      id: `rv:${r.id}`,
      module: "finance",
      title: `${money(r.amount_cents)} booked — ${r.category.replace(/_/g, " ")}`,
      subtitle: r.description ?? r.kind,
      at: r.occurred_at,
      href: r.lead_id ? `/admin/leads/${r.lead_id}` : "/admin/finance",
    });
  }

  for (const i of invoices as {
    id: string;
    lead_id: string | null;
    status: string;
    kind: "launch" | "upsell";
    description: string | null;
    amount_cents: number;
    launch_cents: number;
    paid_at: string | null;
    sent_at: string;
  }[]) {
    const cents = i.kind === "launch" ? i.launch_cents : i.amount_cents;
    const paid = i.status === "paid" && i.paid_at;
    items.push({
      id: `iv:${i.id}`,
      module: "finance",
      title: paid ? `Invoice paid — ${money(cents)}` : `Checkout link sent — ${money(cents)}`,
      subtitle: i.description,
      at: paid ? i.paid_at! : i.sent_at,
      href: i.lead_id ? `/admin/leads/${i.lead_id}` : "/admin/finance/invoices",
    });
  }

  for (const p of posts as {
    id: string;
    platform: string;
    body: string;
    published_at: string | null;
  }[]) {
    if (!p.published_at) continue;
    items.push({
      id: `sp:${p.id}`,
      module: "social",
      title: `Published to ${p.platform}`,
      subtitle: p.body.slice(0, 120) || null,
      at: p.published_at,
      href: "/admin/marketing/social",
    });
  }

  for (const t of tasks as {
    id: string;
    title: string;
    done_at: string | null;
    lead_id: string | null;
    job_id: string | null;
  }[]) {
    if (!t.done_at) continue;
    items.push({
      id: `tk:${t.id}`,
      module: "task",
      title: `Done — ${t.title}`,
      subtitle: null,
      at: t.done_at,
      href: t.lead_id
        ? `/admin/leads/${t.lead_id}`
        : t.job_id
          ? `/admin/jobs/${t.job_id}`
          : "/admin/tasks",
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
