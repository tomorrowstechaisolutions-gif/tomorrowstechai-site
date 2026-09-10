"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  archiveSolutionAction,
  restoreSolutionAction,
  setSolutionStatusAction,
} from "@/app/admin/ai-actions";
import { IconMenu } from "../Icons";

/**
 * The per-row action menu.
 *
 * Items that would go nowhere are not rendered — no greyed-out list of
 * things this row cannot do. Pause and Archive are manager actions and are
 * absent for a viewer rather than disabled: nobody should discover their
 * permissions by being refused.
 */
export default function SolutionRowActions({
  solutionId,
  status,
  deploymentUrl,
  clientId,
  isArchived,
  canManage,
}: {
  solutionId: string;
  status: string;
  deploymentUrl: string | null;
  clientId: string | null;
  isArchived: boolean;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const paused = status === "paused";

  return (
    <div className="cc-menu-wrap" ref={wrap}>
      <button
        type="button"
        className="cc-icon-btn"
        style={{ width: 28, height: 28 }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Solution actions"
      >
        <IconMenu size={14} />
      </button>

      {open ? (
        <div className="cc-pop" role="menu">
          <Link className="cc-pop-item" role="menuitem" href={`/admin/ai-solutions/${solutionId}`}>View</Link>
          {canManage ? (
            <Link className="cc-pop-item" role="menuitem" href={`/admin/ai-solutions/${solutionId}?tab=settings`}>Edit</Link>
          ) : null}
          <Link className="cc-pop-item" role="menuitem" href={`/admin/ai-solutions/${solutionId}?tab=logs`}>View logs</Link>
          <Link className="cc-pop-item" role="menuitem" href={`/admin/ai-solutions/${solutionId}?tab=prompt-and-behavior`}>Prompt</Link>

          {deploymentUrl || clientId ? <div className="cc-pop-sep" /> : null}
          {deploymentUrl ? (
            <a className="cc-pop-item" role="menuitem" href={deploymentUrl} target="_blank" rel="noopener noreferrer">
              Open deployment
            </a>
          ) : null}
          {clientId ? (
            <Link className="cc-pop-item" role="menuitem" href={`/admin/clients/${clientId}`}>View client</Link>
          ) : null}

          {canManage ? (
            <>
              <div className="cc-pop-sep" />
              {!isArchived ? (
                <form
                  action={(fd) => startTransition(async () => { await setSolutionStatusAction(fd); setOpen(false); })}
                >
                  <input type="hidden" name="solution_id" value={solutionId} />
                  <input type="hidden" name="status" value={paused ? "active" : "paused"} />
                  <button type="submit" className="cc-pop-item" role="menuitem" disabled={pending}>
                    {paused ? "Activate" : "Pause"}
                  </button>
                </form>
              ) : null}
              <form
                action={(fd) =>
                  startTransition(async () => {
                    if (isArchived) await restoreSolutionAction(fd);
                    else await archiveSolutionAction(fd);
                    setOpen(false);
                  })
                }
              >
                <input type="hidden" name="solution_id" value={solutionId} />
                <button type="submit" className="cc-pop-item" role="menuitem" disabled={pending}>
                  {isArchived ? "Restore from archive" : "Archive"}
                </button>
              </form>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
