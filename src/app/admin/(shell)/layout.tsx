import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { signOutAction } from "../actions";
import AdminShell from "@/components/admin/cc/AdminShell";
import { loadAlerts } from "@/lib/dashboard/alerts";
import { panel } from "@/lib/dashboard/panel";
import { CLOSED_STATUSES } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * Counters for the sidebar badges.
 *
 * Four head-only count queries — no rows come back. This runs on every admin
 * page, so it stays cheap deliberately; anything that needs real rows belongs
 * on the page that shows them.
 */
async function loadBadges() {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const nowIso = now.toISOString();
  // Today, Chicago — so "due today" counts all of today and nothing else.
  const chicagoToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
  }).format(now);
  const startOfToday = new Date(`${chicagoToday}T00:00:00-05:00`).toISOString();
  const endOfToday = new Date(`${chicagoToday}T23:59:59-05:00`).toISOString();
  const openFilter = `(${CLOSED_STATUSES.join(",")})`;

  const [followupsDue, uncontacted, atRisk, proposals, tasksDue, eventsToday] =
    await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("lead_status", "in", openFilter)
      .eq("do_not_contact", false)
      .lt("next_followup_at", nowIso)
      .then((r) => r.count ?? 0),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("lead_status", "in", openFilter)
      .eq("do_not_contact", false)
      .is("last_contacted_at", null)
      .lt("created_at", dayAgo)
      .then((r) => r.count ?? 0),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("completed_at", null)
      .neq("stage", "Complete")
      .lt("due_at", nowIso)
      .then((r) => r.count ?? 0),
    supabase
      .from("ai_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "proposed")
      .then((r) => r.count ?? 0),
    // Overdue plus due today. Not "open tasks" — a badge that reads 60
    // because sixty things exist is a badge nobody looks at twice.
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_template", false)
      .not("status", "in", "(completed,canceled)")
      .lt("due_at", endOfToday)
      .then((r) => r.count ?? 0),
    // Events on the calendar's own table today. Deliberately not the full
    // aggregated count: this runs on every admin page, and nine queries for
    // a sidebar number is not a trade worth making.
    supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(completed,canceled)")
      .gte("start_at", startOfToday)
      .lt("start_at", endOfToday)
      .then((r) => r.count ?? 0),
  ]);

  return {
    leadsNeedingAttention: followupsDue + uncontacted,
    projectsAtRisk: atRisk,
    aiProposals: proposals,
    tasksNeedingAttention: tasksDue,
    eventsToday,
  };
}

/** The bell contents. Streamed, so it never delays the page around it. */
async function AlertsPopover() {
  const supabase = await createSupabaseServerClient();
  const result = await panel("alerts:bell", () => loadAlerts(supabase, 6));

  if (!result.ok) {
    return <p className="cc-error">Alerts are unavailable right now.</p>;
  }
  if (result.data.length === 0) {
    return (
      <p style={{ padding: "10px 12px 14px", fontSize: "0.78rem", color: "var(--cc-faint)" }}>
        Nothing needs attention. Every lead has been contacted, no project is
        past its date, and no invoice is overdue.
      </p>
    );
  }

  return (
    <>
      {result.data.map((a) => (
        <Link key={a.id} href={a.href} className="cc-pop-item">
          <span className={`cc-dot ${a.priority === "critical" || a.priority === "high" ? "s-error" : "s-warning"}`} />
          <span>
            {a.title}
            {a.detail ? (
              <>
                <br />
                <span className="cc-faint" style={{ fontSize: "0.7rem" }}>{a.detail}</span>
              </>
            ) : null}
          </span>
        </Link>
      ))}
      <div className="cc-pop-sep" />
      <Link href="/admin" className="cc-pop-item">
        <span className="cc-link">See the full alert centre</span>
      </Link>
    </>
  );
}

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!supabaseConfigured()) {
    return (
      <div className="ad-login">
        <div className="ad-login-card">
          <h1 className="ad-login-title">Admin Center is not configured</h1>
          <p className="ad-login-sub">
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>, then redeploy.
          </p>
        </div>
      </div>
    );
  }

  const session = await getAdminUser();

  // Signed in but not on the admin list. RLS already returns nothing to this
  // account; this just says so out loud instead of showing empty screens.
  if (!session) redirect("/admin/login?denied=1");

  const badges = await loadBadges().catch(() => ({
    leadsNeedingAttention: 0,
    projectsAtRisk: 0,
    aiProposals: 0,
    tasksNeedingAttention: 0,
    eventsToday: 0,
  }));

  const alertCount =
    badges.leadsNeedingAttention + badges.projectsAtRisk + badges.aiProposals;

  return (
    <AdminShell
      user={{ email: session.admin.email, name: session.admin.full_name ?? null }}
      badges={badges}
      alertCount={alertCount}
      alerts={
        <Suspense
          fallback={
            <div className="cc-skel-stack">
              <div className="cc-skel cc-skel-line w-80" />
              <div className="cc-skel cc-skel-line w-100" />
              <div className="cc-skel cc-skel-line w-60" />
            </div>
          }
        >
          <AlertsPopover />
        </Suspense>
      }
      signOut={signOutAction}
    >
      {children}
    </AdminShell>
  );
}
