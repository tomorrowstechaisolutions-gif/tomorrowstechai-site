"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveModelRateAction,
  setDefaultModelAction,
  setProviderEnabledAction,
  testProviderAction,
  type AiActionState,
} from "@/app/admin/ai-actions";
import { IconServer, IconSettings, IconX } from "../Icons";
import { MICRO_PER_DOLLAR, PROVIDER_STATUS_LABELS, PROVIDER_TONE, type ProviderStatus } from "@/lib/ai/types";

const INITIAL: AiActionState = {};

export type ProviderCard = {
  key: string;
  name: string;
  description: string | null;
  credentialEnv: string | null;
  keyPresent: boolean;
  enabled: boolean;
  status: ProviderStatus;
  statusDetail: string | null;
  lastCheckedAt: string | null;
  docsUrl: string | null;
  usageMicroUsd: number | null;
  callsThisMonth: number;
  models: {
    model: string;
    displayName: string | null;
    inputRate: number | null;
    outputRate: number | null;
    isDefault: boolean;
    active: boolean;
    deprecatedOn: string | null;
  }[];
};

const rateToDollars = (micro: number | null): string =>
  micro === null ? "" : String(micro / MICRO_PER_DOLLAR);

/**
 * Provider configuration, and the rate card.
 *
 * THE KEY NEVER APPEARS HERE. There is no field to paste one into and no
 * value to read back: keys are environment variables on the server, and
 * this dialog only reports whether the named variable is set and what
 * happened when the provider was last called.
 *
 * The rate card is the other half. Nothing in this admin guesses what a
 * vendor charges, so cost and margin read "Rate not set" until somebody
 * types the rate they are actually billed. Doing that here is the single
 * change that switches every cost number on these screens on.
 */
export default function ManageProviders({ providers }: { providers: ProviderCard[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [testState, testAction, testing] = useActionState(testProviderAction, INITIAL);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (testState.completedAt) router.refresh();
  }, [testState.completedAt, router]);

  const connected = providers.filter((p) => p.status === "operational").length;

  return (
    <>
      <button type="button" className="cc-btn" onClick={() => setOpen(true)}>
        <IconSettings size={15} />
        <span>Manage Providers</span>
        <span className="cc-tab-n">{connected}/{providers.length}</span>
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="Manage AI providers">
            <div className="cc-sheet-head">
              <IconServer size={17} />
              <h3>AI providers</h3>
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
              {testState.success ? <p className="cc-chip t-ok" role="status">{testState.success}</p> : null}
              {testState.error ? <p className="cc-chip t-risk" role="alert">{testState.error}</p> : null}

              <p className="cc-note" style={{ marginTop: 0 }}>
                Keys are environment variables on the server. This dialog can tell you
                whether the named variable is set and what the provider said when it was
                last called — it cannot show you a key, and neither can anything else in
                this admin.
              </p>

              {providers.map((provider) => (
                <section
                  key={provider.key}
                  style={{ paddingBottom: 18, marginBottom: 18, borderBottom: "1px solid var(--cc-line-soft)" }}
                >
                  <p className="cc-subhead" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {provider.name}
                    <span className={`cc-chip ${PROVIDER_TONE[provider.status]}`}>
                      {PROVIDER_STATUS_LABELS[provider.status]}
                    </span>
                    {!provider.enabled ? <span className="cc-chip t-muted">Disabled</span> : null}
                  </p>

                  {provider.description ? (
                    <p className="cc-note" style={{ marginTop: 0 }}>{provider.description}</p>
                  ) : null}

                  <dl className="cc-kv" style={{ marginBottom: 10 }}>
                    <dt>Key variable</dt>
                    <dd>
                      <span className="cc-code">{provider.credentialEnv ?? "—"}</span>{" "}
                      <span className={`cc-chip ${provider.keyPresent ? "t-ok" : "t-muted"}`}>
                        {provider.keyPresent ? "set on this server" : "not set"}
                      </span>
                    </dd>
                    <dt>Last check</dt>
                    <dd>
                      {provider.lastCheckedAt
                        ? new Date(provider.lastCheckedAt).toLocaleString("en-US")
                        : "Never checked"}
                    </dd>
                    {provider.statusDetail ? (
                      <>
                        <dt>Detail</dt>
                        <dd>{provider.statusDetail}</dd>
                      </>
                    ) : null}
                    <dt>Last 30 days</dt>
                    <dd>
                      {provider.callsThisMonth === 0
                        ? "No calls recorded"
                        : `${provider.callsThisMonth.toLocaleString("en-US")} calls`}
                    </dd>
                  </dl>

                  <div className="cc-rowacts" style={{ marginBottom: 10 }}>
                    <form action={testAction}>
                      <input type="hidden" name="provider_key" value={provider.key} />
                      <button type="submit" className="cc-btn is-sm" disabled={testing || !provider.enabled}>
                        {testing ? "Testing…" : "Test connection"}
                      </button>
                    </form>
                    <form action={(fd) => startTransition(async () => { await setProviderEnabledAction(fd); })}>
                      <input type="hidden" name="provider_key" value={provider.key} />
                      <input type="hidden" name="enabled" value={provider.enabled ? "0" : "1"} />
                      <button type="submit" className="cc-btn is-sm" disabled={pending}>
                        {provider.enabled ? "Disable" : "Enable"}
                      </button>
                    </form>
                    {provider.docsUrl ? (
                      <a className="cc-link" href={provider.docsUrl} target="_blank" rel="noreferrer">Docs</a>
                    ) : null}
                  </div>

                  {provider.models.length === 0 ? (
                    <p className="cc-note">
                      No models recorded. Testing the connection lists what this key can
                      reach and records them here.
                    </p>
                  ) : (
                    <div className="cc-scroll">
                      <table className="cc-table dense">
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th className="num">Input $/MTok</th>
                            <th className="num">Output $/MTok</th>
                            <th>Default</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {provider.models.map((model) => (
                            <tr key={model.model}>
                              <td>
                                <span className="cc-code">{model.displayName || model.model}</span>
                                {model.deprecatedOn ? (
                                  <span className="cc-client-sub t-warn">retires {model.deprecatedOn}</span>
                                ) : null}
                                {model.inputRate === null || model.outputRate === null ? (
                                  <span className="cc-client-sub">No rate — cost is not estimated for this model</span>
                                ) : null}
                              </td>
                              <td colSpan={3}>
                                <form
                                  className="cc-inline-form"
                                  action={(fd) => startTransition(async () => { await saveModelRateAction(fd); })}
                                >
                                  <input type="hidden" name="provider_key" value={provider.key} />
                                  <input type="hidden" name="model" value={model.model} />
                                  <input type="hidden" name="display_name" value={model.displayName ?? ""} />
                                  <input type="hidden" name="active" value={model.active ? "1" : "0"} />
                                  <input
                                    name="input_rate"
                                    className="cc-input"
                                    style={{ width: 92 }}
                                    inputMode="decimal"
                                    placeholder="—"
                                    defaultValue={rateToDollars(model.inputRate)}
                                    aria-label={`Input rate for ${model.model}`}
                                  />
                                  <input
                                    name="output_rate"
                                    className="cc-input"
                                    style={{ width: 92 }}
                                    inputMode="decimal"
                                    placeholder="—"
                                    defaultValue={rateToDollars(model.outputRate)}
                                    aria-label={`Output rate for ${model.model}`}
                                  />
                                  <button type="submit" className="cc-btn is-sm" disabled={pending}>Save rate</button>
                                </form>
                              </td>
                              <td>
                                {model.isDefault ? (
                                  <span className="cc-chip t-ok">Default</span>
                                ) : (
                                  <form action={(fd) => startTransition(async () => { await setDefaultModelAction(fd); })}>
                                    <input type="hidden" name="provider_key" value={provider.key} />
                                    <input type="hidden" name="model" value={model.model} />
                                    <button type="submit" className="cc-btn is-sm" disabled={pending}>Set default</button>
                                  </form>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}

              <p className="cc-note">
                Rates apply from the moment you save them. Usage already recorded keeps
                the cost it was priced at, the same way an invoice keeps its amounts —
                entering a rate today does not rewrite last month.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
