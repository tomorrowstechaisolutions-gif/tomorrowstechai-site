import Link from "next/link";
import {
  PROVIDER_SHORT, STATUS_LABELS, STATUS_TONE, OUTCOME_LABELS, OUTCOME_TONE, TYPE_LABELS,
} from "@/lib/meetings/config";
import type { RecordMeetings } from "@/lib/meetings/queries";
import { dayOf, relative, timeOf } from "./format";
import { DASH } from "../format";

/**
 * The Meetings section on a lead, a client, a project or a proposal.
 *
 * One component for all four, because the question is the same everywhere:
 * when are we next speaking, when did we last speak, and what came out of it.
 * The Schedule button is passed in rather than built here, so the page that
 * already resolved the contact stays the only thing that knows who it is.
 */
export default function MeetingsPanel({
  data,
  scheduleButton,
  heading = "Meetings",
  emptyText = "No meetings yet. Schedule one and the invitation, the link and the calendar entry all follow from it.",
  variant = "cc",
}: {
  data: RecordMeetings;
  scheduleButton?: React.ReactNode;
  heading?: string;
  emptyText?: string;
  /**
   * Which panel dialect the surrounding page speaks. Leads and Projects were
   * built on `.ad-*`; Clients and Proposals on `.cc-*`. Matching the page
   * rather than imposing one is what keeps this looking like it was always
   * there.
   */
  variant?: "cc" | "ad";
}) {
  const { upcoming, past, next, last } = data;
  const panel = variant === "ad" ? "ad-panel" : "cc-panel";
  const head = variant === "ad" ? "ad-panel-head" : "cc-panel-head";
  const bodyClass = variant === "ad" ? "" : "cc-panel-body";

  return (
    <section className={`${panel} mt-panel`}>
      <header className={head}>
        <h2>{heading}</h2>
        {scheduleButton}
      </header>

      <div className={bodyClass}>
        {data.total === 0 ? (
          <p className="mt-empty">{emptyText}</p>
        ) : (
          <>
            <div className="mt-summary">
              <div>
                <span>Next</span>
                <b>
                  {next
                    ? `${dayOf(next.start_at, next.timezone)} · ${timeOf(next.start_at, next.timezone)}`
                    : "Nothing booked"}
                </b>
                {next ? <i>{relative(next.start_at)}</i> : null}
              </div>
              <div>
                <span>Last</span>
                <b>
                  {last
                    ? `${dayOf(last.start_at, last.timezone)} · ${TYPE_LABELS[last.meeting_type]}`
                    : "None yet"}
                </b>
                {last?.outcome ? (
                  <i className={`cc-chip ${OUTCOME_TONE[last.outcome]}`}>{OUTCOME_LABELS[last.outcome]}</i>
                ) : null}
              </div>
            </div>

            {upcoming.length > 0 ? (
              <>
                <h3 className="mt-subhead">Upcoming</h3>
                <ul className="mt-list">
                  {upcoming.map((meeting) => (
                    <li key={meeting.id}>
                      <Link href={`/admin/meetings?meeting=${meeting.id}`} className="cc-strong">
                        {meeting.title}
                      </Link>
                      <span className="mt-list-meta">
                        {dayOf(meeting.start_at, meeting.timezone)} · {timeOf(meeting.start_at, meeting.timezone)}
                        {" · "}{PROVIDER_SHORT[meeting.provider]}
                      </span>
                      <span className={`cc-chip ${STATUS_TONE[meeting.status]}`}>
                        {STATUS_LABELS[meeting.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {past.length > 0 ? (
              <>
                <h3 className="mt-subhead">History</h3>
                <ul className="mt-list is-past">
                  {past.slice(0, 8).map((meeting) => (
                    <li key={meeting.id}>
                      <Link href={`/admin/meetings?meeting=${meeting.id}`} className="cc-strong">
                        {meeting.title}
                      </Link>
                      <span className="mt-list-meta">
                        {dayOf(meeting.start_at, meeting.timezone)}
                        {" · "}{TYPE_LABELS[meeting.meeting_type]}
                        {meeting.internal_notes ? " · notes" : ""}
                      </span>
                      {meeting.outcome ? (
                        <span className={`cc-chip ${OUTCOME_TONE[meeting.outcome]}`}>
                          {OUTCOME_LABELS[meeting.outcome]}
                        </span>
                      ) : (
                        <span className={`cc-chip ${STATUS_TONE[meeting.status]}`}>
                          {STATUS_LABELS[meeting.status]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {past.length > 8 ? (
                  <p className="mt-empty">
                    {past.length - 8} more in <Link href="/admin/meetings?tab=past">Meetings</Link>. {DASH}
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
