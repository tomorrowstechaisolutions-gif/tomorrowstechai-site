import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLeadsNeedingAttention, loadPipeline } from "@/lib/dashboard/sales";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { IconFunnel, IconPhone } from "../Icons";
import { ago, count, money, pct } from "../format";

/** Sections 3 — the pipeline, and the leads that need a human today. */

export default async function PipelinePanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();

  const [pipeline, attention] = await Promise.all([
    panel("pipeline", () => loadPipeline(supabase)),
    panel("attention", () => loadLeadsNeedingAttention(supabase, 5)),
  ]);

  return (
    <Panel
      title="Sales pipeline"
      icon={<IconFunnel size={15} />}
      sub={
        pipeline.ok && pipeline.data.winRate !== null
          ? `${pct(pipeline.data.winRate, 0)} win rate`
          : undefined
      }
      action={{ href: "/admin/leads", label: "View CRM" }}
      className={className}
      bodyClass="tight"
    >
      {!pipeline.ok ? (
        <ErrorState message={pipeline.error} />
      ) : pipeline.data.totalInFunnel === 0 ? (
        <EmptyState
          title="Nothing in the pipeline yet"
          text="Leads land here the moment a form is submitted, and every stage below fills itself from the CRM."
          cta={{ href: "/admin/marketing/campaigns/business-launch", label: "Open the campaign" }}
          icon={<IconFunnel size={17} />}
        />
      ) : (
        <>
          <div className="cc-pipe">
            {pipeline.data.stages.map((stage) => (
              <Link key={stage.key} href={stage.href} className="cc-pipe-row">
                <span
                  className="cc-pipe-fill"
                  style={{ width: `${Math.max((stage.sharePct ?? 0) * 100, stage.count > 0 ? 8 : 0)}%` }}
                />
                <span className="cc-pipe-n">{stage.count}</span>
                <span className="cc-pipe-label">{stage.label}</span>
                <span className="cc-pipe-val">
                  {stage.valueCents > 0 ? money(stage.valueCents) : pct(stage.sharePct, 0)}
                </span>
              </Link>
            ))}
          </div>

          <p className="cc-note" style={{ marginTop: 10 }}>
            {money(pipeline.data.totalValueCents)} in open checkout links.
            {pipeline.data.lost > 0 ? ` ${count(pipeline.data.lost)} lost` : ""}
            {pipeline.data.parked > 0 ? `, ${count(pipeline.data.parked)} parked` : ""}
            {pipeline.data.lost > 0 || pipeline.data.parked > 0 ? "." : ""}
          </p>
        </>
      )}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--cc-line-soft)" }}>
        <div className="cc-panel-head" style={{ padding: 0, border: 0, marginBottom: 10 }}>
          <IconPhone size={14} />
          <h2>Leads needing attention</h2>
        </div>

        {!attention.ok ? (
          <ErrorState message={attention.error} />
        ) : attention.data.length === 0 ? (
          <p className="cc-note" style={{ marginTop: 0 }}>
            Nobody is waiting. Every open lead has been contacted in the last 48
            hours and no follow-up is past its date.
          </p>
        ) : (
          <div className="cc-scroll">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Interested in</th>
                  <th>Source</th>
                  <th className="num">Value</th>
                  <th>Last contact</th>
                  <th>Next action</th>
                </tr>
              </thead>
              <tbody>
                {attention.data.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link href={`/admin/leads/${lead.id}`} className="cc-strong cc-link">
                        {lead.business || lead.name}
                      </Link>
                      {lead.business ? (
                        <div className="cc-faint" style={{ fontSize: "0.71rem" }}>{lead.name}</div>
                      ) : null}
                    </td>
                    <td>{lead.services.length > 0 ? lead.services.slice(0, 2).join(", ") : "—"}</td>
                    <td>{lead.source}</td>
                    <td className="num">{lead.valueCents ? money(lead.valueCents) : "—"}</td>
                    <td>{lead.lastContactedAt ? ago(lead.lastContactedAt) : "never"}</td>
                    <td>
                      <span
                        className={`cc-chip ${
                          lead.reason === "never_contacted"
                            ? "t-risk"
                            : lead.reason === "followup_due"
                              ? "t-warn"
                              : "t-muted"
                        }`}
                      >
                        {lead.nextAction}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}
