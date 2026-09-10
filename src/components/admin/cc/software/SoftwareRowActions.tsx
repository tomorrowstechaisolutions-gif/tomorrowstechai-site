"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { archiveSoftwareAction, restoreSoftwareAction } from "@/app/admin/software-actions";
import { IconMenu } from "../Icons";

/**
 * The per-row action menu.
 *
 * Links that would go nowhere are not rendered. "Open production" only
 * exists when a linked app actually has a production URL; "View Clients"
 * only when there are clients. A menu of greyed-out items teaches people to
 * stop opening the menu.
 *
 * Ownership of the destructive item: archiving is a manager action and the
 * item is absent for a viewer, not disabled — a viewer should not have to
 * discover their permissions by being refused.
 */
export default function SoftwareRowActions({
  softwareId,
  productionUrl,
  clientCount,
  appCount,
  isArchived,
  canManage,
}: {
  softwareId: string;
  productionUrl: string | null;
  clientCount: number;
  appCount: number;
  isArchived: boolean;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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

  const base = `/admin/software/${softwareId}`;

  return (
    <div className="cc-menu-wrap" ref={wrap}>
      <button
        type="button"
        className="cc-icon-btn"
        style={{ width: 28, height: 28 }}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Software actions"
      >
        <IconMenu size={14} />
      </button>

      {open ? (
        <div className="cc-pop" role="menu">
          <Link className="cc-pop-item" role="menuitem" href={base}>View</Link>
          {canManage ? (
            <Link className="cc-pop-item" role="menuitem" href={`${base}?tab=settings`}>Edit</Link>
          ) : null}

          <div className="cc-pop-sep" />
          {clientCount > 0 ? (
            <Link className="cc-pop-item" role="menuitem" href={`${base}?tab=clients`}>View clients</Link>
          ) : null}
          {appCount > 0 ? (
            <Link className="cc-pop-item" role="menuitem" href={`${base}?tab=apps`}>View apps</Link>
          ) : null}
          <Link className="cc-pop-item" role="menuitem" href={`${base}?tab=versions`}>View versions</Link>
          <Link className="cc-pop-item" role="menuitem" href={`${base}?tab=roadmap`}>View roadmap</Link>

          {productionUrl ? (
            <>
              <div className="cc-pop-sep" />
              <a
                className="cc-pop-item"
                role="menuitem"
                href={productionUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open production
              </a>
            </>
          ) : null}

          {canManage ? (
            <>
              <div className="cc-pop-sep" />
              <form
                action={(fd) =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      if (isArchived) await restoreSoftwareAction(fd);
                      else await archiveSoftwareAction(fd);
                      setOpen(false);
                    } catch (err) {
                      // Archiving refuses while clients are still on the
                      // product. That refusal is the useful part, so it is
                      // shown here rather than thrown away.
                      setError(err instanceof Error ? err.message : "That did not work.");
                    }
                  })
                }
              >
                <input type="hidden" name="software_id" value={softwareId} />
                <button type="submit" className="cc-pop-item" role="menuitem" disabled={pending}>
                  {isArchived ? "Restore from archive" : "Archive"}
                </button>
              </form>
              {error ? (
                <p className="cc-note" style={{ margin: "4px 10px 8px", maxWidth: 260 }}>
                  {error}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
