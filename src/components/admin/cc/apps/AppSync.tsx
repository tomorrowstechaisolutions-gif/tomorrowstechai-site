"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adoptProjectAction,
  syncAppsAction,
  type AppActionState,
  type SyncActionState,
} from "@/app/admin/app-actions";
import { IconRepeat, IconServer, IconX } from "../Icons";

const INITIAL_SYNC: SyncActionState = {};
const INITIAL_ADOPT: AppActionState = {};

/**
 * Sync Apps.
 *
 * The button does one thing and reports what happened. What it does NOT do
 * is silently create an app for every project on the Vercel team — §33 is
 * explicit about that, and a portfolio full of abandoned preview projects
 * is a portfolio nobody opens.
 *
 * Instead, anything the sync could not match to an existing app comes back
 * as an unlinked project and a person decides: register it, attach it to an
 * app that already exists, or ignore it. Ignoring is remembered, so the
 * same three scratch projects do not ask again every week.
 */
export default function AppSync({
  connected,
  apps,
  canManage,
}: {
  connected: boolean;
  apps: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [syncState, syncAction, syncing] = useActionState(syncAppsAction, INITIAL_SYNC);
  const [adoptState, adoptAction, adopting] = useActionState(adoptProjectAction, INITIAL_ADOPT);

  const unlinked = syncState.unlinked ?? [];

  // The sheet's visibility is DERIVED, not set from an effect: a sync that
  // came back with unlinked projects shows it, and dismissing records which
  // run was dismissed. Opening it from an effect would be a cascading render
  // and, worse, would fight the next sync result.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const open = unlinked.length > 0 && Boolean(syncState.completedAt) && dismissed !== syncState.completedAt;
  const close = () => setDismissed(syncState.completedAt ?? null);
  const reopen = () => setDismissed(null);

  useEffect(() => {
    if (adoptState.completedAt) router.refresh();
  }, [adoptState.completedAt, router]);

  if (!canManage) return null;

  return (
    <>
      <form action={syncAction}>
        <button type="submit" className="cc-add-btn" disabled={syncing || !connected} title={connected ? undefined : "Connect Vercel first"}>
          <IconRepeat size={15} />
          <span>{syncing ? "Syncing…" : "Sync Apps"}</span>
        </button>
      </form>

      {syncState.success ? <span className="cc-chip t-ok" role="status">{syncState.success}</span> : null}
      {syncState.error ? <span className="cc-chip t-risk" role="alert">{syncState.error}</span> : null}
      {adoptState.success ? <span className="cc-chip t-ok" role="status">{adoptState.success}</span> : null}
      {adoptState.error ? <span className="cc-chip t-risk" role="alert">{adoptState.error}</span> : null}

      {unlinked.length > 0 && !open ? (
        <button type="button" className="cc-btn" onClick={reopen}>
          {unlinked.length} unlinked {unlinked.length === 1 ? "project" : "projects"}
        </button>
      ) : null}

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="Unlinked projects">
            <div className="cc-sheet-head">
              <IconServer size={17} />
              <h3>Unlinked projects</h3>
              <button
                type="button"
                className="cc-icon-btn"
                style={{ marginLeft: "auto", width: 28, height: 28 }}
                onClick={close}
                aria-label="Close"
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="cc-sheet-body">
              <p className="cc-note">
                These projects exist on the connected provider but no app claims them.
                Nothing has been created — decide what each one is. Ignoring is remembered
                and can be undone by linking it later.
              </p>

              {unlinked.map((project) => (
                <div key={project.ref} className="cc-health-row" style={{ display: "block", padding: "12px 0" }}>
                  <div className="cc-health-name">{project.name}</div>
                  <div className="cc-health-detail" style={{ marginBottom: 8 }}>
                    {[
                      project.domain,
                      project.framework,
                      project.repoSlug,
                      project.lastDeployState ? `last build ${project.lastDeployState.toLowerCase()}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No domain or repository reported."}
                  </div>

                  <div className="cc-rowacts">
                    <form action={adoptAction}>
                      <input type="hidden" name="ref" value={project.ref} />
                      <input type="hidden" name="mode" value="create" />
                      <button type="submit" className="cc-btn is-sm primary" disabled={adopting}>
                        Create app
                      </button>
                    </form>

                    <form action={adoptAction} className="cc-inline-form">
                      <input type="hidden" name="ref" value={project.ref} />
                      <input type="hidden" name="mode" value="link" />
                      <select name="app_id" className="cc-select" defaultValue="" aria-label={`Link ${project.name} to an app`}>
                        <option value="">Link to…</option>
                        {apps.map((app) => (
                          <option key={app.id} value={app.id}>{app.name}</option>
                        ))}
                      </select>
                      <button type="submit" className="cc-btn is-sm" disabled={adopting}>Link</button>
                    </form>

                    <form action={adoptAction}>
                      <input type="hidden" name="ref" value={project.ref} />
                      <input type="hidden" name="mode" value="ignore" />
                      <button type="submit" className="cc-btn is-sm" disabled={adopting}>Ignore</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
