import Link from "next/link";
import {
  MEETING_TABS, OUTCOME_LABELS, OUTCOME_TONE, PROVIDER_IS_VIDEO,
  PROVIDER_SHORT, STATUS_LABELS, STATUS_TONE, TYPE_LABELS,
} from "@/lib/meetings/config";
import type { MeetingTab } from "@/lib/meetings/config";
import type { MeetingKpis, MeetingWithLinks } from "@/lib/meetings/types";
import { setMeetingStatusAction } from "@/app/admin/meeting-actions";
import StartMeetingButton from "../meetings/StartMeetingButton";
import { dayOf, relative, timeOf } from "../meetings/format";
import { EmptyState } from "../Panel";
import { DASH } from "../format";
import {
  IconCalendar, IconCheck, IconClock, IconRepeat, IconUsers,
} from "../Icons";

/**
 * The Meetings Center.
 *
 * Small on purpose. It is an operational hub — what is on today, what is
 * coming, what still owes somebody a follow-up — not a second CRM. Anything
 * about the person rather than the meeting is one click away on their record.
 *
 * The KPI cards count the whole table; the list below respects the tab. A
 * card that changed with the tab would be answering a different question from
 * the one on its label — the same rule the Tasks board follows.
 */

function tabHref(tab: MeetingTab, search: string): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (search) params.set("q", search);
  return `/admin/meetings?${params.toString()}`;
}

function meetingHref(id: string, tab: MeetingTab, search: string): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (search) params.set("q", search);
  params.set("meeting", id);
  return `/admin/meetings?${params.toString()}`;
}

/** The Today agenda — the view you leave open on a working morning. */
function Agenda({
  meetings, tab, search,
}: {
  meetings: MeetingWithLinks[];
  tab: MeetingTab;
  search: string;
}) {
  return (
    <ol className="mt-agenda">
      {meetings.map((meeting) => {
        const joinable = Boolean(meeting.meeting_url) && PROVIDER_IS_VIDEO[meeting.provider];
        const soon = Math.abs(new Date(meeting.start_at).getTime() - Date.now()) < 3 * 3600_000;

        return (
          <li key={meeting.id} className={`mt-agenda-row${soon ? " is-soon" : ""}`}>
            <div className="mt-agenda-time">
              <b>{timeOf(meeting.start_at, meeting.timezone)}</b>
              <span>{meeting.duration_minutes} min</span>
            </div>

            <div className="mt-agenda-body">
              <Link href={meetingHref(meeting.id, tab, search)} scroll={false} className="cc-strong">
                {meeting.title}
              </Link>
              <span className="mt-agenda-meta">
                {meeting.companyName || meeting.contactName || meeting.attendee_name || DASH}
                <i>·</i>
                {TYPE_LABELS[meeting.meeting_type]}
                <i>·</i>
                {PROVIDER_SHORT[meeting.provider]}
              </span>
            </div>

            <div className="mt-agenda-actions">
              <span className={`cc-chip ${STATUS_TONE[meeting.status]}`}>
                {STATUS_LABELS[meeting.status]}
              </span>
              {joinable && meeting.status !== "completed" && meeting.status !== "cancelled" ? (
                <StartMeetingButton
                  url={meeting.meeting_url as string}
                  meetingId={meeting.id}
                  markInProgress={setMeetingStatusAction}
                  label="Start"
                  compact
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Everything that is not today reads better as a table. */
function Table({
  meetings, tab, search, showOutcome,
}: {
  meetings: MeetingWithLinks[];
  tab: MeetingTab;
  search: string;
  showOutcome: boolean;
}) {
  return (
    <div className="mt-tablewrap">
      <table className="mt-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Contact</th>
            <th>Company</th>
            <th>Type</th>
            <th>How</th>
            <th>{showOutcome ? "Outcome" : "Status"}</th>
            <th>Related</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {meetings.map((meeting) => {
            const joinable = Boolean(meeting.meeting_url) && PROVIDER_IS_VIDEO[meeting.provider];
            return (
              <tr key={meeting.id}>
                <td>
                  <Link href={meetingHref(meeting.id, tab, search)} scroll={false} className="cc-strong">
                    {dayOf(meeting.start_at, meeting.timezone)}
                  </Link>
                  <span className="cc-sub">{timeOf(meeting.start_at, meeting.timezone)}</span>
                </td>
                <td>{meeting.contactName || meeting.attendee_name || DASH}</td>
                <td>{meeting.companyName || DASH}</td>
                <td>{TYPE_LABELS[meeting.meeting_type]}</td>
                <td>{PROVIDER_SHORT[meeting.provider]}</td>
                <td>
                  {showOutcome && meeting.outcome ? (
                    <span className={`cc-chip ${OUTCOME_TONE[meeting.outcome]}`}>
                      {OUTCOME_LABELS[meeting.outcome]}
                    </span>
                  ) : (
                    <span className={`cc-chip ${STATUS_TONE[meeting.status]}`}>
                      {STATUS_LABELS[meeting.status]}
                    </span>
                  )}
                  {meeting.follow_up_required && meeting.follow_up_date ? (
                    <span className="cc-sub">Follow up by {meeting.follow_up_date}</span>
                  ) : null}
                </td>
                <td>
                  {meeting.proposal_id ? (
                    <Link href={`/admin/proposals/${meeting.proposal_id}`}>
                      {meeting.proposalNumber ?? "Proposal"}
                    </Link>
                  ) : meeting.job_id ? (
                    <Link href={`/admin/jobs/${meeting.job_id}`}>{meeting.projectName ?? "Project"}</Link>
                  ) : meeting.contactHref ? (
                    <Link href={meeting.contactHref}>{meeting.customer_id ? "Client" : "Lead"}</Link>
                  ) : DASH}
                </td>
                <td className="mt-rowactions">
                  {joinable && (meeting.status === "scheduled" || meeting.status === "confirmed" || meeting.status === "in_progress") ? (
                    <StartMeetingButton
                      url={meeting.meeting_url as string}
                      meetingId={meeting.id}
                      markInProgress={setMeetingStatusAction}
                      label="Start"
                      compact
                    />
                  ) : null}
                  <Link className="cc-btn is-sm" href={meetingHref(meeting.id, tab, search)} scroll={false}>
                    Open
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const EMPTY_COPY: Record<MeetingTab, { title: string; text: string }> = {
  today: {
    title: "Nothing booked today",
    text: "A clear day. Schedule a meeting from any lead, client or proposal and it will land here and on the calendar.",
  },
  upcoming: {
    title: "Nothing scheduled yet",
    text: "Open a lead or a client and press Schedule Meeting. The invitation, the link and the calendar entry all follow from there.",
  },
  past: {
    title: "No meetings behind you yet",
    text: "Once a meeting has happened it moves here with its notes and its outcome.",
  },
  followup: {
    title: "No follow-ups owing",
    text: "Nothing is waiting on you. A meeting marked complete with a follow-up appears here until its task is done.",
  },
  cancelled: {
    title: "Nothing cancelled",
    text: "Meetings that were called off or moved show up here so the history stays honest.",
  },
};

export default function MeetingsBoard({
  kpis, meetings, tab, search, newMeeting,
}: {
  kpis: MeetingKpis;
  meetings: MeetingWithLinks[];
  tab: MeetingTab;
  search: string;
  /** The Schedule Meeting button, rendered by the page that knows the contact. */
  newMeeting?: React.ReactNode;
}) {
  const cards = [
    { label: "Today", value: kpis.today, foot: "meetings booked", Icon: IconCalendar, tone: "" },
    { label: "Upcoming", value: kpis.upcoming, foot: "still to come", Icon: IconClock, tone: "" },
    { label: "Completed", value: kpis.completedThisMonth, foot: "this month", Icon: IconCheck, tone: "is-ok" },
    {
      label: "Follow-ups", value: kpis.followUpsRequired, foot: "waiting on you",
      Icon: IconRepeat, tone: kpis.followUpsRequired > 0 ? "is-warn" : "",
    },
  ];

  return (
    <>
      <div className="cc-kpis tk-kpis">
        {cards.map(({ label, value, foot, Icon, tone }) => (
          <div className={`cc-kpi ${tone}`} key={label}>
            <div className="cc-kpi-top">
              <span className="cc-kpi-icon"><Icon size={14} /></span>
              <span className="cc-kpi-label">{label}</span>
            </div>
            <span className="cc-kpi-value">{value}</span>
            <div className="cc-kpi-foot"><span>{foot}</span></div>
          </div>
        ))}
      </div>

      <div className="mt-toolbar">
        <nav className="tk-tabs" aria-label="Meeting views">
          {MEETING_TABS.map((entry) => (
            <Link
              key={entry.key}
              href={tabHref(entry.key, search)}
              className={`tk-tab ${entry.key === tab ? "is-on" : ""}`}
              scroll={false}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        <div className="mt-toolbar-right">
          <form className="mt-search" action="/admin/meetings">
            <input type="hidden" name="tab" value={tab} />
            <input
              name="q"
              className="cc-input"
              defaultValue={search}
              placeholder="Search meetings…"
              aria-label="Search meetings"
            />
          </form>
          {newMeeting}
        </div>
      </div>

      <section className="cc-panel">
        <div className="cc-panel-body">
          {meetings.length === 0 ? (
            <EmptyState
              title={EMPTY_COPY[tab].title}
              text={EMPTY_COPY[tab].text}
              icon={<IconUsers size={17} />}
            />
          ) : tab === "today" ? (
            <Agenda meetings={meetings} tab={tab} search={search} />
          ) : (
            <Table
              meetings={meetings}
              tab={tab}
              search={search}
              showOutcome={tab === "past" || tab === "followup"}
            />
          )}
        </div>
      </section>

      {tab === "today" && meetings.length > 0 ? (
        <p className="mt-foot">
          Next up {relative(meetings[0].start_at)}. Everything here is also on the{" "}
          <Link href="/admin/calendar">calendar</Link>.
        </p>
      ) : null}
    </>
  );
}
