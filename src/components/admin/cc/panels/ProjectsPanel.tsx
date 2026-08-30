import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadProjects, STATUS_TONE } from "@/lib/dashboard/projects";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { IconBriefcase } from "../Icons";
import { due, money, pct } from "../format";

/** Section 5 — Active projects. */

export default async function ProjectsPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("projects", () => loadProjects(supabase, 8));

  return (
    <Panel
      title="Active projects"
      icon={<IconBriefcase size={15} />}
      sub={
        result.ok
          ? result.data.atRisk > 0
            ? `${result.data.total} running · ${result.data.atRisk} at risk`
            : `${result.data.total} running`
          : undefined
      }
      action={{ href: "/admin/jobs", label: "All projects" }}
      className={className}
      bodyClass="flush"
    >
      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : result.data.rows.length === 0 ? (
        <EmptyState
          title="No projects underway"
          text="A project opens automatically when a sale is recorded, and you can open one by hand from Quick Add. Each starts at Intake with the standard delivery checklist."
          cta={{ href: "/admin/jobs", label: "Open the project board" }}
          icon={<IconBriefcase size={17} />}
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Client / project</th>
                <th>Type</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Due</th>
                <th className="num">Value</th>
                <th>Owner</th>
                <th>Next milestone</th>
              </tr>
            </thead>
            <tbody>
              {result.data.rows.map((p) => {
                const tone = STATUS_TONE[p.status];
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={p.href} className="cc-strong cc-link">
                        {p.client ?? p.title}
                      </Link>
                      {p.client ? (
                        <div className="cc-faint" style={{ fontSize: "0.71rem" }}>{p.title}</div>
                      ) : null}
                    </td>
                    <td>{p.typeLabel}</td>
                    <td>
                      {p.progress === null ? (
                        <span className="cc-faint">no checklist</span>
                      ) : (
                        <div className="cc-prog">
                          <span className="cc-prog-track">
                            <span
                              className={`cc-prog-fill ${
                                p.status === "At Risk" ? "t-risk" : p.status === "Waiting on Client" ? "t-warn" : ""
                              }`}
                              style={{ width: `${Math.round(p.progress * 100)}%` }}
                            />
                          </span>
                          <span className="cc-prog-n">{pct(p.progress, 0)}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`cc-chip ${
                          tone === "risk" ? "t-risk" : tone === "warn" ? "t-warn" : tone === "ok" ? "t-info" : "t-muted"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className={p.status === "At Risk" ? "" : undefined}>
                      <span style={p.status === "At Risk" ? { color: "var(--cc-risk)" } : undefined}>
                        {due(p.dueAt)}
                      </span>
                    </td>
                    <td className="num">{p.valueCents > 0 ? money(p.valueCents) : "—"}</td>
                    <td>{p.owner ?? "—"}</td>
                    <td>{p.nextMilestone ?? `${p.stage} stage`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
