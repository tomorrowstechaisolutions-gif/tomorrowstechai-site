import Link from "next/link";
import {
  OUTCOME_LABELS, OUTCOME_TONE, PROVIDER_IS_VIDEO, PROVIDER_LABELS,
  STATUS_LABELS, STATUS_TONE, TYPE_LABELS,
} from "@/lib/meetings/config";
import type { MeetingWithLinks } from "@/lib/meetings/types";
import { HISTORY_FILTERS } from "@/lib/conference/config";
import type { HistoryFilter } from "@/lib/conference/config";
import type {
  ConferenceAnalytics, ConferenceKpis, ConsultationRequest, Ratio,
} from "@/lib/conference/queries";
import { HISTORY_PAGE_SIZE } from "@/lib/conference/queries";
import { invitationText } from "@/lib/conference/invitation";
import { setMeetingStatusAction } from "@/app/admin/meeting-actions";
import StartMeetingButton from "../meetings/StartMeetingButton";
import { dayOf, hostStartUrl, longWhen, timeOf } from "../meetings/format";
import { EmptyState } from "../Panel";
import { DASH } from "../format";
import { CopyButton } from "./ConferenceLaunchers";
import {
  IconCalendar, IconCheck, IconChart, IconClock, IconInbox, IconRepeat, IconVideo,
} from "../Icons";

/**
 * The Conference Center's read-only furniture: KPI cards, the upcoming
 * table, consultation requests, history and analytics. Server components —
 * nothing here arrives as a spinner.
 */

export function detailHref(id: string, extra = ""): string {
  return `/admin/conference-center?conference=${encodeURIComponent(id)}${extra}`;
}

// ── KPIs ──────────────────────────────────────────────────────────────

export function ConferenceKpiRow({ kpis }: { kpis: ConferenceKpis }) {
  const cards = [
    { label: "Meetings Today", value: kpis.today, foot: "on the calendar", Icon: IconCalendar, tone: "" },
    { label: "Upcoming", value: kpis.upcoming, foot: "conferences still to come", Icon: IconClock, tone: "" },
    {
      label: "Pending Requests", value: kpis.pendingRequests, foot: "consultations to confirm",
      Icon: IconInbox, tone: kpis.pendingRequests > 0 ? "is-warn" : "",
    },
    { label: "Completed", value: kpis.completedThisMonth, foot: "this month", Icon: IconCheck, tone: "is-ok" },
    {
      label: "Follow-Ups Required", value: kpis.followUpsRequired, foot: "waiting on you",
      Icon: IconRepeat, tone: kpis.followUpsRequired > 0 ? "is-warn" : "",
    },
  ];
  return (
    <div className="cc-kpis cf-kpis">
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
  );
}

// ── Zoom status chip per row ──────────────────────────────────────────

function ZoomState({ meeting }: { meeting: MeetingWithLinks }) {
  if (meeting.provider !== "zoom") {
    return <span className="cc-chip t-muted">{PROVIDER_LABELS[meeting.provider]}</span>;
  }
  if (meeting.provider_error) return <span className="cc-chip t-risk" title={meeting.provider_error}>Zoom sync failed</span>;
  if (meeting.provider_event_id) return <span className="cc-chip t-ok">Zoom confirmed</span>;
  return <span className="cc-chip t-warn">Not synced</span>;
}

function inviteFor(meeting: MeetingWithLinks): string | null {
  if (!meeting.meeting_url) return null;
  const meta = (meeting.provider_metadata ?? {}) as Record<string, unknown>;
  return invitationText({
    title: meeting.title,
    when: longWhen(meeting.start_at, meeting.timezone),
    joinUrl: meeting.meeting_url,
    zoomId: meeting.provider === "zoom" ? meeting.provider_event_id : null,
    passcode: typeof meta.passcode === "string" ? meta.passcode : null,
    agenda: meeting.agenda,
  });
}

// ── Upcoming ──────────────────────────────────────────────────────────

export function UpcomingConferences({ meetings }: { meetings: MeetingWithLinks[] }) {
  if (meetings.length === 0) {
    return (
      <EmptyState
        title="No conferences scheduled"
        text="Start an instant conference or schedule one. Conferences scheduled from a lead, client, proposal or project appear here too."
        icon={<IconVideo size={17} />}
      />
    );
  }
  return (
    <div className="mt-tablewrap">
      <table className="mt-table cf-table">
        <thead>
          <tr>
            <th>Meeting</th>
            <th>Type</th>
            <th>With</th>
            <th>When</th>
            <th>Length</th>
            <th>Host</th>
            <th>Status</th>
            <th>Zoom</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {meetings.map((meeting) => {
            const start = hostStartUrl(meeting);
            const startable = Boolean(start) && PROVIDER_IS_VIDEO[meeting.provider];
            const invite = inviteFor(meeting);
            return (
              <tr key={meeting.id}>
                <td data-label="Meeting">
                  <Link href={detailHref(meeting.id)} scroll={false} className="cc-strong">{meeting.title}</Link>
                  {meeting.source === "instant" ? <span className="cc-sub">Instant</span> : null}
                  {meeting.source === "booking" ? <span className="cc-sub">Booked online</span> : null}
                </td>
                <td data-label="Type">{TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type}</td>
                <td data-label="With">
                  {meeting.contactHref ? (
                    <Link href={meeting.contactHref}>{meeting.contactName || meeting.attendee_email || "Contact"}</Link>
                  ) : (meeting.contactName || meeting.attendee_email || DASH)}
                  {meeting.companyName ? <span className="cc-sub">{meeting.companyName}</span> : null}
                </td>
                <td data-label="When">
                  {dayOf(meeting.start_at, meeting.timezone)}
                  <span className="cc-sub">{timeOf(meeting.start_at, meeting.timezone)}</span>
                </td>
                <td data-label="Length">{meeting.duration_minutes} min</td>
                <td data-label="Host">{meeting.owner ? meeting.owner.split("@")[0] : DASH}</td>
                <td data-label="Status">
                  <span className={`cc-chip ${STATUS_TONE[meeting.status]}`}>{STATUS_LABELS[meeting.status]}</span>
                </td>
                <td data-label="Zoom"><ZoomState meeting={meeting} /></td>
                <td className="mt-rowactions cf-rowactions">
                  {startable && start ? (
                    <StartMeetingButton url={start} meetingId={meeting.id}
                      markInProgress={setMeetingStatusAction} label="Start" compact />
                  ) : null}
                  {invite ? <CopyButton text={invite} label="Copy invite" className="cc-btn is-sm" /> : null}
                  <Link className="cc-btn is-sm" href={detailHref(meeting.id)} scroll={false}>Details</Link>
                  <Link className="cc-btn is-sm" href={detailHref(meeting.id, "&do=reschedule")} scroll={false}>Reschedule</Link>
                  <Link className="cc-btn is-sm cf-danger" href={detailHref(meeting.id, "&do=cancel")} scroll={false}>Cancel</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Consultation requests ─────────────────────────────────────────────

export function ConsultationRequests({
  requests, bookingLive,
}: {
  requests: ConsultationRequest[];
  bookingLive: boolean;
}) {
  if (requests.length === 0) {
    return (
      <EmptyState
        title="No requests waiting"
        text={bookingLive
          ? "New bookings from the public consultation page land here until you confirm them."
          : "The public booking page (/book-consultation) is Phase 2 and not live yet. Website appointment requests from the existing booking log also appear here."}
        icon={<IconInbox size={17} />}
      />
    );
  }
  return (
    <ul className="cf-requests">
      {requests.map((r) => r.kind === "booking" ? (
        <li key={r.meeting.id}>
          <div>
            <Link href={detailHref(r.meeting.id)} scroll={false} className="cc-strong">{r.meeting.title}</Link>
            <span className="cc-sub">
              {r.meeting.contactName || r.meeting.attendee_email} · {longWhen(r.meeting.start_at, r.meeting.timezone)}
            </span>
          </div>
          <form action={setMeetingStatusAction}>
            <input type="hidden" name="meeting_id" value={r.meeting.id} />
            <input type="hidden" name="status" value="confirmed" />
            <button type="submit" className="cc-btn is-sm">Confirm</button>
          </form>
        </li>
      ) : (
        <li key={r.id}>
          <div>
            {r.leadId ? (
              <Link href={`/admin/leads/${r.leadId}`} className="cc-strong">{r.leadName ?? "Lead"}</Link>
            ) : <b>Website appointment</b>}
            <span className="cc-sub">
              {longWhen(r.scheduledAt)}{r.source ? ` · ${r.source}` : ""} · from the website booking log
            </span>
          </div>
          {r.leadId ? (
            <Link className="cc-btn is-sm" href={`/admin/conference-center?schedule=1&contact=lead:${r.leadId}&category=ai_consultation`}>
              Schedule on Zoom
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ── History ───────────────────────────────────────────────────────────

export function ConferenceHistory({
  rows, total, filter, search, provider, page,
}: {
  rows: MeetingWithLinks[];
  total: number;
  filter: HistoryFilter;
  search: string;
  provider: string;
  page: number;
}) {
  const href = (next: Partial<{ filter: string; q: string; provider: string; page: number }>) => {
    const p = new URLSearchParams();
    const f = next.filter ?? filter;
    const q = next.q ?? search;
    const pr = next.provider ?? provider;
    const pg = next.page ?? 1;
    if (f !== "all") p.set("history", f);
    if (q) p.set("hq", q);
    if (pr) p.set("hp", pr);
    if (pg > 1) p.set("page", String(pg));
    const qs = p.toString();
    return `/admin/conference-center${qs ? `?${qs}` : ""}#history`;
  };
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  return (
    <>
      <div className="mt-toolbar cf-toolbar">
        <nav className="tk-tabs" aria-label="History filter">
          {HISTORY_FILTERS.map((f) => (
            <Link key={f.key} href={href({ filter: f.key })} scroll={false}
              className={`tk-tab ${f.key === filter ? "is-on" : ""}`}>
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="mt-search cf-search" action="/admin/conference-center#history">
          {filter !== "all" ? <input type="hidden" name="history" value={filter} /> : null}
          <select name="hp" className="cc-input" defaultValue={provider} aria-label="Provider">
            <option value="">All providers</option>
            <option value="zoom">Zoom</option>
            <option value="google_meet">Google Meet</option>
            <option value="phone">Phone</option>
            <option value="in_person">In person</option>
          </select>
          <input name="hq" className="cc-input" defaultValue={search} placeholder="Search history…" aria-label="Search history" />
          <button type="submit" className="cc-btn">Filter</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={search || provider || filter !== "all" ? "Nothing matches" : "No history yet"}
          text="Completed, missed and cancelled conferences are kept here with their outcome."
          icon={<IconClock size={17} />}
        />
      ) : (
        <div className="mt-tablewrap">
          <table className="mt-table cf-table">
            <thead>
              <tr>
                <th>When</th><th>Meeting</th><th>With</th><th>How</th><th>Result</th><th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td data-label="When">
                    {dayOf(m.start_at, m.timezone)}<span className="cc-sub">{timeOf(m.start_at, m.timezone)}</span>
                  </td>
                  <td data-label="Meeting">
                    <Link href={detailHref(m.id)} scroll={false} className="cc-strong">{m.title}</Link>
                    <span className="cc-sub">{TYPE_LABELS[m.meeting_type] ?? m.meeting_type}</span>
                  </td>
                  <td data-label="With">{m.contactName || m.attendee_email || DASH}</td>
                  <td data-label="How">{PROVIDER_LABELS[m.provider]}</td>
                  <td data-label="Result">
                    {m.status === "completed" && m.outcome ? (
                      <span className={`cc-chip ${OUTCOME_TONE[m.outcome]}`}>{OUTCOME_LABELS[m.outcome]}</span>
                    ) : (
                      <span className={`cc-chip ${STATUS_TONE[m.status]}`}>{m.status === "no_show" ? "Missed" : STATUS_LABELS[m.status]}</span>
                    )}
                    {m.follow_up_required ? <span className="cc-sub">Follow-up {m.follow_up_date ?? "owed"}</span> : null}
                  </td>
                  <td><Link className="cc-btn is-sm" href={detailHref(m.id)} scroll={false}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="cf-pager" aria-label="History pages">
          {page > 1 ? <Link className="cc-btn is-sm" href={href({ page: page - 1 })} scroll={false}>Previous</Link> : <span />}
          <span className="cc-faint">Page {page} of {pages} · {total} conferences</span>
          {page < pages ? <Link className="cc-btn is-sm" href={href({ page: page + 1 })} scroll={false}>Next</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────

function pct(r: Ratio): string {
  return r.value === null ? DASH : `${Math.round(r.value * 100)}%`;
}
function basis(r: Ratio, noun: string): string {
  return r.denominator === 0 ? "not enough data yet" : `${r.numerator} of ${r.denominator} ${noun}`;
}

export function ConferenceAnalyticsPanel({ a }: { a: ConferenceAnalytics }) {
  const tiles = [
    { label: "Consultations booked", value: String(a.booked), note: `last ${a.windowDays} days` },
    { label: "Consultations completed", value: String(a.completed), note: a.booked ? `${Math.round((a.completed / a.booked) * 100)}% of booked` : "not enough data yet" },
    { label: "No-show rate", value: pct(a.noShowRate), note: basis(a.noShowRate, "held or missed") },
    { label: "Follow-up completion", value: pct(a.followUpCompletion), note: basis(a.followUpCompletion, "follow-up tasks done") },
    { label: "Consultation → proposal", value: pct(a.consultationToProposal), note: basis(a.consultationToProposal, "consulted leads") },
    { label: "Proposal → customer", value: pct(a.proposalToCustomer), note: basis(a.proposalToCustomer, "proposals won") },
  ];
  return (
    <div className="cf-analytics">
      {tiles.map((t) => (
        <div key={t.label} className="cf-stat">
          <span className="cf-stat-label">{t.label}</span>
          <b className="cf-stat-value">{t.value}</b>
          <span className="cf-stat-note">{t.note}</span>
        </div>
      ))}
      <p className="cf-analytics-foot">
        <IconChart size={13} /> Calculated from meeting, task and proposal records. Nothing is estimated.
      </p>
    </div>
  );
}
