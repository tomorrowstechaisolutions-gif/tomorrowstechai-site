import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadAlerts } from "@/lib/dashboard/alerts";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { IconBell, IconCheck } from "../Icons";

/** Section 12 — the alert centre. Every line is computed live. */

export default async function AlertsPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("alerts", () => loadAlerts(supabase, 8));

  const critical = result.ok
    ? result.data.filter((a) => a.priority === "critical").length
    : 0;

  return (
    <Panel
      title="Alerts"
      icon={<IconBell size={15} />}
      sub={
        result.ok
          ? result.data.length === 0
            ? "all clear"
            : critical > 0
              ? `${critical} critical`
              : `${result.data.length} open`
          : undefined
      }
      className={className}
      bodyClass="flush"
    >
      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : result.data.length === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          text="Every open lead has been contacted, no project is past its date, no invoice is overdue and every configured service is answering."
          icon={<IconCheck size={17} />}
        />
      ) : (
        <div className="cc-alerts">
          {result.data.map((alert) => (
            <Link key={alert.id} href={alert.href} className={`cc-alert p-${alert.priority}`}>
              <span className="cc-alert-pri" />
              <span className="cc-alert-main">
                <span className="cc-alert-title">{alert.title}</span>
                {alert.detail ? <span className="cc-alert-detail">{alert.detail}</span> : null}
              </span>
              <span className="cc-alert-cat">{alert.category}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
