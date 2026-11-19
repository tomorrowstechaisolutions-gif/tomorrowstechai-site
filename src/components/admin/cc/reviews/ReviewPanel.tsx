import { Panel } from "@/components/admin/cc/Panel";
import { IconUsers } from "@/components/admin/cc/Icons";
import PendingButton from "@/components/admin/cc/PendingButton";
import { askForReviewAction, setReviewReceivedAction } from "@/app/admin/review-actions";
import { canAskForReview, type ReviewState } from "@/lib/reviews/email-content";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" }) : "Never";

/** Google review status for one client: ask, and record that they reviewed. */
export function ReviewPanel({
  customerId, email, state, notice, error,
}: {
  customerId: string;
  email: string | null;
  state: ReviewState;
  notice?: string;
  error?: string;
}) {
  const check = canAskForReview(email, state);
  const chip = state.receivedAt ? ["Reviewed", "t-ok"] : state.requestedAt ? ["Asked", "t-info"] : ["Not asked", "t-muted"];

  return (
    <Panel title="Google review" icon={<IconUsers size={15} />} className="cc-s4 cc-m4" bodyClass="tight">
      {notice ? <p className="cc-note" style={{ marginTop: 0 }}>{notice}</p> : null}
      {error ? <p className="cc-note" style={{ marginTop: 0, color: "#fecaca" }}>{error}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: "0.84rem", margin: "0 0 12px" }}>
        <span className="cc-faint">Status</span><span><span className={`cc-chip ${chip[1]}`}>{chip[0]}</span></span>
        <span className="cc-faint">Last asked</span><span>{when(state.requestedAt)}{state.requestCount > 1 ? ` (${state.requestCount} times)` : ""}</span>
        <span className="cc-faint">Reviewed</span><span>{state.receivedAt ? when(state.receivedAt) : "Not yet"}</span>
      </div>

      {!check.ok ? <p className="cc-faint" style={{ marginTop: 0 }}>{check.reason}</p> : (
        <p className="cc-faint" style={{ marginTop: 0 }}>
          Emails <strong>{email}</strong> a short note with your Google review link. Replies come to your inbox.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {check.ok ? (
          <form action={askForReviewAction}>
            <input type="hidden" name="customer_id" value={customerId} />
            <PendingButton className="cc-btn primary" busy="Sending…">
              {state.requestedAt ? "Ask again" : "Ask for a review"}
            </PendingButton>
          </form>
        ) : null}
        <form action={setReviewReceivedAction}>
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="received" value={state.receivedAt ? "0" : "1"} />
          <PendingButton className="cc-btn" busy="Saving…">
            {state.receivedAt ? "Unmark reviewed" : "Mark as reviewed"}
          </PendingButton>
        </form>
      </div>
    </Panel>
  );
}
