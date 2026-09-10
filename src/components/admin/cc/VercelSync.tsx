"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  connectAndSyncVercelAction,
  syncVercelAction,
  type VercelSyncActionState,
} from "@/app/admin/website-actions";
import type { VercelConnection } from "@/lib/vercel/website-sync";
import { IconServer, IconX } from "./Icons";

const INITIAL: VercelSyncActionState = {};

export default function VercelSync({ connection }: { connection: VercelConnection }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [connectState, connectAction, connecting] = useActionState(connectAndSyncVercelAction, INITIAL);
  const [syncState, syncAction, syncing] = useActionState(syncVercelAction, INITIAL);
  const state = connection.connected ? syncState : connectState;

  useEffect(() => {
    const completedAt = connectState.completedAt || syncState.completedAt;
    if (!completedAt) return;
    router.refresh();
  }, [connectState.completedAt, router, syncState.completedAt]);

  return (
    <>
      {connection.connected ? (
        <form action={syncAction}>
          <button type="submit" className="cc-add-btn" disabled={syncing}>
            <IconServer size={15} />
            <span>{syncing ? "Syncing…" : "Sync Vercel"}</span>
          </button>
        </form>
      ) : (
        <button type="button" className="cc-add-btn" onClick={() => setOpen(true)}>
          <IconServer size={15} />
          <span>Connect Vercel</span>
        </button>
      )}

      {state.success ? <span className="cc-chip t-ok" role="status">{state.success}</span> : null}
      {state.error ? <span className="cc-chip t-risk" role="alert">{state.error}</span> : null}

      {open && !connectState.success ? (
        <div className="cc-sheet-back" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="Connect Vercel">
            <div className="cc-sheet-head">
              <IconServer size={17} />
              <h3>Connect Vercel</h3>
              <button type="button" className="cc-icon-btn" style={{ marginLeft: "auto", width: 28, height: 28 }} onClick={() => setOpen(false)} aria-label="Close">
                <IconX size={14} />
              </button>
            </div>
            <div className="cc-sheet-body">
              <form action={connectAction}>
                <div className="cc-field">
                  <label className="cc-label" htmlFor="vercel-token">Vercel access token</label>
                  <input id="vercel-token" name="token" type="password" className="cc-input" autoComplete="off" required autoFocus placeholder="Paste a Vercel token" />
                  <p className="cc-note">Create a token in <a className="cc-link" href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer">Vercel Account Settings</a>. It is stored in the server-only credentials vault and is never returned to the browser.</p>
                </div>
                <div className="cc-field">
                  <label className="cc-label" htmlFor="vercel-team">Vercel team ID</label>
                  <input id="vercel-team" name="team_id" className="cc-input" required defaultValue={connection.teamId} />
                </div>
                <p className="cc-note">The first sync imports missing projects, matches existing websites by project or domain, and adds recent production deployments. It does not overwrite client ownership, revenue, website type, notes, or workflow status on existing records.</p>
                {connectState.error ? <p className="cc-note" role="alert">{connectState.error}</p> : null}
                <div className="cc-sheet-foot">
                  <button type="submit" className="cc-btn primary" disabled={connecting}>{connecting ? "Connecting and syncing…" : "Connect and sync"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
