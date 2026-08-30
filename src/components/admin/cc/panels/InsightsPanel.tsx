import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadInsights } from "@/lib/dashboard/insights";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { IconSpark } from "../Icons";

/** Section 2 (right) — the insight strip. */

export default async function InsightsPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("insights", () => loadInsights(supabase, 5));

  return (
    <Panel
      title="AI insights"
      icon={<IconSpark size={15} />}
      sub={result.ok && result.data.length > 0 ? `${result.data.length} live` : undefined}
      className={className}
      bodyClass="tight"
    >
      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : result.data.length === 0 ? (
        <EmptyState
          title="Not enough data yet"
          text="Insights appear once there is enough to draw one honestly — around five leads or one month of revenue in a service line. Nothing here is filler."
          icon={<IconSpark size={17} />}
        />
      ) : (
        <div className="cc-insights">
          {result.data.map((insight) => {
            const inner = (
              <>
                <span className="cc-insight-rail" />
                <div className="cc-insight-body">
                  <span className="cc-insight-kind">{insight.kind}</span>
                  <div className="cc-insight-title">{insight.title}</div>
                  <p className="cc-insight-text">{insight.body}</p>
                </div>
              </>
            );

            return insight.href ? (
              <Link key={insight.id} href={insight.href} className={`cc-insight k-${insight.kind}`}>
                {inner}
              </Link>
            ) : (
              <div key={insight.id} className={`cc-insight k-${insight.kind}`}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
