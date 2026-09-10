"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { archiveAppAction, restoreAppAction } from "@/app/admin/app-actions";
import { IconMenu } from "../Icons";

/**
 * The per-row action menu.
 *
 * Links that would go nowhere are not rendered. "Open staging" only exists
 * when there is a staging URL; "Client" only when the app has one. A menu
 * of greyed-out items teaches people to stop opening the menu.
 *
 * Ownership of the destructive item: archiving is a manager action and the
 * item is absent for a viewer, not disabled — a viewer should not have to
 * discover their permissions by being refused.
 */
export default function AppRowActions({
  appId,
  productionUrl,
  stagingUrl,
  clientId,
  projectId,
  isArchived,
  canManage,
}: {
  appId: string;
  productionUrl: string | null;
  stagingUrl: string | null;
  clientId: string | null;
  projectId: string | null;
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

  return (
    <div className="cc-menu-wrap" ref={wrap}>
      <button
        type="button"
        className="cc-icon-btn"
        style={{ width: 28, height: 28 }}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="App actions"
      >
        <IconMenu size={14} />
      </button>

      {open ? (
        <div className="cc-pop" role="menu">
          <Link className="cc-pop-item" role="menuitem" href={`/admin/apps/${appId}`}>View</Link>
          {canManage ? (
            <Link className="cc-pop-item" role="menuitem" href={`/admin/apps/${appId}?tab=settings`}>Edit</Link>
          ) : null}
          <Link className="cc-pop-item" role="menuitem" href={`/admin/apps/${appId}?tab=deployments`}>Deployments</Link>

          {productionUrl || stagingUrl ? <div className="cc-pop-sep" /> : null}
          {productionUrl ? (
            <a className="cc-pop-item" role="menuitem" href={productionUrl} target="_blank" rel="noopener noreferrer">
              Open production
            </a>
          ) : null}
          {stagingUrl ? (
            <a className="cc-pop-item" role="menuitem" href={stagingUrl} target="_blank" rel="noopener noreferrer">
              Open staging
            </a>
          ) : null}

          {clientId || projectId ? <div className="cc-pop-sep" /> : null}
          {clientId ? (
            <Link className="cc-pop-item" role="menuitem" href={`/admin/clients/${clientId}`}>Client</Link>
          ) : null}
          {projectId ? (
            <Link className="cc-pop-item" role="menuitem" href={`/admin/jobs/${projectId}`}>Project</Link>
          ) : null}

          {canManage ? (
            <>
              <div className="cc-pop-sep" />
              <form
                action={(fd) =>
                  startTransition(async () => {
                    if (isArchived) await restoreAppAction(fd);
                    else await archiveAppAction(fd);
                    setOpen(false);
                  })
                }
              >
                <input type="hidden" name="app_id" value={appId} />
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
