import Link from "next/link";
import DrawerShell from "../tasks/DrawerShell";
import Collapse from "./Collapse";
import CompleteMeetingForm from "./CompleteMeetingForm";
import StartMeetingButton from "./StartMeetingButton";
import { dateInputValue, longWhen, relative, timeInputValue } from "./format";
import {
  DURATION_PRESETS, OPEN_MEETING_STATUSES, OUTCOME_LABELS, OUTCOME_TONE,
  PROVIDER_IS_VIDEO, PROVIDER_LABELS, STATUS_LABELS, STATUS_TONE, TYPE_LABELS,
} from "@/lib/meetings/config";
import type { MeetingWithLinks } from "@/lib/meetings/types";
import { IconAlert, IconMail, IconX } from "../Icons";
import {
  cancelMeetingAction, completeMeetingAction, emailMeetingAction,
  rescheduleMeetingAction, setMeetingStatusAction, syncMeetingAction,
} from "@/app/admin/meeting-actions";

/**
 * The meeting detail panel.
 *
 * Server-rendered from the row, inside the same DrawerShell the task board
 * already uses — so Escape, the scrim and the back button behave identically
 * to every other drawer in the admin, and none of this content arrives as a
 * spinner.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-fact">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  );
}

export default function MeetingDrawer({
  meeting,
  closeHref,
  followUpDefault,
}: {
  meeting: MeetingWithLinks;
  closeHref: string;
  followUpDefault: string;
}) {
  const open = OPEN_MEETING_STATUSES.includes(meeting.status);
  const joinable = Boolean(meeting.meeting_url) && PROVIDER_IS_VIDEO[meeting.provider];
  const startsSoon = open && Math.abs(new Date(meeting.start_at).getTime() - Date.now()) < 6 * 3600_000;

  return (
    <DrawerShell closeHref={closeHref}>
      <header className="tk-drawer-head">
        <div>
          <span className={`cc-chip ${STATUS_TONE[meeting.status]}`}>{STATUS_LABELS[meeting.status]}</span>
          <h2>{meeting.title}</h2>
          <p className="mt-drawer-sub">
            {TYPE_LABELS[meeting.meeting_type]} · {PROVIDER_LABELS[meeting.provider]}
          </p>
        </div>
        <Link href={closeHref} scroll={false} className="cc-icon-btn" aria-label="Close">
          <IconX size={14} />
        </Link>
      </header>

      <div className="tk-drawer-body">
        {meeting.provider_error ? (
          <div className="mt-alert">
            <IconAlert size={15} />
            <div>
              <b>The invitation did not go out.</b>
              <p>{meeting.provider_error}</p>
              <form action={syncMeetingAction}>
                <input type="hidden" name="meeting_id" value={meeting.id} />
                <button type="submit" className="cc-btn">Retry now</button>
              </form>
            </div>
          </div>
        ) : null}

        {/* ── When and where ─────────────────────────────────── */}
        <section className="mt-facts">
          <Row label="When">
            {longWhen(meeting.start_at, meeting.timezone)}
            {startsSoon ? <em className="mt-rel">{relative(meeting.start_at)}</em> : null}
          </Row>
          <Row label="How long">{meeting.duration_minutes} minutes</Row>
          <Row label="Provider">
            {PROVIDER_LABELS[meeting.provider]}
            {meeting.location ? <em className="mt-rel">{meeting.location}</em> : null}
          </Row>
          <Row label="Attendee">
            {meeting.attendee_name || meeting.contactName || "—"}
            {meeting.attendee_email ? <em className="mt-rel">{meeting.attendee_email}</em> : null}
          </Row>
          {meeting.companyName ? <Row label="Company">{meeting.companyName}</Row> : null}
          {meeting.owner ? <Row label="Owner">{meeting.owner}</Row> : null}
          {meeting.reschedule_count > 0 ? (
            <Row label="Rescheduled">
              {meeting.reschedule_count} time{meeting.reschedule_count === 1 ? "" : "s"}
              {meeting.original_start_at
                ? <em className="mt-rel">Originally {longWhen(meeting.original_start_at, meeting.timezone)}</em>
                : null}
            </Row>
          ) : null}
        </section>

        {/* ── Start ──────────────────────────────────────────── */}
        {open && joinable ? (
          <div className="mt-start">
            <StartMeetingButton
              url={meeting.meeting_url as string}
              meetingId={meeting.id}
              markInProgress={setMeetingStatusAction}
            />
            <span className="mt-start-note">Opens {PROVIDER_LABELS[meeting.provider]} in a new tab.</span>
          </div>
        ) : null}

        {/* ── Related records ────────────────────────────────── */}
        {meeting.contactHref || meeting.proposal_id || meeting.job_id ? (
          <section className="mt-links">
            {meeting.contactHref ? (
              <Link className="cc-btn" href={meeting.contactHref}>
                {meeting.customer_id ? "Open client" : "Open lead"}
              </Link>
            ) : null}
            {meeting.proposal_id ? (
              <Link className="cc-btn" href={`/admin/proposals/${meeting.proposal_id}`}>
                Open proposal{meeting.proposalNumber ? ` ${meeting.proposalNumber}` : ""}
              </Link>
            ) : null}
            {meeting.job_id ? (
              <Link className="cc-btn" href={`/admin/jobs/${meeting.job_id}`}>Open project</Link>
            ) : null}
            {meeting.follow_up_task_id ? (
              <Link className="cc-btn" href={`/admin/tasks?task=${meeting.follow_up_task_id}`}>
                Open follow-up task
              </Link>
            ) : null}
          </section>
        ) : null}

        {meeting.agenda ? (
          <section className="mt-block">
            <h3>Agenda</h3>
            <p className="mt-prose">{meeting.agenda}</p>
          </section>
        ) : null}

        {/* ── After the fact ─────────────────────────────────── */}
        {meeting.status === "completed" ? (
          <section className="mt-block">
            <h3>Outcome</h3>
            {meeting.outcome ? (
              <span className={`cc-chip ${OUTCOME_TONE[meeting.outcome]}`}>
                {OUTCOME_LABELS[meeting.outcome]}
              </span>
            ) : null}
            {meeting.internal_notes ? <p className="mt-prose">{meeting.internal_notes}</p> : null}
            {meeting.next_steps ? (
              <>
                <h3>Next steps</h3>
                <p className="mt-prose">{meeting.next_steps}</p>
              </>
            ) : null}
            {meeting.follow_up_required ? (
              <p className="mt-note">
                Follow-up due {meeting.follow_up_date ?? "soon"}
                {meeting.follow_up_task_id ? " — a task is open for it." : "."}
              </p>
            ) : null}
          </section>
        ) : null}

        {meeting.status === "cancelled" && meeting.cancel_reason ? (
          <section className="mt-block">
            <h3>Why it was cancelled</h3>
            <p className="mt-prose">{meeting.cancel_reason}</p>
          </section>
        ) : null}

        {/* ── Actions ────────────────────────────────────────── */}
        <section className="mt-actions">
          {open ? (
            <Collapse label="Mark complete">
              <CompleteMeetingForm
                meetingId={meeting.id}
                action={completeMeetingAction}
                contactName={meeting.attendee_name || meeting.contactName}
                defaultFollowUpDate={followUpDefault}
              />
            </Collapse>
          ) : null}

          <Collapse label="Reschedule">
            <form action={rescheduleMeetingAction} className="mt-form">
              <input type="hidden" name="meeting_id" value={meeting.id} />
              <div className="mt-row3">
                <label className="tk-stack">
                  <span>Date</span>
                  <input name="date" type="date" className="cc-input"
                    defaultValue={dateInputValue(meeting.start_at, meeting.timezone)} required />
                </label>
                <label className="tk-stack">
                  <span>Start</span>
                  <input name="time" type="time" className="cc-input" step={900}
                    defaultValue={timeInputValue(meeting.start_at, meeting.timezone)} required />
                </label>
                <label className="tk-stack">
                  <span>Duration</span>
                  <select name="duration" className="cc-input" defaultValue={String(meeting.duration_minutes)}>
                    {Array.from(new Set([...DURATION_PRESETS, meeting.duration_minutes]))
                      .sort((a, b) => a - b)
                      .map((minutes) => (
                        <option key={minutes} value={minutes}>{minutes} minutes</option>
                      ))}
                  </select>
                </label>
              </div>
              <label className="tk-stack">
                <span>Reason <i>optional — kept internally</i></span>
                <input name="reason" className="cc-input" placeholder="Client asked to move it" />
              </label>
              <label className="mt-check">
                <input type="checkbox" name="no_invite" />
                <span>Don&rsquo;t email the update</span>
              </label>
              <button type="submit" className="cc-btn primary">Move the meeting</button>
            </form>
          </Collapse>

          {open ? (
            <Collapse label="Cancel meeting" tone="danger">
              <form action={cancelMeetingAction} className="mt-form">
                <input type="hidden" name="meeting_id" value={meeting.id} />
                <label className="tk-stack">
                  <span>Reason <i>optional</i></span>
                  <input name="reason" className="cc-input" placeholder="Why it is not happening" />
                </label>
                <label className="mt-check">
                  <input type="checkbox" name="no_show" />
                  <span>They did not turn up — record it as a no-show</span>
                </label>
                <label className="mt-check">
                  <input type="checkbox" name="no_invite" />
                  <span>Don&rsquo;t email the cancellation</span>
                </label>
                <button type="submit" className="cc-btn is-danger">Cancel this meeting</button>
              </form>
            </Collapse>
          ) : null}

          {meeting.attendee_email ? (
            <Collapse label="Email the client">
              <form action={emailMeetingAction} className="mt-form">
                <input type="hidden" name="meeting_id" value={meeting.id} />
                <label className="tk-stack">
                  <span>Which email</span>
                  <select name="kind" className="cc-input" defaultValue={open ? "invite" : "follow_up"}>
                    <option value="invite">The details, with the join link</option>
                    <option value="reminder">A reminder</option>
                    <option value="follow_up">A follow-up after the meeting</option>
                  </select>
                </label>
                <label className="tk-stack">
                  <span>Add a line <i>optional</i></span>
                  <textarea name="note" className="cc-input" rows={2}
                    placeholder="Anything you want to say alongside the details." />
                </label>
                <button type="submit" className="cc-btn">
                  <IconMail size={14} /> Send to {meeting.attendee_email}
                </button>
              </form>
            </Collapse>
          ) : null}

          {open && meeting.status !== "confirmed" ? (
            <form action={setMeetingStatusAction}>
              <input type="hidden" name="meeting_id" value={meeting.id} />
              <input type="hidden" name="status" value="confirmed" />
              <button type="submit" className="cc-btn">Mark confirmed</button>
            </form>
          ) : null}
        </section>
      </div>
    </DrawerShell>
  );
}
