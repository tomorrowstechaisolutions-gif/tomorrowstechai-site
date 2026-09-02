import Link from "next/link";
import {
  BUSINESS_TIMEZONE, CATEGORY_LABELS, CATEGORY_TONE,
  EVENT_STATUSES, EVENT_STATUS_LABELS, EVENT_STATUS_TONE,
} from "@/lib/calendar/config";
import { describeRule } from "@/lib/calendar/recurrence";
import type { CalendarEvent, CalendarItem } from "@/lib/calendar/types";
import type { TaskDetail } from "@/lib/tasks/types";
import {
  completeItemAction, deleteCalendarEventAction,
  rescheduleItemAction, setEventStatusAction,
} from "@/app/admin/calendar-actions";
import { toggleChecklistItemAction } from "@/app/admin/task-actions";
import DrawerShell from "../tasks/DrawerShell";
import { ago } from "../format";
import {
  IconAlert, IconCalendar, IconCheck, IconCheckSquare, IconClock,
  IconFile, IconLink, IconMapPin, IconPulse, IconUsers, IconX,
} from "../Icons";

/**
 * The event detail drawer.
 *
 * Server-rendered from whichever record the item came from, opened by an
 * `?item=` parameter rather than a route change — so the grid stays where it
 * was and the back button closes the panel.
 *
 * The checklist and attachments belong to the TASK, not to the calendar. An
 * event about a task shows that task's checklist because it is the same piece
 * of work; a hand-made meeting shows none, because a meeting has no checklist
 * anywhere in this system and inventing tables for one would be the
 * duplication this whole feature exists to avoid.
 */

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: BUSINESS_TIMEZONE, weekday: "long", month: "short", day: "numeric", year: "numeric",
  });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit",
  });
}

function dateInput(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE })
    .format(new Date(iso));
}

function timeInput(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

function durationLabel(item: CalendarItem): string {
  if (item.allDay) return "All day";
  if (!item.end) return clock(item.start);
  const minutes = Math.round(
    (new Date(item.end).getTime() - new Date(item.start).getTime()) / 60000
  );
  const hours = minutes / 60;
  const length = minutes % 60 === 0 ? `${hours}h` : `${minutes}m`;
  return `${clock(item.start)} – ${clock(item.end)} (${length})`;
}

export default function EventDrawer({
  item,
  event,
  task,
  closeHref,
}: {
  item: CalendarItem;
  /** The underlying row, when the calendar owns this one. */
  event: CalendarEvent | null;
  /** The task this is about, when there is one. */
  task: TaskDetail | null;
  closeHref: string;
}) {
  const done = item.status === "completed";
  const checklist = task?.checklist ?? [];
  const checked = checklist.filter((entry) => entry.is_completed).length;
  const attachments = task?.attachments ?? [];
  const events = task?.events ?? [];

  const facts: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <IconCalendar size={13} />, label: "Date", value: longDate(item.start) },
    { icon: <IconClock size={13} />, label: "Time", value: durationLabel(item) },
    {
      icon: <span className={`cal-swatch ${CATEGORY_TONE[item.category]}`} />,
      label: "Calendar",
      value: CATEGORY_LABELS[item.category],
    },
    {
      icon: <IconUsers size={13} />,
      label: "Assigned to",
      value: item.assignedTo ?? "Unassigned",
    },
  ];

  if (item.location) {
    facts.push({ icon: <IconMapPin size={13} />, label: "Location", value: item.location });
  }
  if (event?.recurrence_rule) {
    facts.push({
      icon: <IconPulse size={13} />,
      label: "Repeats",
      value: describeRule(event.recurrence_rule) ?? "Repeats",
    });
  }
  if (event?.reminder_minutes !== null && event?.reminder_minutes !== undefined) {
    facts.push({
      icon: <IconAlert size={13} />,
      label: "Reminder",
      value: event.reminder_minutes === 0
        ? "At the time of the event"
        : `${event.reminder_minutes} minutes before — stored, not yet delivered`,
    });
  }

  return (
    <DrawerShell closeHref={closeHref}>
      <header className="cal-drawer-head">
        <span className={`cal-swatch lg ${CATEGORY_TONE[item.category]}`} aria-hidden="true" />
        <div>
          <h2>{item.title}</h2>
          {item.subtitle ? <p>{item.subtitle}</p> : null}
          <span className="cal-kind">{CATEGORY_LABELS[item.category]}</span>
        </div>
        <Link href={closeHref} scroll={false} className="cc-icon-btn" aria-label="Close">
          <IconX size={14} />
        </Link>
      </header>

      <div className="tk-drawer-body">
        <dl className="cal-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.icon}{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}

          {item.clientName ? (
            <div>
              <dt><IconUsers size={13} />Client</dt>
              <dd>
                {item.clientId ? (
                  <Link href={`/admin/clients/${item.clientId}`}>{item.clientName}</Link>
                ) : item.clientName}
              </dd>
            </div>
          ) : null}

          {item.projectName ? (
            <div>
              <dt><IconFile size={13} />Project</dt>
              <dd>
                {item.projectId ? (
                  <Link href={`/admin/jobs/${item.projectId}`}>{item.projectName}</Link>
                ) : item.projectName}
              </dd>
            </div>
          ) : null}

          {item.proposalNumber ? (
            <div>
              <dt><IconFile size={13} />Proposal</dt>
              <dd>
                <Link href={`/admin/proposals/${item.proposalId}`}>{item.proposalNumber}</Link>
              </dd>
            </div>
          ) : null}

          {item.meetingUrl ? (
            <div>
              <dt><IconLink size={13} />Meeting</dt>
              <dd>
                <a href={item.meetingUrl} target="_blank" rel="noreferrer">Join</a>
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Status — editable only where the calendar owns the row. */}
        <div className="cal-statusrow">
          <span>Status</span>
          {item.source === "event" ? (
            <form action={setEventStatusAction}>
              <input type="hidden" name="item_id" value={item.id} />
              <select name="status" defaultValue={item.status} className="cc-select">
                {EVENT_STATUSES.map((status) => (
                  <option key={status} value={status}>{EVENT_STATUS_LABELS[status]}</option>
                ))}
              </select>
              <button type="submit" className="cc-btn">Set</button>
            </form>
          ) : (
            <span className={`tk-chip ${EVENT_STATUS_TONE[item.status]}`}>
              {EVENT_STATUS_LABELS[item.status]}
            </span>
          )}
        </div>

        {item.notes ? (
          <section className="tk-section">
            <h3>Notes</h3>
            <p className="cal-notes">{item.notes}</p>
          </section>
        ) : null}

        {task ? (
          <section className="tk-section">
            <h3><IconCheckSquare size={13} /> Related task</h3>
            <Link href={`/admin/tasks?task=${task.task.id}`} className="cal-related">
              <b>{task.task.title}</b>
              <span>
                {task.task.due_at ? `Due ${longDate(task.task.due_at)}` : "No due date"}
              </span>
            </Link>
          </section>
        ) : null}

        {checklist.length > 0 ? (
          <section className="tk-section">
            <h3>
              <IconCheckSquare size={13} /> Checklist
              <b>{checked} / {checklist.length}</b>
            </h3>
            <div className="tk-progress">
              <span style={{ width: `${Math.round((checked / checklist.length) * 100)}%` }} />
            </div>
            <ul className="tk-checklist">
              {checklist.map((entry) => (
                <li key={entry.id}>
                  <form action={toggleChecklistItemAction}>
                    <input type="hidden" name="item_id" value={entry.id} />
                    <input type="hidden" name="task_id" value={entry.task_id} />
                    <button
                      type="submit"
                      className={`tk-box sm ${entry.is_completed ? "is-on" : ""}`}
                      aria-label={entry.is_completed ? `Uncheck ${entry.title}` : `Check ${entry.title}`}
                    >
                      {entry.is_completed ? <IconCheck size={9} /> : null}
                    </button>
                  </form>
                  <span className={entry.is_completed ? "is-done" : ""}>{entry.title}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {attachments.length > 0 ? (
          <section className="tk-section">
            <h3><IconFile size={13} /> Attachments<b>{attachments.length}</b></h3>
            <ul className="tk-files">
              {attachments.map((file) => (
                <li key={file.id}>
                  <span className="tk-fileicon">
                    {(file.file_name.split(".").pop() ?? "file").slice(0, 4).toUpperCase()}
                  </span>
                  <div>
                    <a href={`/admin/tasks/attachment/${file.id}`} target="_blank" rel="noreferrer">
                      {file.file_name}
                    </a>
                    <span>
                      {file.file_size
                        ? `${(file.file_size / (1024 * 1024)).toFixed(1)} MB`
                        : ""}
                      {file.mime_type ? ` · ${file.mime_type}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {events.length > 0 ? (
          <section className="tk-section">
            <h3><IconPulse size={13} /> Activity</h3>
            <ol className="tk-activity">
              {events.slice(0, 12).map((entry) => (
                <li key={entry.id}>
                  <b>{entry.event_type.replace(/_/g, " ")}</b>
                  {entry.body ? <span>{entry.body}</span> : null}
                  <i>{ago(entry.created_at)}{entry.actor ? ` · ${entry.actor}` : ""}</i>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {!item.reschedulable ? (
          <p className="cal-locked">
            <IconAlert size={13} />
            This date is owned by the record it comes from, so it cannot be
            moved here. Open that record to change when it happens.
          </p>
        ) : null}
      </div>

      <footer className="tk-drawer-foot">
        {item.projectId ? (
          <Link href={`/admin/jobs/${item.projectId}`} className="cc-btn">Open Project</Link>
        ) : null}
        {item.href && !item.projectId ? (
          <Link href={item.href} className="cc-btn">Open record</Link>
        ) : null}

        {item.reschedulable ? (
          <form action={rescheduleItemAction} className="cal-reschedule">
            <input type="hidden" name="item_id" value={item.id} />
            <input type="date" name="date" defaultValue={dateInput(item.start)}
              className="cc-input" aria-label="New date" />
            {!item.allDay ? (
              <input type="time" name="start_time" defaultValue={timeInput(item.start)}
                className="cc-input" aria-label="New time" />
            ) : null}
            <button type="submit" className="cc-btn">
              <IconClock size={13} /> Reschedule
            </button>
          </form>
        ) : null}

        {["event", "task", "appointment"].includes(item.source) ? (
          <form action={completeItemAction}>
            <input type="hidden" name="item_id" value={item.id} />
            {done ? <input type="hidden" name="reopen" value="1" /> : null}
            <button type="submit" className={`cc-btn ${done ? "" : "primary"}`}>
              <IconCheck size={13} /> {done ? "Reopen" : "Complete"}
            </button>
          </form>
        ) : null}

        {item.source === "event" ? (
          <details className="tk-danger">
            <summary>Delete</summary>
            <p>This removes the event. Anything it was about — the task, the project — is untouched.</p>
            <form action={deleteCalendarEventAction}>
              <input type="hidden" name="event_id" value={item.sourceId.split("@")[0]} />
              <button type="submit" className="cc-btn is-danger">Delete this event</button>
            </form>
          </details>
        ) : null}
      </footer>
    </DrawerShell>
  );
}
