"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  connectProviderAction,
  disconnectProviderAction,
  type AppActionState,
} from "@/app/admin/app-actions";
import { IconServer, IconSettings, IconX } from "../Icons";

const INITIAL: AppActionState = {};

export type ProviderCard = {
  key: "vercel" | "github" | "supabase";
  label: string;
  connected: boolean;
  accountLabel: string | null;
  connectedAt: string | null;
  lastError: string | null;
  /** What connecting this actually turns on, in plain words. */
  unlocks: string;
  tokenHint: string;
  tokenUrl: string;
  needsTeam?: boolean;
  defaultTeam?: string;
};

/**
 * Manage integrations.
 *
 * Three accounts, three tokens, one place. Everything about this dialog is
 * shaped by one rule: a token goes in and never comes back out.
 *
 * The field is a password input, the value is posted to a server action,
 * the action hands it to the provider to prove it works and then stores it
 * with the service role in a table that has RLS on and no policy — so not
 * even a signed-in admin's browser session can read it back. This dialog
 * can tell you a provider is connected and which account it is; it cannot
 * show you the secret, and neither can any other screen in the admin.
 */
export default function ManageIntegrations({ providers }: { providers: ProviderCard[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [connectState, connectAction, connecting] = useActionState(connectProviderAction, INITIAL);
  const [disconnectState, disconnectAction, disconnecting] = useActionState(disconnectProviderAction, INITIAL);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const at = connectState.completedAt || disconnectState.completedAt;
    if (at) router.refresh();
  }, [connectState.completedAt, disconnectState.completedAt, router]);

  const connectedCount = providers.filter((p) => p.connected).length;

  return (
    <>
      <button type="button" className="cc-btn" onClick={() => setOpen(true)}>
        <IconSettings size={15} />
        <span>Manage Integrations</span>
        <span className="cc-tab-n">{connectedCount}/{providers.length}</span>
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="Manage integrations">
            <div className="cc-sheet-head">
              <IconServer size={17} />
              <h3>Manage integrations</h3>
              <button
                type="button"
                className="cc-icon-btn"
                style={{ marginLeft: "auto", width: 28, height: 28 }}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="cc-sheet-body">
              {connectState.success ? <p className="cc-chip t-ok" role="status">{connectState.success}</p> : null}
              {connectState.error ? <p className="cc-chip t-risk" role="alert">{connectState.error}</p> : null}
              {disconnectState.success ? <p className="cc-chip t-ok" role="status">{disconnectState.success}</p> : null}
              {disconnectState.error ? <p className="cc-chip t-risk" role="alert">{disconnectState.error}</p> : null}

              {providers.map((provider) => (
                <section key={provider.key} style={{ paddingBottom: 18, marginBottom: 18, borderBottom: "1px solid var(--cc-line-soft)" }}>
                  <p className="cc-subhead" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {provider.label}
                    <span className={`cc-chip ${provider.connected ? "t-ok" : "t-muted"}`}>
                      {provider.connected ? "Connected" : "Not connected"}
                    </span>
                  </p>

                  <p className="cc-note" style={{ marginTop: 0 }}>{provider.unlocks}</p>

                  {provider.connected ? (
                    <>
                      <dl className="cc-kv" style={{ marginBottom: 10 }}>
                        <dt>Account</dt>
                        <dd>{provider.accountLabel ?? "Connected"}</dd>
                        <dt>Connected</dt>
                        <dd>{provider.connectedAt ? new Date(provider.connectedAt).toLocaleString("en-US") : "—"}</dd>
                        {provider.lastError ? (
                          <>
                            <dt>Last error</dt>
                            <dd className="t-risk">{provider.lastError}</dd>
                          </>
                        ) : null}
                      </dl>
                      <div className="cc-rowacts">
                        <form action={disconnectAction}>
                          <input type="hidden" name="provider" value={provider.key} />
                          <button type="submit" className="cc-btn is-sm is-danger" disabled={disconnecting}>
                            Disconnect
                          </button>
                        </form>
                        <span className="cc-faint" style={{ fontSize: "0.72rem" }}>
                          Disconnecting removes the token. Everything already synced stays.
                        </span>
                      </div>
                    </>
                  ) : (
                    <form action={connectAction}>
                      <input type="hidden" name="provider" value={provider.key} />
                      <div className="cc-field">
                        <label className="cc-label" htmlFor={`token-${provider.key}`}>Access token</label>
                        <input
                          id={`token-${provider.key}`}
                          name="token"
                          type="password"
                          className="cc-input"
                          autoComplete="off"
                          required
                          placeholder={provider.tokenHint}
                        />
                        <p className="cc-note">
                          Create one at{" "}
                          <a className="cc-link" href={provider.tokenUrl} target="_blank" rel="noreferrer">
                            {new URL(provider.tokenUrl).host}
                          </a>
                          . It is verified, then stored server-side. It is never returned to a
                          browser and never appears on any screen again.
                        </p>
                      </div>

                      {provider.needsTeam ? (
                        <div className="cc-field">
                          <label className="cc-label" htmlFor={`team-${provider.key}`}>Team ID</label>
                          <input
                            id={`team-${provider.key}`}
                            name="team_id"
                            className="cc-input"
                            required
                            defaultValue={provider.defaultTeam ?? ""}
                            placeholder="team_…"
                          />
                        </div>
                      ) : null}

                      <button type="submit" className="cc-btn primary is-sm" disabled={connecting}>
                        {connecting ? "Connecting…" : `Connect ${provider.label}`}
                      </button>
                    </form>
                  )}
                </section>
              ))}

              <p className="cc-note">
                Tokens live in the server-only credentials vault, which has row level
                security enabled and no read policy at all. Nothing in the browser — this
                dialog included — can read one back.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
