import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadHealth } from "@/lib/dashboard/health";
import { panel } from "@/lib/dashboard/panel";
import { Panel, ErrorState } from "../Panel";
import { IconServer } from "../Icons";

/** Section 13 — system status. Configured is not the same as working. */

export default async function HealthPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const session = await getAdminUser();

  const result = await panel("health", () =>
    loadHealth(supabase, { authenticated: Boolean(session) })
  );

  const degraded = result.ok
    ? result.data.services.filter((s) => s.state !== "operational").length
    : 0;

  return (
    <Panel
      title="System status"
      icon={<IconServer size={15} />}
      sub={
        result.ok
          ? degraded === 0
            ? "all operational"
            : `${degraded} need attention`
          : undefined
      }
      action={{ href: "/admin/settings", label: "Settings" }}
      className={className}
      bodyClass="flush"
    >
      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : (
        <div className="cc-health">
          {result.data.services.map((s) => (
            <div key={s.key} className="cc-health-row">
              <span className={`cc-dot s-${s.state}`} />
              <span className="cc-health-name">{s.label}</span>
              <span className="cc-health-detail" title={s.detail}>
                {s.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
