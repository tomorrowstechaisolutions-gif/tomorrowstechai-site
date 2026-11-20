import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { summarizeDayAction } from "@/app/admin/crew-actions";
import PendingButton from "@/components/admin/cc/PendingButton";
import styles from "@/components/admin/cc/tess/tess.module.css";
import { chatArchive, type ArchiveDay } from "@/lib/crew/chat";
import { chatSummaries, type Summaries } from "@/lib/crew/summaries";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tess archive" };
export const dynamic = "force-dynamic";

/**
 * Every conversation the signed-in admin has had with Tess, by day, with a
 * summary of each day and, above them, of each finished week and month.
 * The summaries are written on the crew's clock once a day, week or month
 * is over; a day can also be summarised here on request.
 */

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
const monthName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

export default async function TessArchivePage() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  let days: ArchiveDay[] = [];
  let summaries: Summaries = { days: [], weeks: [], months: [], ready: false };
  let failure: string | null = null;
  try {
    const sb = supabaseAdmin();
    [days, summaries] = await Promise.all([chatArchive(sb, session.user.id), chatSummaries(sb, session.user.id)]);
  } catch (err) {
    console.error("[tess] could not load the archive:", err);
    failure = err instanceof Error ? err.message : "unknown error";
  }

  return (
    <div className={`${styles.root} ${styles.archive}`}>
      <div className={styles.archiveHead}>
        <span className={styles.name}>Tess · Archive</span>
        <span className={styles.chip}>
          Days <b>{days.length}</b>
        </span>
        <span className={styles.spacer} />
        <Link className={styles.btn} href="/admin/ai">
          Back to Tess
        </Link>
      </div>

      <div className={styles.archiveBody}>
        <p className={styles.archiveNote}>
          Your conversations with Tess, newest day first. A day is summarised once it is over, a week on the following Monday, and a month on the first of the next one.
        </p>
        {!summaries.ready ? (
          <p className={styles.problem}>Summaries are switched off until their table is created. Run 20261120030000_tess_chat_summaries.sql in Supabase.</p>
        ) : null}
        {summaries.months.length ? (
          <section className={styles.rollup}>
            <h2>Months</h2>
            {summaries.months.map((m) => (
              <div key={m.id} className={styles.rollupItem}>
                <b>{monthName(m.period_start)}</b>
                <p>{m.summary}</p>
              </div>
            ))}
          </section>
        ) : null}
        {summaries.weeks.length ? (
          <section className={styles.rollup}>
            <h2>Weeks</h2>
            {summaries.weeks.map((w) => (
              <div key={w.id} className={styles.rollupItem}>
                <b>Week of {shortDate(w.period_start)}</b>
                <p>{w.summary}</p>
              </div>
            ))}
          </section>
        ) : null}
        {failure ? <p className={styles.problem}>The archive could not be loaded: {failure}</p> : null}
        {!failure && !days.length ? <p className={styles.archiveNote}>Nothing here yet. It fills in as you talk with her.</p> : null}
        {days.map((day, i) => (
          <details key={day.date} className={styles.day} open={i === 0}>
            <summary>
              <b>{longDate(day.date)}</b>
              <span>
                {day.conversations} {day.conversations === 1 ? "conversation" : "conversations"} · {day.lines.length} lines
              </span>
            </summary>
            {(() => {
              const summary = summaries.days.find((s) => s.period_start === day.date);
              if (summary) return <p className={styles.daySummary}>{summary.summary}</p>;
              if (!summaries.ready) return null;
              return (
                <form action={summarizeDayAction} className={styles.daySummaryForm}>
                  <input type="hidden" name="date" value={day.date} />
                  <PendingButton className={styles.btn} busy="Summarising…">
                    Summarise this day now
                  </PendingButton>
                </form>
              );
            })()}
            {day.lines.map((line, n) => (
              <p key={n} className={line.role === "john" ? styles.lineJohn : styles.lineTess}>
                <i>{line.role === "john" ? "You" : "Tess"}</i>
                {line.text}
              </p>
            ))}
          </details>
        ))}
      </div>
    </div>
  );
}
