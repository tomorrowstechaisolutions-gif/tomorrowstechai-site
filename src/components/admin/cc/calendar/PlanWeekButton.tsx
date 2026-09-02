"use client";

import { useState } from "react";
import { IconSpark, IconX } from "../Icons";

type Proposal = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  reason: string;
};

/**
 * AI Plan My Week.
 *
 * The model proposes; nothing moves until a person presses Apply on that
 * specific line. There is deliberately no "apply everything" — a plan that
 * rearranges a week in one click is exactly the silent rescheduling this is
 * supposed to prevent.
 */
export default function PlanWeekButton({
  weekStart,
  applyAction,
}: {
  weekStart: string;
  applyAction: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [headline, setHeadline] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string[]>([]);

  const run = async () => {
    setOpen(true);
    setBusy(true);
    setError(null);
    setProposals([]);
    setHeadline(null);
    setApplied([]);
    try {
      const response = await fetch("/api/admin/calendar/plan-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string; headline?: string; proposals?: Proposal[];
      };
      if (!response.ok) setError(body.error ?? "That did not come back. Try again in a moment.");
      else {
        setHeadline(body.headline ?? null);
        setProposals(body.proposals ?? []);
      }
    } catch {
      setError("Could not reach the planner. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const when = (proposal: Proposal) => {
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC", weekday: "long",
    }).format(new Date(`${proposal.date}T12:00:00Z`));
    return `${day} ${proposal.startTime}${proposal.endTime ? ` – ${proposal.endTime}` : ""}`;
  };

  return (
    <>
      <button type="button" className="tk-ai" onClick={run} disabled={busy}>
        <IconSpark size={14} />
        {busy ? "Reading your week…" : "AI Plan My Week"}
      </button>

      {open ? (
        <div className="cal-plan" role="dialog" aria-label="Proposed plan for the week">
          <div className="tk-ai-head">
            <IconSpark size={14} />
            <b>Proposed plan</b>
            <button type="button" className="cc-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              <IconX size={13} />
            </button>
          </div>

          {busy ? <p className="cc-note">Working through the week…</p> : null}
          {error ? <p className="tk-ai-error">{error}</p> : null}
          {headline ? <p className="tk-ai-headline">{headline}</p> : null}

          {proposals.length > 0 ? (
            <>
              <ol className="cal-plan-list">
                {proposals.map((proposal, index) => (
                  <li key={proposal.id} className={applied.includes(proposal.id) ? "is-applied" : ""}>
                    <span className="tk-ai-rank">{index + 1}</span>
                    <div>
                      <b>{proposal.title}</b>
                      <em>{when(proposal)}</em>
                      <span>{proposal.reason}</span>
                    </div>
                    {applied.includes(proposal.id) ? (
                      <span className="cal-plan-done">Applied</span>
                    ) : (
                      <form
                        action={applyAction}
                        onSubmit={() => setApplied((state) => [...state, proposal.id])}
                      >
                        <input type="hidden" name="item_id" value={proposal.id} />
                        <input type="hidden" name="date" value={proposal.date} />
                        <input type="hidden" name="start_time" value={proposal.startTime} />
                        {proposal.endTime ? (
                          <input type="hidden" name="end_time" value={proposal.endTime} />
                        ) : null}
                        <button type="submit" className="cc-btn">Apply</button>
                      </form>
                    )}
                  </li>
                ))}
              </ol>
              <p className="cc-note">
                Nothing has moved. Each line is applied on its own, so you can
                take the two that make sense and leave the rest.
              </p>
            </>
          ) : null}

          {!busy && !error && proposals.length === 0 && headline ? (
            <p className="cc-note">No changes worth proposing.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
