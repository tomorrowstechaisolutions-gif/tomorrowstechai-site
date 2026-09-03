import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { lastNDays, monthToDate } from "./period";
import { CLOSED_STATUSES } from "@/lib/supabase/types";

/**
 * Section 12 — Alert centre.
 *
 * Every alert is computed from live data at request time. Storing alerts would
 * mean storing alerts that stopped being true — the invoice gets paid, the
 * lead gets called, and the row sits there being wrong until something
 * remembers to delete it.
 */

export type AlertCategory =
  | "sales"
  | "projects"
  | "finance"
  | "website"
  | "social"
  | "system"
  | "ai";

export type AlertPriority = "critical" | "high" | "medium" | "low";

export type Alert = {
  id: string;
  category: AlertCategory;
  priority: AlertPriority;
  title: string;
  detail: string | null;
  href: string;
};

const RANK: Record<AlertPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const HOUR = 3600_000;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export async function loadAlerts(sb: SupabaseClient, limit = 8): Promise<Alert[]> {
  const now = Date.now();
  const { current } = monthToDate();
  const week = lastNDays(7);

  const [
    openLeads,
    jobs,
    openInvoices,
    accounts,
    pendingPosts,
    failedFollowups,
    proposals,
    monthRevenue,
    monthSpend,
    weekLeads,
  ] = await Promise.all([
    sb
      .from("leads")
      .select("id, created_at, last_contacted_at, next_followup_at")
      .not("lead_status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .eq("do_not_contact", false)
      .then((r) => unwrap(r, "open leads")),
    sb
      .from("jobs")
      .select("id, title, due_at, stage, updated_at")
      .is("completed_at", null)
      .neq("stage", "Complete")
      .then((r) => unwrap(r, "jobs")),
    sb
      .from("invoices")
      .select("id, sent_at, expires_at, lead_id")
      .eq("status", "sent")
      .then((r) => unwrap(r, "open invoices")),
    sb
      .from("social_accounts")
      .select("id, platform, status, connected, token_expires_at")
      .then((r) => unwrap(r, "social accounts")),
    sb
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_approval")
      .then((r) => r.count ?? 0),
    sb
      .from("lead_followups")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .then((r) => r.count ?? 0),
    sb
      .from("ai_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "proposed")
      .then((r) => r.count ?? 0),
    sb
      .from("revenue_events")
      .select("amount_cents")
      .gte("occurred_at", current.fromIso)
      .lt("occurred_at", current.toIso)
      .then((r) => unwrap(r, "revenue")),
    sb
      .from("campaign_spend")
      .select("spend_cents")
      .gte("date", week.fromDate)
      .lte("date", week.toDate)
      .then((r) => unwrap(r, "spend")),
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", week.fromIso)
      .then((r) => r.count ?? 0),
  ]);

  const alerts: Alert[] = [];

  /* ── Sales ─────────────────────────────────────────────────────── */
  type LeadRow = {
    id: string;
    created_at: string;
    last_contacted_at: string | null;
    next_followup_at: string | null;
  };
  const leads = openLeads as LeadRow[];

  const uncontacted = leads.filter(
    (l) => !l.last_contacted_at && now - new Date(l.created_at).getTime() > 24 * HOUR
  );
  if (uncontacted.length > 0) {
    alerts.push({
      id: "sales:uncontacted",
      category: "sales",
      priority: "high",
      title: `${plural(uncontacted.length, "lead")} awaiting first contact`,
      detail: "No one has reached out in over 24 hours.",
      href: "/admin/leads?status=New",
    });
  }

  const overdueFollowups = leads.filter(
    (l) => l.next_followup_at && new Date(l.next_followup_at).getTime() < now
  );
  if (overdueFollowups.length > 0) {
    alerts.push({
      id: "sales:followups",
      category: "sales",
      priority: "high",
      title: `${plural(overdueFollowups.length, "follow-up")} past due`,
      detail: "Scheduled follow-up dates have come and gone.",
      href: "/admin/leads",
    });
  }

  /* ── Projects ──────────────────────────────────────────────────── */
  type JobRow = {
    id: string;
    title: string;
    due_at: string | null;
    stage: string;
    updated_at: string;
  };
  const jobRows = jobs as JobRow[];

  const pastDue = jobRows.filter((j) => j.due_at && new Date(j.due_at).getTime() < now);
  if (pastDue.length > 0) {
    alerts.push({
      id: "projects:overdue",
      category: "projects",
      priority: "critical",
      title: `${plural(pastDue.length, "project")} past the promised date`,
      detail: pastDue
        .slice(0, 2)
        .map((j) => j.title)
        .join(", "),
      href: "/admin/jobs",
    });
  }

  const dueSoon = jobRows.filter((j) => {
    if (!j.due_at) return false;
    const t = new Date(j.due_at).getTime();
    return t >= now && t - now <= 3 * 24 * HOUR;
  });
  if (dueSoon.length > 0) {
    alerts.push({
      id: "projects:duesoon",
      category: "projects",
      priority: "high",
      title: `${plural(dueSoon.length, "project")} due within 3 days`,
      detail: null,
      href: "/admin/jobs",
    });
  }

  const stalled = jobRows.filter(
    (j) => j.stage === "On Hold" && now - new Date(j.updated_at).getTime() > 7 * 24 * HOUR
  );
  if (stalled.length > 0) {
    alerts.push({
      id: "projects:stalled",
      category: "projects",
      priority: "medium",
      title: `${plural(stalled.length, "project")} on hold for over a week`,
      detail: "Usually waiting on the client for content.",
      href: "/admin/jobs",
    });
  }

  /* ── Finance ───────────────────────────────────────────────────── */
  type InvRow = { id: string; sent_at: string; expires_at: string | null; lead_id: string | null };
  const invRows = openInvoices as InvRow[];

  const expired = invRows.filter(
    (i) => i.expires_at && new Date(i.expires_at).getTime() < now
  );
  if (expired.length > 0) {
    alerts.push({
      id: "finance:expired",
      category: "finance",
      priority: "critical",
      title: `${plural(expired.length, "checkout link")} expired`,
      detail: "The customer can no longer pay through that link.",
      href: "/admin/invoices",
    });
  }

  const stale = invRows.filter(
    (i) => now - new Date(i.sent_at).getTime() > 7 * 24 * HOUR && !expired.includes(i)
  );
  if (stale.length > 0) {
    alerts.push({
      id: "finance:stale",
      category: "finance",
      priority: "high",
      title: `${plural(stale.length, "invoice")} unpaid for over a week`,
      detail: null,
      href: "/admin/invoices",
    });
  }

  const spendCents = (monthSpend as { spend_cents: number }[]).reduce(
    (t, s) => t + s.spend_cents,
    0
  );
  const revenueCents = (monthRevenue as { amount_cents: number }[]).reduce(
    (t, r) => t + r.amount_cents,
    0
  );
  if (spendCents > 0 && revenueCents === 0) {
    alerts.push({
      id: "finance:nospendreturn",
      category: "finance",
      priority: "high",
      title: "Ads are spending with no revenue booked this month",
      detail: `$${(spendCents / 100).toLocaleString("en-US")} spent in the last 7 days.`,
      href: "/admin/marketing/campaigns/business-launch",
    });
  }

  /* ── Website ───────────────────────────────────────────────────── */
  if (spendCents > 0 && (weekLeads as number) === 0) {
    alerts.push({
      id: "website:noleads",
      category: "website",
      priority: "high",
      title: "No leads in 7 days while ads are running",
      detail: "Check the form, the pixel and the landing page.",
      href: "/admin/marketing/campaigns/business-launch",
    });
  }

  /* ── Social ────────────────────────────────────────────────────── */
  type AccountRow = {
    id: string;
    platform: string;
    status: string;
    connected: boolean;
    token_expires_at: string | null;
  };
  const accountRows = accounts as AccountRow[];

  const broken = accountRows.filter(
    (a) => a.status === "expired" || a.status === "error"
  );
  if (broken.length > 0) {
    alerts.push({
      id: "social:broken",
      category: "social",
      priority: "high",
      title: `${plural(broken.length, "social connection")} needs reconnecting`,
      detail: broken.map((a) => a.platform).join(", "),
      href: "/admin/system/integrations",
    });
  }

  const expiringSoon = accountRows.filter(
    (a) =>
      a.connected &&
      a.token_expires_at &&
      new Date(a.token_expires_at).getTime() - now < 7 * 24 * HOUR
  );
  if (expiringSoon.length > 0) {
    alerts.push({
      id: "social:expiring",
      category: "social",
      priority: "medium",
      title: `${plural(expiringSoon.length, "social token")} expires within a week`,
      detail: expiringSoon.map((a) => a.platform).join(", "),
      href: "/admin/system/integrations",
    });
  }

  if ((pendingPosts as number) > 0) {
    alerts.push({
      id: "social:approval",
      category: "social",
      priority: "medium",
      title: `${plural(pendingPosts as number, "post")} waiting for approval`,
      detail: "Nothing publishes until you approve it.",
      href: "/admin/marketing/social",
    });
  }

  /* ── System ────────────────────────────────────────────────────── */
  if ((failedFollowups as number) > 0) {
    alerts.push({
      id: "system:followupfail",
      category: "system",
      priority: "high",
      title: `${plural(failedFollowups as number, "automated follow-up")} failed to send`,
      detail: "The email provider rejected them.",
      href: "/admin/system/integrations",
    });
  }

  if (!process.env.CRON_SECRET) {
    alerts.push({
      id: "system:cron",
      category: "system",
      priority: "medium",
      title: "Automated follow-up is switched off",
      detail: "CRON_SECRET is not set, so the 24h and 72h emails never run.",
      href: "/admin/settings",
    });
  }

  /* ── AI ────────────────────────────────────────────────────────── */
  if ((proposals as number) > 0) {
    alerts.push({
      id: "ai:proposals",
      category: "ai",
      priority: "medium",
      title: `${plural(proposals as number, "AI proposal")} waiting for review`,
      detail: "Nothing has been carried out.",
      href: "/admin/ai/actions",
    });
  }

  return alerts.sort((a, b) => RANK[a.priority] - RANK[b.priority]).slice(0, limit);
}
