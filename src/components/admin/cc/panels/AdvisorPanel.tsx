import { createSupabaseServerClient } from "@/lib/supabase/server";
import { panel, unwrap } from "@/lib/dashboard/panel";
import { reviewAiAction } from "@/app/admin/dashboard-actions";
import type { AiAction } from "@/lib/supabase/types";
import AskAdvisor from "../AskAdvisor";
import { ErrorState } from "../Panel";
import { ago } from "../format";
import { IconSpark } from "../Icons";

/**
 * Section 2 — the AI Business Advisor, and the review desk underneath it.
 *
 * The two belong on one card because they are one idea: the advisor may
 * propose, and a person decides. Splitting them would make the queue easy to
 * ignore, which is the only way a propose-and-approve system fails.
 */

export default async function AdvisorPanel({
  initialQuestion,
  className = "",
}: {
  initialQuestion?: string;
  className?: string;
}) {
  const supabase = await createSupabaseServerClient();

  const pending = await panel("ai:pending", async () =>
    unwrap(
      await supabase
        .from("ai_actions")
        .select("id, kind, title, summary, risk, rationale, created_at")
        .eq("status", "proposed")
        .order("created_at", { ascending: false })
        .limit(4),
      "proposed actions"
    ) as Pick<AiAction, "id" | "kind" | "title" | "summary" | "risk" | "rationale" | "created_at">[]
  );

  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <section className={`cc-panel cc-advisor ${className}`}>
      <div className="cc-panel-head">
        <span className="cc-advisor-mark">
          <IconSpark size={16} />
        </span>
        <div>
          <h2>AI Business Advisor</h2>
          <div className="cc-sub">Your business analyzed continuously.</div>
        </div>
        {!aiConfigured ? (
          <span className="cc-chip t-warn" style={{ marginLeft: "auto" }}>
            Key not set
          </span>
        ) : null}
      </div>

      <div className="cc-panel-body">
        {aiConfigured ? (
          <AskAdvisor initialQuestion={initialQuestion} />
        ) : (
          <>
            <AskAdvisor initialQuestion={undefined} />
            <p className="cc-note">
              <b>ANTHROPIC_API_KEY is not set on this deployment.</b> The advisor
              will answer the moment it is. Every other panel on this dashboard
              is reading live data and works without it.
            </p>
          </>
        )}

        {!pending.ok ? (
          <ErrorState message={pending.error} />
        ) : pending.data.length > 0 ? (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--cc-line-soft)" }}>
            <div className="cc-pop-head" style={{ padding: "0 0 8px" }}>
              Waiting for your approval · {pending.data.length}
            </div>

            <div className="cc-insights">
              {pending.data.map((action) => (
                <div key={action.id} className="cc-insight k-action">
                  <span className="cc-insight-rail" />
                  <div className="cc-insight-body">
                    <span className="cc-insight-kind">
                      {action.kind.replace(/_/g, " ")} · {action.risk} risk · {ago(action.created_at)}
                    </span>
                    <div className="cc-insight-title">{action.title}</div>
                    {action.summary ? <p className="cc-insight-text">{action.summary}</p> : null}
                    {action.rationale ? (
                      <p className="cc-insight-text" style={{ opacity: 0.75 }}>
                        Because: {action.rationale}
                      </p>
                    ) : null}

                    <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
                      <form action={reviewAiAction}>
                        <input type="hidden" name="action_id" value={action.id} />
                        <input type="hidden" name="decision" value="approved" />
                        <button type="submit" className="cc-btn primary" style={{ padding: "5px 12px", fontSize: "0.75rem" }}>
                          Approve
                        </button>
                      </form>
                      <form action={reviewAiAction}>
                        <input type="hidden" name="action_id" value={action.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <button type="submit" className="cc-btn ghost" style={{ padding: "5px 12px", fontSize: "0.75rem" }}>
                          Reject
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="cc-note">
              Approving records your decision. It does not carry the action out —
              each kind gets a deliberate executor, so nothing consequential can
              happen as a side effect of a click here.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
