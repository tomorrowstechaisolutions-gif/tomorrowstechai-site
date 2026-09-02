import Link from "next/link";
import {
  PRIORITY_LABELS, PRIORITY_TONE, STATUS_LABELS, STATUS_TONE,
  TASK_PRIORITIES, TASK_STATUSES, TASK_TABS, TYPE_LABELS, TYPE_TONE,
} from "@/lib/tasks/config";
import type { TaskWorkspace } from "@/lib/tasks/queries";
import type { TaskListRow } from "@/lib/tasks/types";
import type { TaskGroup, TaskTab } from "@/lib/tasks/config";
import {
  completeTaskAction, setTaskPriorityAction, setTaskStatusAction,
} from "@/app/admin/task-actions";
import TaskToolbar from "../tasks/TaskToolbar";
import TaskBoardView from "../tasks/TaskBoardView";
import InlinePicker from "../tasks/InlinePicker";
import { EmptyState } from "../Panel";
import { DASH } from "../format";
import {
  IconAlert, IconCalendar, IconCheck, IconCheckSquare, IconClock,
  IconFile, IconUsers,
} from "../Icons";

/**
 * The Tasks board.
 *
 * The KPI cards count the whole table, deliberately, while the list below
 * respects the tab and the filters. A card that changed when you filtered
 * would be answering a different question from the one it is labelled with.
 */

const STATUS_OPTIONS = TASK_STATUSES.map((status) => ({
  value: status,
  label: STATUS_LABELS[status],
  className: STATUS_TONE[status],
}));

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
  className: PRIORITY_TONE[priority],
}));

/** "Today", "Tomorrow", "Sep 4" — and never a bare ISO string. */
function dueLabel(row: TaskListRow): { text: string; tone: "" | "due" | "late" } {
  if (!row.dueAt) return { text: "No date", tone: "" };

  const due = new Date(row.dueAt);
  const dayOf = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(date);

  const today = dayOf(new Date());
  const target = dayOf(due);
  const tomorrow = dayOf(new Date(Date.now() + 86_400_000));

  if (row.overdue && target < today) return { text: "Overdue", tone: "late" };
  if (target === today) return { text: "Today", tone: "due" };
  if (target === tomorrow) return { text: "Tomorrow", tone: "due" };

  return {
    text: due.toLocaleDateString("en-US", {
      month: "short", day: "numeric", timeZone: "America/Chicago",
    }),
    tone: "",
  };
}

function shortName(email: string | null): string {
  if (!email) return DASH;
  const name = email.split("@")[0].replace(/[._-]+/g, " ");
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].replace(/^./, (c) => c.toUpperCase());
  return `${parts[0].replace(/^./, (c) => c.toUpperCase())} ${parts[1][0].toUpperCase()}.`;
}

function initialsOf(email: string | null): string {
  if (!email) return "?";
  const parts = email.split("@")[0].split(/[._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Groups the current page. Grouping is a way of reading a list, not a query. */
function groupRows(rows: TaskListRow[], group: TaskGroup): { key: string; label: string; rows: TaskListRow[] }[] {
  if (group === "none") return [{ key: "all", label: "", rows }];

  const buckets = new Map<string, { label: string; rows: TaskListRow[] }>();
  for (const row of rows) {
    const [key, label] =
      group === "status" ? [row.status, STATUS_LABELS[row.status]]
      : group === "priority" ? [row.priority, PRIORITY_LABELS[row.priority]]
      : group === "type" ? [row.type, TYPE_LABELS[row.type]]
      : [row.clientId ?? "none", row.clientName ?? "No client"];

    const bucket = buckets.get(key) ?? { label, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => ({
    key, label: bucket.label, rows: bucket.rows,
  }));
}

const EMPTY_BY_TAB: Record<TaskTab, { title: string; text: string }> = {
  mine: { title: "Nothing assigned to you", text: "Every open task belongs to somebody else right now." },
  all: { title: "No open tasks", text: "Everything is done. New work arrives here as it is created, or automatically when a project starts." },
  today: { title: "No tasks due today", text: "You're caught up." },
  upcoming: { title: "Nothing scheduled ahead", text: "No task has a due date later than today." },
  waiting: { title: "No waiting tasks", text: "Nothing is sitting with somebody else." },
  completed: { title: "No completed tasks yet", text: "Finished work shows up here with the date it was closed." },
};

export default function TasksBoard({
  board,
  tab,
  view,
  group,
  query,
}: {
  board: TaskWorkspace;
  tab: TaskTab;
  view: "table" | "board";
  group: TaskGroup;
  /** The current query string, so links keep the filters you are looking at. */
  query: string;
}) {
  const { kpis } = board;

  const cards = [
    {
      label: "Due Today", value: kpis.dueToday, icon: IconCalendar, tone: "is-due",
      foot: kpis.dueTodayUrgent > 0
        ? `${kpis.dueTodayUrgent} high or urgent`
        : "Nothing urgent among them",
    },
    {
      label: "Overdue", value: kpis.overdue, icon: IconClock, tone: kpis.overdue > 0 ? "is-late" : "",
      foot: kpis.overdueUrgent > 0 ? `${kpis.overdueUrgent} urgent` : "None urgent",
    },
    {
      label: "This Week", value: kpis.thisWeek, icon: IconCheckSquare, tone: "",
      foot: `${kpis.thisWeekDone} already done`,
    },
    {
      label: "Waiting", value: kpis.waiting, icon: IconUsers, tone: kpis.waiting > 0 ? "is-wait" : "",
      foot: "On someone else",
    },
    {
      label: "Completed", value: kpis.completedThisWeek, icon: IconCheck, tone: "is-ok",
      foot: "This week",
    },
  ];

  const linkFor = (row: TaskListRow) => {
    const params = new URLSearchParams(query);
    params.set("task", row.id);
    return `/admin/tasks?${params.toString()}`;
  };

  const tabHref = (key: TaskTab) => {
    const params = new URLSearchParams(query);
    if (key === "mine") params.delete("tab");
    else params.set("tab", key);
    params.delete("page");
    params.delete("task");
    return `/admin/tasks${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const pageHref = (page: number) => {
    const params = new URLSearchParams(query);
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    return `/admin/tasks?${params.toString()}`;
  };

  const groups = groupRows(board.rows, group);
  const empty = EMPTY_BY_TAB[tab];
  const filtered = Boolean(
    new URLSearchParams(query).get("q") ||
    ["status", "type", "priority", "owner", "client", "project"]
      .some((key) => new URLSearchParams(query).get(key))
  );

  return (
    <>
      <div className="cc-kpis tk-kpis">
        {cards.map(({ label, value, foot, icon: Icon, tone }) => (
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

      <TaskToolbar owners={board.owners} clients={board.clients} projects={board.projects} />

      <nav className="tk-tabs" aria-label="Task views">
        {TASK_TABS.map((entry) => {
          const count = board.tabCounts[entry.key];
          const showCount = count !== null && count > 0
            && ["today", "waiting", "mine", "upcoming"].includes(entry.key);
          return (
            <Link
              key={entry.key}
              href={tabHref(entry.key)}
              className={`tk-tab ${tab === entry.key ? "is-on" : ""}`}
              scroll={false}
            >
              {entry.label}
              {showCount ? <span className="tk-tab-n">{count}</span> : null}
            </Link>
          );
        })}
      </nav>

      {board.rows.length === 0 ? (
        <section className="cc-panel">
          <div className="cc-panel-body">
            <EmptyState
              title={filtered ? "No tasks match these filters" : empty.title}
              text={filtered ? "Clear the filters to see the whole list again." : empty.text}
              icon={<IconCheckSquare size={17} />}
            />
          </div>
        </section>
      ) : view === "board" ? (
        <TaskBoardView rows={board.rows} query={query} action={setTaskStatusAction} />
      ) : (
        <section className="cc-panel tk-tablepanel">
          <div className="cc-scroll">
            <table className="cc-table dense tk-table">
              <thead>
                <tr>
                  <th className="tk-check" aria-label="Complete" />
                  <th>Task</th>
                  <th>Client / Project</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Assigned</th>
                  <th>Status</th>
                </tr>
              </thead>
              {groups.map((bucket) => (
                <tbody key={bucket.key}>
                  {bucket.label ? (
                    <tr className="tk-grouprow">
                      <td colSpan={8}>
                        {bucket.label}
                        <span>{bucket.rows.length}</span>
                      </td>
                    </tr>
                  ) : null}

                  {bucket.rows.map((row) => {
                    const due = dueLabel(row);
                    const done = row.status === "completed";
                    return (
                      <tr key={row.id} className={done ? "is-done" : ""}>
                        <td className="tk-check">
                          <form action={completeTaskAction}>
                            <input type="hidden" name="task_id" value={row.id} />
                            {done ? <input type="hidden" name="reopen" value="1" /> : null}
                            <button
                              type="submit"
                              className={`tk-box ${done ? "is-on" : ""}`}
                              aria-label={done ? `Reopen ${row.title}` : `Complete ${row.title}`}
                            >
                              {done ? <IconCheck size={11} /> : null}
                            </button>
                          </form>
                        </td>

                        <td className="tk-titlecell">
                          <Link href={linkFor(row)} scroll={false} className="tk-title">
                            {row.title}
                          </Link>
                          {row.subtitle ? <span className="tk-sub">{row.subtitle}</span> : null}
                          <span className="tk-meta">
                            {row.checklistTotal > 0 ? (
                              <i><IconCheckSquare size={10} /> {row.checklistDone}/{row.checklistTotal}</i>
                            ) : null}
                            {row.subtaskCount > 0 ? <i>{row.subtaskCount} subtasks</i> : null}
                            {row.commentCount > 0 ? <i>{row.commentCount} comments</i> : null}
                            {row.attachmentCount > 0 ? <i><IconFile size={10} /> {row.attachmentCount}</i> : null}
                            {row.status === "blocked" && row.blockedReason ? (
                              <i className="is-risk"><IconAlert size={10} /> {row.blockedReason}</i>
                            ) : null}
                          </span>
                        </td>

                        <td>
                          {row.clientName ? (
                            <>
                              <span className="cc-client-name">{row.clientName}</span>
                              {row.projectName ? (
                                <span className="cc-client-sub">{row.projectName}</span>
                              ) : null}
                            </>
                          ) : row.projectName ? (
                            <span className="cc-client-name">{row.projectName}</span>
                          ) : (
                            <span className="cc-client-sub">Internal</span>
                          )}
                        </td>

                        <td>
                          <span className={`tk-chip ${TYPE_TONE[row.type]}`}>
                            {TYPE_LABELS[row.type]}
                          </span>
                        </td>

                        <td>
                          <InlinePicker
                            action={setTaskPriorityAction}
                            taskId={row.id}
                            field="priority"
                            current={row.priority}
                            label={PRIORITY_LABELS[row.priority]}
                            className={PRIORITY_TONE[row.priority]}
                            options={PRIORITY_OPTIONS}
                          />
                        </td>

                        <td>
                          <span className={`tk-due ${due.tone ? `is-${due.tone}` : ""}`}>
                            {due.text}
                          </span>
                        </td>

                        <td>
                          {row.owner ? (
                            <span className="tk-assignee">
                              <span className="tk-avatar">{initialsOf(row.owner)}</span>
                              {shortName(row.owner)}
                            </span>
                          ) : (
                            <span className="cc-client-sub">Unassigned</span>
                          )}
                        </td>

                        <td>
                          <InlinePicker
                            action={setTaskStatusAction}
                            taskId={row.id}
                            field="status"
                            current={row.status}
                            label={STATUS_LABELS[row.status]}
                            className={STATUS_TONE[row.status]}
                            options={STATUS_OPTIONS}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>

          <div className="cc-panel-foot tk-foot">
            <span className="cc-faint">
              Showing {(board.page - 1) * 25 + 1} to{" "}
              {Math.min(board.page * 25, board.total)} of {board.total} tasks
            </span>
            {board.pageCount > 1 ? (
              <nav className="cc-pager" aria-label="Pages">
                {board.page > 1 ? (
                  <Link href={pageHref(board.page - 1)} scroll={false}>Previous</Link>
                ) : null}
                <span>{board.page} / {board.pageCount}</span>
                {board.page < board.pageCount ? (
                  <Link href={pageHref(board.page + 1)} scroll={false}>Next</Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </section>
      )}
    </>
  );
}
