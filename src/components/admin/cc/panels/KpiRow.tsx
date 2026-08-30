import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadKpis, type Kpi } from "@/lib/dashboard/kpis";
import { panel } from "@/lib/dashboard/panel";
import { count, deltaParts, moneyCompact } from "../format";
import {
  IconArrowDown,
  IconArrowUp,
  IconBriefcase,
  IconDollar,
  IconFunnel,
  IconRepeat,
  IconUsers,
  IconChart,
} from "../Icons";
import { ErrorState } from "../Panel";

/** Section 1 — the six numbers that answer "how is my business doing". */

const ICONS = {
  revenue: IconDollar,
  leads: IconFunnel,
  pipeline: IconChart,
  clients: IconUsers,
  projects: IconBriefcase,
  mrr: IconRepeat,
} as const;

export default async function KpiRow() {
  const supabase = await createSupabaseServerClient();
  const result = await panel("kpis", () => loadKpis(supabase));

  if (!result.ok) {
    return (
      <div className="cc-panel" style={{ marginBottom: 16 }}>
        <ErrorState message={result.error} />
      </div>
    );
  }

  return (
    <div className="cc-kpis">
      {result.data.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = ICONS[kpi.key];
  const delta = deltaParts(kpi.delta);

  return (
    <Link href={kpi.href} className="cc-kpi">
      <div className="cc-kpi-top">
        <span className="cc-kpi-icon">
          <Icon size={14} />
        </span>
        <span className="cc-kpi-label">{kpi.label}</span>
      </div>

      <span className="cc-kpi-value">
        {kpi.format === "money" ? moneyCompact(kpi.value) : count(kpi.value)}
      </span>

      <div className="cc-kpi-foot">
        {delta ? (
          <span className={`cc-delta ${delta.tone}`}>
            {delta.tone === "up" ? (
              <IconArrowUp size={11} />
            ) : delta.tone === "down" ? (
              <IconArrowDown size={11} />
            ) : null}
            {delta.text}
          </span>
        ) : null}
        <span>{delta ? kpi.deltaLabel : kpi.hint}</span>
      </div>
    </Link>
  );
}

export function KpiRowSkeleton() {
  return (
    <div className="cc-kpis" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="cc-kpi">
          <div className="cc-skel cc-skel-line w-60" style={{ height: 10 }} />
          <div className="cc-skel" style={{ height: 26, width: "70%" }} />
          <div className="cc-skel cc-skel-line w-80" style={{ height: 9 }} />
        </div>
      ))}
    </div>
  );
}
