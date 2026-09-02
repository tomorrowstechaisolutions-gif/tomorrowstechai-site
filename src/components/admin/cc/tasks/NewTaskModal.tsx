"use client";

import { useEffect, useState } from "react";
import {
  PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES,
  TASK_TYPES, TYPE_LABELS,
} from "@/lib/tasks/config";
import { IconPlus, IconX } from "../Icons";

/**
 * New Task.
 *
 * A modal rather than a page, for the same reason the detail panel is a
 * drawer: creating a task is something you do in the middle of looking at
 * the list, and losing your place to do it is the thing that stops people
 * writing tasks down.
 */
export default function NewTaskModal({
  action,
  owner,
  owners,
  options,
}: {
  action: (formData: FormData) => void | Promise<void>;
  owner: string;
  owners: string[];
  options: {
    clients: { id: string; name: string }[];
    projects: { id: string; name: string }[];
    leads: { id: string; name: string }[];
    proposals: { id: string; name: string }[];
    services: { id: string; name: string }[];
    parents: { id: string; name: string }[];
  };
}) {
  const [open, setOpen] = useState(false);

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
        <IconPlus size={14} /> New Task
      </button>

      {open ? (
        <>
          <div className="tk-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="tk-modal" role="dialog" aria-label="New task">
            <header>
              <h2>New task</h2>
              <button type="button" className="cc-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                <IconX size={14} />
              </button>
            </header>

            <form action={action} onSubmit={() => setOpen(false)}>
              <label className="tk-stack">
                <span>Task name <i>required</i></span>
                <input name="title" className="cc-input" required autoFocus
                  placeholder="Finalize the Cory proposal" />
              </label>

              <label className="tk-stack">
                <span>Description</span>
                <textarea name="description" className="cc-textarea" rows={3}
                  placeholder="The first line shows under the task name in the list." />
              </label>

              <div className="tk-field-grid">
                <label>
                  <span>Type</span>
                  <select name="type" className="cc-select" defaultValue="internal">
                    {TASK_TYPES.map((type) => (
                      <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select name="priority" className="cc-select" defaultValue="medium">
                    {TASK_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select name="status" className="cc-select" defaultValue="not_started">
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Assigned to</span>
                  <input name="owner" className="cc-input" defaultValue={owner} list="tk-new-owners" />
                  <datalist id="tk-new-owners">
                    {owners.map((entry) => <option key={entry} value={entry} />)}
                  </datalist>
                </label>
                <label>
                  <span>Start date</span>
                  <input type="date" name="start_date" className="cc-input" />
                </label>
                <label>
                  <span>Due date</span>
                  <input type="date" name="due_date" className="cc-input" />
                </label>
                <label>
                  <span>Due time</span>
                  <input type="time" name="due_time" className="cc-input" />
                </label>
                <label>
                  <span>Estimated hours</span>
                  <input name="estimated_hours" className="cc-input" inputMode="decimal" placeholder="—" />
                </label>
                <label>
                  <span>Client</span>
                  <select name="customer_id" className="cc-select" defaultValue="">
                    <option value="">No client</option>
                    {options.clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Project</span>
                  <select name="job_id" className="cc-select" defaultValue="">
                    <option value="">No project</option>
                    {options.projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Proposal</span>
                  <select name="proposal_id" className="cc-select" defaultValue="">
                    <option value="">No proposal</option>
                    {options.proposals.map((proposal) => (
                      <option key={proposal.id} value={proposal.id}>{proposal.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Service / package</span>
                  <select name="service_id" className="cc-select" defaultValue="">
                    <option value="">Not tied to a service</option>
                    {options.services.map((service) => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Lead</span>
                  <select name="lead_id" className="cc-select" defaultValue="">
                    <option value="">No lead</option>
                    {options.leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Parent task</span>
                  <select name="parent_task_id" className="cc-select" defaultValue="">
                    <option value="">Not a subtask</option>
                    {options.parents.map((parent) => (
                      <option key={parent.id} value={parent.id}>{parent.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="tk-stack">
                <span>Waits on</span>
                <select name="depends_on" className="cc-select" defaultValue="">
                  <option value="">Nothing — this can start now</option>
                  {options.parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>{parent.name}</option>
                  ))}
                </select>
              </label>

              <label className="tk-stack">
                <span>Tags</span>
                <input name="tags" className="cc-input" placeholder="Comma separated" />
              </label>

              <footer>
                <button type="button" className="cc-btn" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="cc-btn primary">Create Task</button>
              </footer>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
