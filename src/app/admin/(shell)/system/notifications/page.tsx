import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAlerts, type Alert } from "@/lib/dashboard/alerts";
import { NOTIFICATIONS, type NotificationDef } from "@/lib/notifications/owner";
import { setNotificationAction } from "@/app/admin/notification-actions";
import { Panel, EmptyState, ErrorState } from "@/components/admin/cc/Panel";
import { IconAlert, IconBell, IconClock, IconMail } from "@/components/admin/cc/Icons";
import fin from "@/components/admin/cc/finance/finance.module.css";
import styles from "@/components/admin/cc/finance/notifications.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

/**
 * Notifications. Where alerts go: the emails the site sends John (each with
 * an on/off switch and a record of what went out) and the in-app alerts in
 * the bell, which are worked out live from the data.
 */

type LogRow = { key: string; status: "sent" | "skipped" | "failed"; summary: string | null; created_at: string };
const GROUPS: NotificationDef["group"][] = ["Leads", "Sales", "Money", "Clients"];
const PRIORITY_TONE: Record<string, string> = { critical: "t-risk", high: "t-warn", medium: "t-info", low: "t-muted" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

/** Start of the 30-day window. Worked out per request, outside render. */
function thirtyDaysAgo(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString();
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const db = supabaseAdmin();
  const since = thirtyDaysAgo();

  let alerts: Alert[] = [];
  let off = new Set<string>();
  let log: LogRow[] = [];
  let error: string | null = null;
  try {
    const [a, prefs, l] = await Promise.all([
      loadAlerts(await createSupabaseServerClient(), 50),
      db.from("notification_preferences").select("key, email_enabled"),
      db.from("notification_log").select("key, status, summary, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    ]);
    if (prefs.error) throw new Error(prefs.error.message);
    alerts = a;
    off = new Set((prefs.data ?? []).filter((p) => !p.email_enabled).map((p) => p.key as string));
    log = (l.data ?? []) as LogRow[];
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Notifications could not be loaded.";
  }

  const to = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
  const label = (key: string) => NOTIFICATIONS.find((n) => n.key === key)?.label ?? key;
  const stats = (key: string) => {
    const rows = log.filter((r) => r.key === key);
    return { sent: rows.filter((r) => r.status === "sent").length, last: rows.find((r) => r.status === "sent")?.created_at ?? null };
  };
  const kpis = [
    { label: "Emails sent", value: log.filter((r) => r.status === "sent").length, foot: "To you, last 30 days" },
    { label: "Switched off", value: off.size, foot: off.size ? "Kinds you won't be emailed" : "Every email is on" },
    { label: "Failed", value: log.filter((r) => r.status === "failed").length, foot: "Couldn't be delivered, last 30 days", warn: log.some((r) => r.status === "failed") },
    { label: "In-app alerts now", value: alerts.length, foot: alerts.length ? "Firing in the bell" : "Nothing needs you", warn: alerts.some((a) => a.priority === "critical") },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Notifications</h1>
          <p>What the site emails you, what shows in the bell, and the switches for each.</p>
        </div>
      </div>
      {typeof params.notice === "string" ? <div className={fin.flashOk}>{params.notice}</div> : null}
      {typeof params.error === "string" ? <div className={fin.flashErr}>{params.error}</div> : null}

      {error ? <ErrorState message={error} /> : (
        <>
          <div className="cc-kpis">
            {kpis.map((k) => (
              <div key={k.label} className="cc-kpi">
                <div className="cc-kpi-top"><span className="cc-kpi-label">{k.label}</span></div>
                <span className="cc-kpi-value" style={k.warn ? { color: "#FBBF24" } : undefined}>{k.value}</span>
                <div className="cc-kpi-foot"><span>{k.foot}</span></div>
              </div>
            ))}
          </div>

          <div className="cc-board" style={{ marginTop: 16 }}>
            <Panel title="Emails to you" sub={`Sent to ${to} through Resend`} icon={<IconMail size={15} />} className="cc-s8">
              {GROUPS.map((g) => (
                <div key={g} className={styles.group}>
                  <h3 className={styles.groupHead}>{g}</h3>
                  {NOTIFICATIONS.filter((n) => n.group === g).map((n) => {
                    const on = !off.has(n.key);
                    const s = stats(n.key);
                    return (
                      <div key={n.key} className={`${styles.row} ${on ? "" : styles.offRow}`}>
                        <div>
                          <b>{n.label}</b>
                          <small>{n.when}</small>
                          <small className={styles.meta}>{s.sent ? `${s.sent} sent in 30 days · last ${when(s.last!)}` : "None sent in 30 days"}</small>
                        </div>
                        <form action={setNotificationAction}>
                          <input type="hidden" name="key" value={n.key} />
                          <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                          <button className={`${styles.toggle} ${on ? styles.on : ""}`} aria-pressed={on} aria-label={`${n.label} email ${on ? "on, turn off" : "off, turn on"}`}>
                            <span className={styles.knob} />{on ? "On" : "Off"}
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className={fin.note}>
                Change where these land with <code>CONTACT_TO_EMAIL</code> in Vercel. A switched-off email is still recorded below as &ldquo;skipped&rdquo;, so nothing disappears silently. One exception always sends: a Central Texas AI form that couldn&apos;t be saved, because the email is then the only copy of that lead.
              </p>
            </Panel>

            <Panel title="In the bell right now" sub={`${alerts.length} firing`} icon={<IconBell size={15} />} className="cc-s4">
              {alerts.length ? (
                <div className={fin.rows}>
                  {alerts.map((a) => (
                    <Link key={a.id} href={a.href} className={fin.row}>
                      <div><b>{a.title}</b>{a.detail ? <small>{a.detail}</small> : null}</div>
                      <span className={`cc-chip ${PRIORITY_TONE[a.priority] ?? "t-muted"}`}>{a.priority}</span>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState title="All clear" text="In-app alerts appear here and in the bell when something needs you." icon={<IconBell size={17} />} />}
              <p className={fin.note}>
                The bell checks your data live: leads waiting on contact or a follow-up, projects overdue or due soon, unpaid and expired invoices, ad spend with no leads or revenue, broken or expiring social accounts, posts awaiting approval, failed follow-up emails, missing job settings, and AI proposals to review. An alert clears itself when the underlying issue is fixed.
              </p>
            </Panel>

            <Panel title="Recent notifications" sub="Last 30 days" icon={<IconClock size={15} />} className="cc-s8">
              {log.length ? (
                <div className="cc-scroll">
                  <table className="cc-table dense">
                    <thead><tr><th>When</th><th>Notification</th><th>About</th><th>Result</th></tr></thead>
                    <tbody>
                      {log.slice(0, 60).map((r, i) => (
                        <tr key={i}>
                          <td className="cc-dim">{when(r.created_at)}</td>
                          <td>{label(r.key)}</td>
                          <td className="cc-dim">{r.summary ?? "—"}</td>
                          <td><span className={`cc-chip ${r.status === "sent" ? "t-ok" : r.status === "failed" ? "t-risk" : "t-muted"}`}>{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState title="Nothing recorded yet" text="Every email the site sends you is listed here from now on: sent, skipped because it's switched off, or failed." icon={<IconClock size={17} />} />}
            </Panel>

            <Panel title="Not covered yet" icon={<IconAlert size={15} />} className="cc-s4">
              <p className={fin.note} style={{ marginTop: 0 }}>
                These forms save to the admin but don&apos;t email you yet: website package intake, AI operator intake, client intake and sticker orders. Check them under Leads and Client intake.<br /><br />
                Scheduled jobs (syncs, social posting, follow-ups) report problems through the bell and the Integrations page, not by email.
              </p>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
