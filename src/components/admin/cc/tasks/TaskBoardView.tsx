"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BOARD_COLUMNS, PRIORITY_LABELS, PRIORITY_TONE, STATUS_LABELS,
  TYPE_LABELS, TYPE_TONE, columnFor, type BoardColumnKey,
} from "@/lib/tasks/config";
import type { TaskListRow } from "@/lib/tasks/types";

/**
 * The kanban board.
 *
 * Drag and drop is the browser's own HTML5 API rather than a library: the
 * build machine that maintains this repo has no package-registry access, so
 * adding a dependency means a lockfile that can only be updated somewhere
 * else — and what this needs is four event handlers.
 *
 * Dropping a card calls the same server action the table's status chip calls,
 * so a card moved here writes the same task_events row as a status changed
 * anywhere else. The card moves optimistically and is put back if the write
 * fails, because a card that snaps back with no explanation is worse than one
 * that never moved.
 *
 * Every card is also a link, and every column has a keyboard-reachable menu,
 * so the board is fully usable without dragging anything.
 */
export default function TaskBoardView({
  rows,
  query,
  action,
}: {
  rows: TaskListRow[];
  query: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<BoardColumnKey | null>(null);
  const [moved, setMoved] = useState<Record<string, BoardColumnKey>>({});
  const [error, setError] = useState<string | null>(null);

  const linkFor = (id: string) => {
    const params = new URLSearchParams(query);
    params.set("task", id);
    return `/admin/tasks?${params.toString()}`;
  };

  const columnOf = (row: TaskListRow): BoardColumnKey | null =>
    moved[row.id] ?? columnFor(row.status);

  const move = (taskId: string, column: BoardColumnKey) => {
    const target = BOARD_COLUMNS.find((entry) => entry.key === column);
    const row = rows.find((entry) => entry.id === taskId);
    if (!target || !row) return;
    if (columnOf(row) === column) return;

    const previous = moved[taskId];
    setMoved((state) => ({ ...state, [taskId]: column }));
    setError(null);

    const formData = new FormData();
    formData.set("task_id", taskId);
    formData.set("status", target.dropStatus);

    startTransition(async () => {
      try {
        await action(formData);
        router.refresh();
      } catch {
        setMoved((state) => {
          const next = { ...state };
          if (previous) next[taskId] = previous;
          else delete next[taskId];
          return next;
        });
        setError("That move did not save. The card has been put back.");
      }
    });
  };

  return (
    <>
      {error ? <p className="tk-board-error">{error}</p> : null}

      <div className="tk-board">
        {BOARD_COLUMNS.map((column) => {
          const cards = rows.filter((row) => columnOf(row) === column.key);
          return (
            <section
              key={column.key}
              className={`tk-col ${over === column.key ? "is-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(column.key);
              }}
              onDragLeave={() => setOver((current) => (current === column.key ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                const id = event.dataTransfer.getData("text/plain") || dragging;
                if (id) move(id, column.key);
                setDragging(null);
              }}
            >
              <header className="tk-col-head">
                <b>{column.label}</b>
                <span>{cards.length}</span>
              </header>

              <div className="tk-col-body">
                {cards.length === 0 ? (
                  <p className="tk-col-empty">Nothing here.</p>
                ) : null}

                {cards.map((row) => (
                  <article
                    key={row.id}
                    className={`tk-card ${dragging === row.id ? "is-dragging" : ""}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", row.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(row.id);
                    }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                  >
                    <Link href={linkFor(row.id)} scroll={false} className="tk-card-title">
                      {row.title}
                    </Link>

                    {row.clientName || row.projectName ? (
                      <span className="tk-card-client">
                        {[row.clientName, row.projectName].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}

                    <div className="tk-card-foot">
                      <span className={`tk-chip ${TYPE_TONE[row.type]}`}>
                        {TYPE_LABELS[row.type]}
                      </span>
                      <span className={`tk-chip ${PRIORITY_TONE[row.priority]}`}>
                        {PRIORITY_LABELS[row.priority]}
                      </span>
                      {row.status === "blocked" ? (
                        <span className="tk-chip tk-s-risk">Blocked</span>
                      ) : null}
                    </div>

                    <div className="tk-card-meta">
                      <span className={row.overdue ? "is-late" : ""}>
                        {row.dueAt
                          ? new Date(row.dueAt).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", timeZone: "America/Chicago",
                            })
                          : "No date"}
                      </span>
                      {row.owner ? <span className="tk-avatar">{initials(row.owner)}</span> : null}
                    </div>

                    {/* Keyboard and touch path: dragging is never the only way. */}
                    <label className="tk-card-move">
                      <span className="tk-sr">Move {row.title} to</span>
                      <select
                        value={columnOf(row) ?? ""}
                        onChange={(event) => move(row.id, event.target.value as BoardColumnKey)}
                      >
                        {BOARD_COLUMNS.map((entry) => (
                          <option key={entry.key} value={entry.key}>
                            {STATUS_LABELS[entry.dropStatus]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function initials(email: string): string {
  const parts = email.split("@")[0].split(/[._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
