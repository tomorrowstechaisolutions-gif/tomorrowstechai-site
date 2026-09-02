import Link from "next/link";
import {
  PRIORITY_LABELS, PRIORITY_TONE, STATUS_LABELS, STATUS_TONE,
  TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, TYPE_LABELS, TYPE_TONE,
} from "@/lib/tasks/config";
import type { TaskDetail } from "@/lib/tasks/types";
import {
  addChecklistItemAction, addSubtaskAction, addTaskCommentAction,
  addTaskDependencyAction, completeTaskAction, deleteChecklistItemAction,
  deleteTaskAction, deleteTaskAttachmentAction, deleteTaskCommentAction,
  removeTaskDependencyAction, rescheduleTaskAction, toggleChecklistItemAction,
  updateTaskAction, uploadTaskAttachmentAction,
} from "@/app/admin/task-actions";
import DrawerShell from "./DrawerShell";
import { ago } from "../format";
import {
  IconAlert, IconCheck, IconCheckSquare, IconClock, IconFile,
  IconMail, IconPlus, IconPulse, IconX,
} from "../Icons";

/**
 * The task detail drawer.
 *
 * Server-rendered from the task's own row, opened by a `?task=` parameter
 * rather than a route change — so the list stays exactly where it was, the
 * back button closes the drawer, and a link to a task is a link somebody can
 * send. Nothing here is fetched in the browser.
 */

function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateInput(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" })
    .format(new Date(iso));
}

function stamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function TaskDrawer({
  detail,
  closeHref,
  options,
  owners,
}: {
  detail: TaskDetail;
  closeHref: string;
  options: {
    clients: { id: string; name: string }[];
    projects: { id: string; name: string }[];
    leads: { id: string; name: string }[];
    proposals: { id: string; name: string }[];
    services: { id: string; name: string }[];
    parents: { id: string; name: string }[];
  };
  owners: string[];
}) {
  const { task, checklist, comments, attachments, events, dependsOn, blocking, subtasks } = detail;
  const done = task.status === "completed";
  const checkedCount = checklist.filter((item) => item.is_completed).length;
  const progress = checklist.length > 0
    ? Math.round((checkedCount / checklist.length) * 100)
    : 0;

  const openBlockers = dependsOn.filter(
    (item) => item.status !== "completed" && item.status !== "canceled"
  );

  return (
    <DrawerShell closeHref={closeHref}>
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="tk-drawer-head">
        <form action={completeTaskAction}>
          <input type="hidden" name="task_id" value={task.id} />
          {done ? <input type="hidden" name="reopen" value="1" /> : null}
          <button
            type="submit"
            className={`tk-box ${done ? "is-on" : ""}`}
            aria-label={done ? "Reopen this task" : "Complete this task"}
          >
            {done ? <IconCheck size={11} /> : null}
          </button>
        </form>

        <div>
          <h2>{task.title}</h2>
          {task.notes ? <p>{task.notes.split("\n")[0]}</p> : null}
        </div>

        <Link href={closeHref} scroll={false} className="cc-icon-btn" aria-label="Close">
          <IconX size={14} />
        </Link>
      </header>

      {openBlockers.length > 0 ? (
        <p className="tk-blocked">
          <IconAlert size={13} />
          Waiting on {openBlockers.map((item) => item.title).join(", ")}.
        </p>
      ) : null}

      <div className="tk-drawer-body">
        {/* ── Fields ──────────────────────────────────────────── */}
        <form action={updateTaskAction} className="tk-fields" id="task-fields">
          <input type="hidden" name="task_id" value={task.id} />

          <div className="tk-field-grid">
            <label>
              <span>Status</span>
              <select name="status" defaultValue={task.status} className="cc-select">
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select name="priority" defaultValue={task.priority} className="cc-select">
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Due date</span>
              <input type="date" name="due_date" defaultValue={dateInput(task.due_at)} className="cc-input" />
            </label>
            <label>
              <span>Due time</span>
              <input type="time" name="due_time" defaultValue={task.due_time?.slice(0, 5) ?? ""} className="cc-input" />
            </label>
            <label>
              <span>Type</span>
              <select name="type" defaultValue={task.type} className="cc-select">
                {TASK_TYPES.map((type) => (
                  <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Assigned to</span>
              <input
                name="owner" defaultValue={task.owner ?? ""} className="cc-input"
                list="tk-owners" placeholder="Unassigned"
              />
              <datalist id="tk-owners">
                {owners.map((owner) => <option key={owner} value={owner} />)}
              </datalist>
            </label>
            <label>
              <span>Client</span>
              <select name="customer_id" defaultValue={task.customer_id ?? ""} className="cc-select">
                <option value="">No client</option>
                {options.clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Project</span>
              <select name="job_id" defaultValue={task.job_id ?? ""} className="cc-select">
                <option value="">No project</option>
                {options.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Proposal</span>
              <select name="proposal_id" defaultValue={task.proposal_id ?? ""} className="cc-select">
                <option value="">No proposal</option>
                {options.proposals.map((proposal) => (
                  <option key={proposal.id} value={proposal.id}>{proposal.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Service / package</span>
              <select name="service_id" defaultValue={task.service_id ?? ""} className="cc-select">
                <option value="">Not tied to a service</option>
                {options.services.map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Lead</span>
              <select name="lead_id" defaultValue={task.lead_id ?? ""} className="cc-select">
                <option value="">No lead</option>
                {options.leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Start date</span>
              <input type="date" name="start_date" defaultValue={task.start_date ?? ""} className="cc-input" />
            </label>
            <label>
              <span>Estimated hours</span>
              <input name="estimated_hours" inputMode="decimal" className="cc-input"
                defaultValue={task.estimated_hours ?? ""} placeholder="—" />
            </label>
            <label>
              <span>Actual hours</span>
              <input name="actual_hours" inputMode="decimal" className="cc-input"
                defaultValue={task.actual_hours ?? ""} placeholder="—" />
            </label>
          </div>

          <label className="tk-stack">
            <span>Tags</span>
            <input name="tags" className="cc-input" defaultValue={task.tags.join(", ")}
              placeholder="Comma separated" />
          </label>

          <label className="tk-stack">
            <span>Blocked because</span>
            <input name="blocked_reason" className="cc-input" defaultValue={task.blocked_reason ?? ""}
              placeholder="Only used when the status is Blocked" />
          </label>

          <label className="tk-stack">
            <span>Description</span>
            <textarea name="description" className="cc-textarea" rows={5}
              defaultValue={task.notes ?? ""} />
          </label>

          <div className="tk-titlefield">
            <input name="title" className="cc-input" defaultValue={task.title} required
              aria-label="Task name" />
            <button type="submit" className="cc-btn primary">Save changes</button>
          </div>
        </form>

        {/* ── Checklist ───────────────────────────────────────── */}
        <section className="tk-section">
          <h3>
            <IconCheckSquare size={13} /> Checklist
            {checklist.length > 0 ? <b>{checkedCount} / {checklist.length}</b> : null}
          </h3>

          {checklist.length > 0 ? (
            <div className="tk-progress" role="progressbar" aria-valuenow={progress}
              aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}

          <ul className="tk-checklist">
            {checklist.map((item) => (
              <li key={item.id}>
                <form action={toggleChecklistItemAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="task_id" value={task.id} />
                  <button type="submit" className={`tk-box sm ${item.is_completed ? "is-on" : ""}`}
                    aria-label={item.is_completed ? `Uncheck ${item.title}` : `Check ${item.title}`}>
                    {item.is_completed ? <IconCheck size={9} /> : null}
                  </button>
                </form>
                <span className={item.is_completed ? "is-done" : ""}>{item.title}</span>
                <form action={deleteChecklistItemAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="task_id" value={task.id} />
                  <button type="submit" className="cc-icon-btn" aria-label={`Remove ${item.title}`}>
                    <IconX size={11} />
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <form action={addChecklistItemAction} className="tk-addrow">
            <input type="hidden" name="task_id" value={task.id} />
            <input name="title" className="cc-input" placeholder="Add a checklist item" required />
            <button type="submit" className="cc-btn"><IconPlus size={12} /></button>
          </form>
        </section>

        {/* ── Subtasks and dependencies ───────────────────────── */}
        <section className="tk-section">
          <h3><IconCheckSquare size={13} /> Subtasks</h3>
          {subtasks.length === 0 ? (
            <p className="cc-note">No subtasks. A subtask is its own task with its own due date.</p>
          ) : (
            <ul className="tk-linklist">
              {subtasks.map((sub) => (
                <li key={sub.id}>
                  <Link href={`/admin/tasks?task=${sub.id}`} scroll={false}>{sub.title}</Link>
                  <span className={`tk-chip ${STATUS_TONE[sub.status]}`}>{STATUS_LABELS[sub.status]}</span>
                </li>
              ))}
            </ul>
          )}

          <form action={addSubtaskAction} className="tk-addrow">
            <input type="hidden" name="task_id" value={task.id} />
            <input name="title" className="cc-input" placeholder="Add a subtask" required />
            <button type="submit" className="cc-btn"><IconPlus size={12} /></button>
          </form>

          <h3 className="tk-sub-h"><IconAlert size={13} /> Dependencies</h3>
          {dependsOn.length === 0 && blocking.length === 0 ? (
            <p className="cc-note">Nothing depends on this, and it waits on nothing.</p>
          ) : null}

          {dependsOn.length > 0 ? (
            <ul className="tk-linklist">
              {dependsOn.map((item) => (
                <li key={item.id}>
                  <span className="tk-dep-label">Waits on</span>
                  <Link href={`/admin/tasks?task=${item.id}`} scroll={false}>{item.title}</Link>
                  <form action={removeTaskDependencyAction}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="depends_on" value={item.id} />
                    <button type="submit" className="cc-icon-btn" aria-label="Remove dependency">
                      <IconX size={11} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          {blocking.length > 0 ? (
            <ul className="tk-linklist">
              {blocking.map((item) => (
                <li key={item.id}>
                  <span className="tk-dep-label">Blocks</span>
                  <Link href={`/admin/tasks?task=${item.id}`} scroll={false}>{item.title}</Link>
                </li>
              ))}
            </ul>
          ) : null}

          <form action={addTaskDependencyAction} className="tk-addrow">
            <input type="hidden" name="task_id" value={task.id} />
            <select name="depends_on" className="cc-select" required defaultValue="">
              <option value="" disabled>This task waits on…</option>
              {options.parents
                .filter((option) => option.id !== task.id)
                .map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
            </select>
            <button type="submit" className="cc-btn"><IconPlus size={12} /></button>
          </form>
        </section>

        {/* ── Attachments ─────────────────────────────────────── */}
        <section className="tk-section">
          <h3><IconFile size={13} /> Attachments{attachments.length > 0 ? <b>{attachments.length}</b> : null}</h3>

          {attachments.length === 0 ? (
            <p className="cc-note">No files yet.</p>
          ) : (
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
                    <span>{[fileSize(file.file_size), file.mime_type].filter(Boolean).join(" · ")}</span>
                  </div>
                  <form action={deleteTaskAttachmentAction}>
                    <input type="hidden" name="attachment_id" value={file.id} />
                    <input type="hidden" name="task_id" value={task.id} />
                    <button type="submit" className="cc-icon-btn" aria-label={`Remove ${file.file_name}`}>
                      <IconX size={11} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={uploadTaskAttachmentAction} className="tk-addrow">
            <input type="hidden" name="task_id" value={task.id} />
            <input type="file" name="file" className="cc-input" required />
            <button type="submit" className="cc-btn">Upload</button>
          </form>
        </section>

        {/* ── Comments ────────────────────────────────────────── */}
        <section className="tk-section">
          <h3><IconMail size={13} /> Comments{comments.length > 0 ? <b>{comments.length}</b> : null}</h3>

          {comments.length === 0 ? (
            <p className="cc-note">No comments yet.</p>
          ) : (
            <ul className="tk-comments">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <span className="tk-avatar">{comment.author.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <b>{comment.author}<i>{ago(comment.created_at)}</i></b>
                    <p>{comment.comment}</p>
                  </div>
                  <form action={deleteTaskCommentAction}>
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <input type="hidden" name="task_id" value={task.id} />
                    <button type="submit" className="cc-icon-btn" aria-label="Delete comment">
                      <IconX size={11} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={addTaskCommentAction} className="tk-addrow">
            <input type="hidden" name="task_id" value={task.id} />
            <input name="comment" className="cc-input" placeholder="Add a comment…" required />
            <button type="submit" className="cc-btn">Post</button>
          </form>
        </section>

        {/* ── Activity ────────────────────────────────────────── */}
        <section className="tk-section">
          <h3><IconPulse size={13} /> Activity</h3>
          {events.length === 0 ? (
            <p className="cc-note">Nothing recorded yet.</p>
          ) : (
            <ol className="tk-activity">
              {events.map((event) => (
                <li key={event.id}>
                  <b>{event.event_type.replace(/_/g, " ")}</b>
                  {event.body ? <span>{event.body}</span> : null}
                  <i>{stamp(event.created_at)}{event.actor ? ` · ${event.actor}` : ""}</i>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* ── Actions ───────────────────────────────────────────── */}
      <footer className="tk-drawer-foot">
        <form action={completeTaskAction}>
          <input type="hidden" name="task_id" value={task.id} />
          {done ? <input type="hidden" name="reopen" value="1" /> : null}
          <button type="submit" className={`cc-btn ${done ? "" : "primary"}`}>
            <IconCheck size={13} /> {done ? "Reopen task" : "Complete Task"}
          </button>
        </form>

        <form action={rescheduleTaskAction} className="tk-reschedule">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="date" name="due_date" defaultValue={dateInput(task.due_at)}
            className="cc-input" aria-label="New due date" />
          <button type="submit" className="cc-btn"><IconClock size={13} /> Reschedule</button>
        </form>

        <form action={addSubtaskAction} className="tk-quicksub">
          <input type="hidden" name="task_id" value={task.id} />
          <input name="title" className="cc-input" placeholder="New subtask" required />
          <button type="submit" className="cc-btn"><IconPlus size={13} /> Add Subtask</button>
        </form>

        {/* The one destructive action, and the only one that confirms. */}
        <details className="tk-danger">
          <summary>Delete</summary>
          <p>Deleting removes the task, its checklist, comments, attachments and history. There is no undo.</p>
          <form action={deleteTaskAction}>
            <input type="hidden" name="task_id" value={task.id} />
            <button type="submit" className="cc-btn is-danger">Delete this task</button>
          </form>
        </details>
      </footer>

      <div className="tk-drawer-tags">
        <span className={`tk-chip ${TYPE_TONE[task.type]}`}>{TYPE_LABELS[task.type]}</span>
        <span className={`tk-chip ${PRIORITY_TONE[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
        <span className={`tk-chip ${STATUS_TONE[task.status]}`}>{STATUS_LABELS[task.status]}</span>
        {detail.proposalNumber ? <span className="tk-chip tk-t-blue">{detail.proposalNumber}</span> : null}
        {detail.parentTitle ? <span className="cc-note">Subtask of {detail.parentTitle}</span> : null}
      </div>
    </DrawerShell>
  );
}
