import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_STAGES, STAGE_BLURB, type JobStage } from "@/lib/jobs/config";
import {
  STARTER_ACTIVE_STAGES,
  STARTER_PACKAGE,
  STARTER_STAGE_BLURB,
  STARTER_STAGE_OWNER,
} from "@/lib/intake/config";
import type { Job } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** Module scope on purpose: reading the clock inside a component body trips
 *  react-hooks/purity, and these pages render per request anyway. */
function isOverdue(due: string | null): boolean {
  return due ? new Date(due).getTime() < Date.now() : false;
}

function daysLeft(due: string | null): { label: string; tone: string } {
  if (!due) return { label: "No date", tone: "muted" };
  const ms = new Date(due).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)}d over`, tone: "late" };
  if (days === 0) return { label: "Due today", tone: "late" };
  if (days <= 3) return { label: `${days}d left`, tone: "soon" };
  return { label: `${days}d left`, tone: "muted" };
}

export default async function JobsPage() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("jobs")
    .select("*")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);

  const jobs = (data ?? []) as Job[];
  const active = jobs.filter((j) => j.stage !== "Complete" && j.stage !== "Live");
  const overdue = active.filter((j) => isOverdue(j.due_at)).length;

  // Two products, two processes, two boards. The $399 Classic runs Intake ->
  // Handoff; the $149 Starter runs Purchased -> Live and has stages the other
  // does not need, because intake is a gate there. Rendering both through one
  // column list would silently hide every Starter job.
  const boards = [
    {
      key: "launch_package",
      label: "$399 Classic",
      columns: [...ACTIVE_STAGES, "On Hold"] as string[],
      blurb: STAGE_BLURB as Record<string, string>,
      terminal: "Complete",
      jobs: jobs.filter((j) => j.package !== STARTER_PACKAGE),
    },
    {
      key: STARTER_PACKAGE,
      label: "$149 Starter",
      columns: [...STARTER_ACTIVE_STAGES, "On Hold"] as string[],
      blurb: STARTER_STAGE_BLURB as Record<string, string>,
      terminal: "Live",
      jobs: jobs.filter((j) => j.package === STARTER_PACKAGE),
    },
  ].filter((b) => b.jobs.length > 0);

  const done = jobs.filter((j) => j.stage === "Complete" || j.stage === "Live");

  return (
    <>
      <header className="ad-head">
        <h1>Jobs</h1>
        <p>
          Every paid launch, and where it actually is. A job opens by itself the
          moment Stripe confirms payment — nothing gets delivered from memory.
        </p>
      </header>

      <div className="ad-filters">
        <span className="ad-muted" style={{ alignSelf: "center" }}>
          {active.length} in progress · {jobs.length - active.length} delivered
          {overdue > 0 ? ` · ${overdue} past the ${jobs[0]?.promised_days ?? 14}-day promise` : ""}
        </span>
      </div>

      {jobs.length === 0 ? (
        <section className="ad-panel">
          <p className="ad-empty">
            No jobs yet. The first one opens automatically when a lead pays
            their invoice — you don&rsquo;t create these by hand.
          </p>
        </section>
      ) : (
        boards.map((board) => (
          <section key={board.key} className="ad-board-group">
            {boards.length > 1 ? (
              <h2 className="ad-board-group-title">
                {board.label}
                <span className="ad-muted"> · {board.jobs.length}</span>
              </h2>
            ) : null}

            <div className="ad-board">
              {board.columns.map((stage) => {
                const inStage = board.jobs.filter((j) => j.stage === stage);
                const waitingOnClient =
                  board.key === STARTER_PACKAGE &&
                  STARTER_STAGE_OWNER[stage as keyof typeof STARTER_STAGE_OWNER] === "client";
                return (
                  <section key={stage} className="ad-board-col" data-waiting={waitingOnClient}>
                    <header className="ad-board-head">
                      <h2>{stage}</h2>
                      <span className="ad-board-count">{inStage.length}</span>
                    </header>
                    <p className="ad-board-blurb">{board.blurb[stage] ?? ""}</p>

                    {inStage.length === 0 ? (
                      <p className="ad-board-empty">—</p>
                    ) : (
                      inStage.map((job) => {
                        const due = daysLeft(job.due_at);
                        return (
                          <Link
                            key={job.id}
                            href={`/admin/jobs/${job.id}`}
                            className="ad-board-card"
                          >
                            <strong>{job.title}</strong>
                            <span className={`ad-tag s-${due.tone}`}>{due.label}</span>
                          </Link>
                        );
                      })
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        ))
      )}

      {done.length > 0 && (
        <section className="ad-panel" style={{ marginTop: "1.25rem" }}>
          <h2 className="ad-panel-title">Delivered</h2>
          <div className="ad-table-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Site</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Days</th>
                </tr>
              </thead>
              <tbody>
                {done.map((j) => {
                    const days =
                      j.completed_at
                        ? Math.round(
                            (new Date(j.completed_at).getTime() -
                              new Date(j.started_at).getTime()) /
                              86_400_000
                          )
                        : null;
                    return (
                      <tr key={j.id}>
                        <td>
                          <Link href={`/admin/jobs/${j.id}`} className="ad-link">
                            {j.title}
                          </Link>
                        </td>
                        <td>
                          {j.site_url ? (
                            <a
                              href={j.site_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ad-link"
                            >
                              {j.site_url.replace(/^https?:\/\//, "")}
                            </a>
                          ) : (
                            <span className="ad-muted">—</span>
                          )}
                        </td>
                        <td>{new Date(j.started_at).toLocaleDateString()}</td>
                        <td>
                          {j.completed_at
                            ? new Date(j.completed_at).toLocaleDateString()
                            : "—"}
                        </td>
                        <td>{days === null ? "—" : days}</td>
                      </tr>
                    );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
