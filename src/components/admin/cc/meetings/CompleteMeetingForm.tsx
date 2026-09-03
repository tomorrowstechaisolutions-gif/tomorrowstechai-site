"use client";

import { useState } from "react";
import {
  MEETING_OUTCOMES, OUTCOMES_IMPLYING_FOLLOW_UP, OUTCOME_LABELS,
} from "@/lib/meetings/config";
import type { MeetingOutcome } from "@/lib/meetings/config";

/**
 * The post-meeting panel.
 *
 * Client-side only because of one behaviour: picking an outcome that implies
 * a follow-up ticks the follow-up box for you. That is the difference between
 * a form people fill in and a form people skip — the outcome they just chose
 * already told us the answer, so asking again is a question with a known
 * answer.
 *
 * The follow-up task is created in the existing task system. This form has no
 * concept of a task of its own.
 */
export default function CompleteMeetingForm({
  meetingId,
  action,
  contactName,
  defaultFollowUpDate,
}: {
  meetingId: string;
  action: (formData: FormData) => void | Promise<void>;
  contactName: string | null;
  defaultFollowUpDate: string;
}) {
  const [outcome, setOutcome] = useState<MeetingOutcome | "">("");
  const [followUp, setFollowUp] = useState(false);
  const [touchedFollowUp, setTouchedFollowUp] = useState(false);
  const [createTask, setCreateTask] = useState(true);

  function chooseOutcome(next: MeetingOutcome) {
    setOutcome(next);
    if (!touchedFollowUp) setFollowUp(OUTCOMES_IMPLYING_FOLLOW_UP.includes(next));
  }

  return (
    <form action={action} className="mt-complete">
      <input type="hidden" name="meeting_id" value={meetingId} />

      <label className="tk-stack">
        <span>How did it go? <i>required</i></span>
        <select
          name="outcome"
          className="cc-input"
          value={outcome}
          onChange={(event) => chooseOutcome(event.target.value as MeetingOutcome)}
          required
        >
          <option value="" disabled>Choose an outcome…</option>
          {MEETING_OUTCOMES.map((key) => (
            <option key={key} value={key}>{OUTCOME_LABELS[key]}</option>
          ))}
        </select>
      </label>

      <label className="tk-stack">
        <span>Meeting notes</span>
        <textarea name="notes" className="cc-input" rows={4}
          placeholder="What was said, what they care about, what they objected to." />
      </label>

      <label className="tk-stack">
        <span>Next steps</span>
        <textarea name="next_steps" className="cc-input" rows={2}
          placeholder="What happens now, and who does it." />
      </label>

      <label className="mt-check">
        <input
          type="checkbox"
          name="follow_up_required"
          checked={followUp}
          onChange={(event) => { setFollowUp(event.target.checked); setTouchedFollowUp(true); }}
        />
        <span>A follow-up is needed</span>
      </label>

      {followUp ? (
        <div className="mt-followup">
          <label className="tk-stack">
            <span>Follow up by</span>
            <input name="follow_up_date" type="date" className="cc-input" defaultValue={defaultFollowUpDate} />
          </label>

          <label className="mt-check">
            <input
              type="checkbox"
              name="create_task"
              checked={createTask}
              onChange={(event) => setCreateTask(event.target.checked)}
            />
            <span>Create a task for it</span>
          </label>

          {createTask ? (
            <label className="tk-stack">
              <span>Task</span>
              <input name="task_title" className="cc-input"
                defaultValue={contactName ? `Follow up with ${contactName}` : "Follow up"} />
            </label>
          ) : null}
        </div>
      ) : null}

      <footer>
        <button type="submit" className="cc-btn primary" disabled={!outcome}>Save meeting</button>
      </footer>
    </form>
  );
}
