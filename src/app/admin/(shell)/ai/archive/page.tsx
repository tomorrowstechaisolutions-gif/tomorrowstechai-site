import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/cc/tess/tess.module.css";
import { chatArchive, type ArchiveDay } from "@/lib/crew/chat";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tess archive" };
export const dynamic = "force-dynamic";

/**
 * Every conversation the signed-in admin has had with Tess, by day. Read
 * straight from the saved conversations; nothing here is summarised yet.
 */

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });

export default async function TessArchivePage() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  let days: ArchiveDay[] = [];
  let failure: string | null = null;
  try {
    days = await chatArchive(supabaseAdmin(), session.user.id);
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
        <p className={styles.archiveNote}>Your conversations with Tess, newest day first. Summaries of each day, week and month are not built yet.</p>
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
