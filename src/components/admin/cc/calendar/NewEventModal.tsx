"use client";

import { useEffect, useState } from "react";
import {
  CALENDAR_CATEGORIES, CATEGORY_LABELS, EVENT_STATUSES,
  EVENT_STATUS_LABELS, RECURRENCE_PRESETS, REMINDER_PRESETS,
} from "@/lib/calendar/config";
import { IconPlus, IconX } from "../Icons";

/**
 * New Event.
 *
 * Writes to calendar_events — the one table the calendar owns. Everything
 * else on this page belongs to a task, a project, a proposal or a renewal and
 * is created where it lives, which is why this form has no "type: task"
 * shortcut that would quietly make a second copy of one.
 */
export default function NewEventModal({
  action,
  owner,
  people,
  defaultDate,
  options,
}: {
  action: (formData: FormData) => void | Promise<void>;
  owner: string;
  people: string[];
  defaultDate: string;
  options: {
    clients: { id: string; name: string }[];
    projects: { id: string; name: string }[];
    proposals: { id: string; name: string }[];
    leads: { id: string; name: string }[];
    tasks: { id: string; name: string }[];
  };
}) {
  const [open, setOpen] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [repeats, setRepeats] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="cc-btn primary" onClick={() => setOpen(true)}>
        <IconPlus size={14} /> New Event
      </button>

      {open ? (
        <>
          <div className="tk-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="tk-modal" role="dialog" aria-label="New event">
            <header>
              <h2>New event</h2>
              <button type="button" className="cc-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                <IconX size={14} />
              </button>
            </header>

            <form action={action} onSubmit={() => setOpen(false)}>
              <label className="tk-stack">
                <span>Event title <i>required</i></span>
                <input name="title" className="cc-input" required autoFocus
                  placeholder="Homepage review — The Key Konnect" />
              </label>

              <label className="tk-stack">
                <span>Description</span>
                <textarea name="description" className="cc-textarea" rows={3} />
              </label>

              <div className="tk-field-grid">
                <label>
                  <span>Calendar</span>
                  <select name="event_type" className="cc-select" defaultValue="meeting">
                    {CALENDAR_CATEGORIES
                      .filter((category) => category !== "domain")
                      .map((category) => (
                        <option key={category} value={category}>
                          {CATEGORY_LABELS[category]}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>Assigned to</span>
                  <input name="assigned_to" className="cc-input" defaultValue={owner}
                    list="cal-people" />
                  <datalist id="cal-people">
                    {people.map((person) => <option key={person} value={person} />)}
                  </datalist>
                </label>

                <label>
                  <span>Date <i>required</i></span>
                  <input type="date" name="date" className="cc-input" required
                    defaultValue={defaultDate} />
                </label>
                <label className="cal-allday-toggle">
                  <span>All day</span>
                  <input type="checkbox" name="all_day" checked={allDay}
                    onChange={(event) => setAllDay(event.target.checked)} />
                </label>

                {!allDay ? (
                  <>
                    <label>
                      <span>Start time</span>
                      <input type="time" name="start_time" className="cc-input" defaultValue="09:00" />
                    </label>
                    <label>
                      <span>End time</span>
                      <input type="time" name="end_time" className="cc-input" defaultValue="10:00" />
                    </label>
                  </>
                ) : null}

                <label>
                  <span>Client</span>
                  <select name="client_id" className="cc-select" defaultValue="">
                    <option value="">No client</option>
                    {options.clients.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Project</span>
                  <select name="project_id" className="cc-select" defaultValue="">
                    <option value="">No project</option>
                    {options.projects.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Proposal</span>
                  <select name="proposal_id" className="cc-select" defaultValue="">
                    <option value="">No proposal</option>
                    {options.proposals.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Related task</span>
                  <select name="task_id" className="cc-select" defaultValue="">
                    <option value="">No task</option>
                    {options.tasks.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Lead</span>
                  <select name="lead_id" className="cc-select" defaultValue="">
                    <option value="">No lead</option>
                    {options.leads.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Status</span>
                  <select name="status" className="cc-select" defaultValue="scheduled">
                    {EVENT_STATUSES.map((status) => (
                      <option key={status} value={status}>{EVENT_STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select name="priority" className="cc-select" defaultValue="medium">
                    <option value="critical">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>

                <label>
                  <span>Repeats</span>
                  <select name="recurrence_rule" className="cc-select" value={repeats}
                    onChange={(event) => setRepeats(event.target.value)}>
                    {RECURRENCE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>{preset.label}</option>
                    ))}
                  </select>
                </label>
                {repeats ? (
                  <label>
                    <span>Repeat until</span>
                    <input type="date" name="recurrence_until" className="cc-input" />
                  </label>
                ) : null}

                <label>
                  <span>Reminder</span>
                  <select name="reminder_minutes" className="cc-select" defaultValue="">
                    {REMINDER_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>{preset.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="tk-field-grid">
                <label>
                  <span>Location</span>
                  <input name="location" className="cc-input" placeholder="Zoom, or an address" />
                </label>
                <label>
                  <span>Meeting URL</span>
                  <input name="meeting_url" type="url" className="cc-input"
                    placeholder="https://" />
                </label>
              </div>

              <label className="tk-stack">
                <span>Tags</span>
                <input name="tags" className="cc-input" placeholder="Comma separated" />
              </label>

              <p className="cc-note">
                Reminders are stored with the event. Nothing sends them yet —
                this app has no notification service, and pretending otherwise
                would be worse than saying so.
              </p>

              <footer>
                <button type="button" className="cc-btn" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="cc-btn primary">Create Event</button>
              </footer>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
