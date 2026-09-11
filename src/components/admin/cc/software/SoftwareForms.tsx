"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  addSoftwareClientAction,
  cancelSoftwareClientAction,
  changeClientPlanAction,
  createVersionAction,
  deprecateVersionAction,
  linkAppAction,
  promoteVersionAction,
  retirePlanAction,
  savePlanAction,
  setPlanFeatureAction,
  unlinkAppAction,
} from "@/app/admin/software-actions";
import { IconPlus, IconX } from "../Icons";
import {
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_ORDER,
  INCLUSION_LABELS,
  ONBOARDING_LABELS,
  ONBOARDING_ORDER,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_ORDER,
  VERSION_STATUS_LABELS,
  VERSION_STATUS_ORDER,
  type Inclusion,
} from "@/lib/software/types";

/**
 * The write surfaces for a software product.
 *
 * All in one file because they share the sheet shell and the same error
 * discipline: a server action that throws must put its sentence on screen,
 * not in the console. Several of these actions REFUSE on purpose — archiving
 * a product with live clients, deleting a plan somebody is on, rolling a
 * version backwards without confirming — and the refusal is the useful part.
 */

/* ── The shell every sheet shares ──────────────────────────────────── */

function Sheet({
  label,
  title,
  icon,
  children,
  buttonClass = "cc-add-btn",
  buttonLabel,
}: {
  label: string;
  title: string;
  icon?: ReactNode;
  children: (close: () => void) => ReactNode;
  buttonClass?: string;
  buttonLabel?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        {buttonLabel ?? (
          <>
            <IconPlus size={15} />
            <span>{label}</span>
          </>
        )}
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label={title}>
            <div className="cc-sheet-head">
              {icon}
              <h3>{title}</h3>
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
            <div className="cc-sheet-body">{children(() => setOpen(false))}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** A form whose action's error message reaches the person who submitted it. */
function ActionForm({
  action,
  submitLabel,
  onDone,
  children,
  confirm,
}: {
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  onDone?: () => void;
  children: ReactNode;
  confirm?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      // Same reason as the email sheets: a sheet renders inline beside its
      // trigger button, so a container rule such as
      // ".cc-rowacts form { display: inline-flex }" would otherwise collapse
      // the whole form into one row.
      style={{ display: "block" }}
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          if (confirm && !window.confirm(confirm)) return;
          try {
            await action(fd);
            onDone?.();
          } catch (err) {
            if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
            setError(err instanceof Error ? err.message : "That did not save.");
          }
        })
      }
    >
      {children}
      {error ? <p className="cc-error" style={{ marginTop: 12 }}>{error}</p> : null}
      <div className="cc-sheet-foot">
        <button type="submit" className="cc-btn primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/* ── Plans ─────────────────────────────────────────────────────────── */

export function PlanSheet({
  softwareId,
  plan,
}: {
  softwareId: string;
  plan?: {
    id: string;
    name: string;
    description: string | null;
    monthlyPriceCents: number | null;
    annualPriceCents: number | null;
    setupFeeCents: number | null;
    trialDays: number | null;
    status: string;
    isDefault: boolean;
    displayOrder: number;
  };
}) {
  const dollars = (cents: number | null) => (cents === null ? "" : String(cents / 100));

  return (
    <Sheet
      label="New Plan"
      title={plan ? `Edit ${plan.name}` : "New pricing plan"}
      buttonClass={plan ? "cc-btn is-sm" : "cc-add-btn"}
      buttonLabel={plan ? "Edit" : undefined}
    >
      {(close) => (
        <ActionForm action={savePlanAction} submitLabel={plan ? "Save plan" : "Add plan"} onDone={close}>
          <input type="hidden" name="software_id" value={softwareId} />
          {plan ? <input type="hidden" name="plan_id" value={plan.id} /> : null}

          <div className="cc-field">
            <label className="cc-label" htmlFor="plan-name">Plan name</label>
            <input
              id="plan-name"
              name="name"
              className="cc-input"
              required
              autoFocus
              placeholder="Pro"
              defaultValue={plan?.name}
            />
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="plan-desc">Description</label>
            <textarea
              id="plan-desc"
              name="description"
              className="cc-textarea"
              rows={2}
              defaultValue={plan?.description ?? ""}
            />
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="plan-monthly">Monthly price ($)</label>
              <input
                id="plan-monthly"
                name="monthly_price"
                className="cc-input"
                inputMode="decimal"
                placeholder="399"
                defaultValue={dollars(plan?.monthlyPriceCents ?? null)}
              />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="plan-annual">Annual price ($)</label>
              <input
                id="plan-annual"
                name="annual_price"
                className="cc-input"
                inputMode="decimal"
                placeholder="3990"
                defaultValue={dollars(plan?.annualPriceCents ?? null)}
              />
            </div>
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="plan-setup">Setup fee ($)</label>
              <input
                id="plan-setup"
                name="setup_fee"
                className="cc-input"
                inputMode="decimal"
                placeholder="1499"
                defaultValue={dollars(plan?.setupFeeCents ?? null)}
              />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="plan-trial">Trial (days)</label>
              <input
                id="plan-trial"
                name="trial_days"
                className="cc-input"
                inputMode="numeric"
                placeholder="14"
                defaultValue={plan?.trialDays ?? ""}
              />
            </div>
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="plan-status">Status</label>
              <select id="plan-status" name="status" className="cc-select" defaultValue={plan?.status ?? "draft"}>
                {PLAN_STATUS_ORDER.map((key) => (
                  <option key={key} value={key}>{PLAN_STATUS_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="plan-order">Display order</label>
              <input
                id="plan-order"
                name="display_order"
                className="cc-input"
                inputMode="numeric"
                defaultValue={plan?.displayOrder ?? 0}
              />
            </div>
          </div>

          <div className="cc-field">
            <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="is_default" defaultChecked={plan?.isDefault} />
              <span>Default plan for new clients</span>
            </label>
          </div>

          <p className="cc-note">
            Changing a price here changes what NEW clients are offered. Everyone already
            on this plan keeps the price they agreed to — moving them is a separate,
            deliberate step on the Clients tab.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function RetirePlanButton({ softwareId, planId, planName }: { softwareId: string; planId: string; planName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            try {
              await retirePlanAction(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That did not work.");
            }
          })
        }
        style={{ display: "inline" }}
      >
        <input type="hidden" name="software_id" value={softwareId} />
        <input type="hidden" name="plan_id" value={planId} />
        <button type="submit" className="cc-btn is-sm" disabled={pending} title={`Close ${planName} to new clients`}>
          Retire
        </button>
      </form>
      {error ? <span className="cc-error">{error}</span> : null}
    </>
  );
}

/* ── The feature matrix cell ───────────────────────────────────────── */

export function MatrixCell({
  softwareId,
  planId,
  featureId,
  inclusion,
  note,
  canManage,
}: {
  softwareId: string;
  planId: string;
  featureId: string;
  inclusion: Inclusion;
  note: string | null;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const tone =
    inclusion === "included" ? "t-ok" : inclusion === "limited" ? "t-warn" : "t-muted";

  if (!canManage) {
    return <span className={`cc-chip ${tone}`} title={note ?? undefined}>{INCLUSION_LABELS[inclusion]}</span>;
  }

  return (
    <form
      action={(fd) => startTransition(async () => { await setPlanFeatureAction(fd); })}
      style={{ display: "inline" }}
    >
      <input type="hidden" name="software_id" value={softwareId} />
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="feature_id" value={featureId} />
      <select
        name="inclusion"
        className="cc-filter-select"
        defaultValue={inclusion}
        disabled={pending}
        aria-label="Included in this plan"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="included">Yes</option>
        <option value="limited">Limited</option>
        <option value="not_included">No</option>
      </select>
    </form>
  );
}

/* ── Versions ──────────────────────────────────────────────────────── */

export function VersionSheet({ softwareId }: { softwareId: string }) {
  return (
    <Sheet label="New Version" title="Record a version">
      {(close) => (
        <ActionForm action={createVersionAction} submitLabel="Record version" onDone={close}>
          <input type="hidden" name="software_id" value={softwareId} />

          <div className="cc-field">
            <label className="cc-label" htmlFor="ver-version">Version</label>
            <input
              id="ver-version"
              name="version"
              className="cc-input"
              required
              autoFocus
              placeholder="v2.5.0"
            />
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="ver-channel">Channel</label>
              <select id="ver-channel" name="channel" className="cc-select" defaultValue="stable">
                {CHANNEL_ORDER.map((key) => (
                  <option key={key} value={key}>{CHANNEL_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="ver-status">Status</label>
              <select id="ver-status" name="status" className="cc-select" defaultValue="draft">
                {/* Production is absent on purpose: a version becomes live by
                    being PROMOTED, which demotes whatever was live before.
                    Typing "production" here would leave two claims to it. */}
                {VERSION_STATUS_ORDER.filter((key) => key !== "production").map((key) => (
                  <option key={key} value={key}>{VERSION_STATUS_LABELS[key]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="ver-notes">Release notes</label>
            <textarea
              id="ver-notes"
              name="release_notes"
              className="cc-textarea"
              rows={3}
              placeholder="Bug fixes and route optimization update"
            />
          </div>

          <div className="cc-field">
            <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="is_breaking" />
              <span>Contains a breaking change</span>
            </label>
          </div>

          <p className="cc-note">
            Recording a version does not deploy anything. Promote it to staging or
            production from the Versions tab when it actually ships.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function PromoteVersion({
  softwareId,
  versionId,
  version,
  target,
  isRollback,
  liveVersion,
}: {
  softwareId: string;
  versionId: string;
  version: string;
  target: "production" | "staging";
  isRollback: boolean;
  liveVersion: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            // §17: a rollback is legitimate — it is how a bad release gets
            // pulled — but it is never something to do by misclick.
            if (isRollback) {
              const ok = window.confirm(
                `${version} is OLDER than the live version ${liveVersion}.\n\nPromoting it will roll production back. Continue?`
              );
              if (!ok) return;
              fd.set("confirm_rollback", "true");
            }
            try {
              await promoteVersionAction(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That did not work.");
            }
          })
        }
        style={{ display: "inline" }}
      >
        <input type="hidden" name="software_id" value={softwareId} />
        <input type="hidden" name="version_id" value={versionId} />
        <input type="hidden" name="target" value={target} />
        <button type="submit" className="cc-btn is-sm" disabled={pending}>
          {target === "production" ? (isRollback ? "Roll back to this" : "Promote to production") : "Promote to staging"}
        </button>
      </form>
      {error ? <span className="cc-error">{error}</span> : null}
    </>
  );
}

export function DeprecateVersion({ softwareId, versionId }: { softwareId: string; versionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            try {
              await deprecateVersionAction(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That did not work.");
            }
          })
        }
        style={{ display: "inline" }}
      >
        <input type="hidden" name="software_id" value={softwareId} />
        <input type="hidden" name="version_id" value={versionId} />
        <button type="submit" className="cc-btn is-sm" disabled={pending}>Deprecate</button>
      </form>
      {error ? <span className="cc-error">{error}</span> : null}
    </>
  );
}

/* ── Clients ───────────────────────────────────────────────────────── */

export function AddClientSheet({
  softwareId,
  clients,
  plans,
  versions,
  projects,
}: {
  softwareId: string;
  clients: { id: string; name: string }[];
  plans: { id: string; name: string; monthlyPriceCents: number | null }[];
  versions: { id: string; version: string }[];
  projects: { id: string; title: string }[];
}) {
  return (
    <Sheet label="Add Client" title="Put a client on this product">
      {(close) => (
        <ActionForm action={addSoftwareClientAction} submitLabel="Add client" onDone={close}>
          <input type="hidden" name="software_id" value={softwareId} />

          <div className="cc-field">
            <label className="cc-label" htmlFor="sc-client">Client</label>
            <select id="sc-client" name="customer_id" className="cc-select" required defaultValue="">
              <option value="" disabled>Choose a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-plan">Plan</label>
              <select id="sc-plan" name="plan_id" className="cc-select" defaultValue="">
                <option value="">No plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name}</option>
                ))}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-status">Status</label>
              <select id="sc-status" name="status" className="cc-select" defaultValue="onboarding">
                {CLIENT_STATUS_ORDER.map((key) => (
                  <option key={key} value={key}>{CLIENT_STATUS_LABELS[key]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-monthly">Monthly price ($)</label>
              <input id="sc-monthly" name="monthly_price" className="cc-input" inputMode="decimal" placeholder="Plan price" />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-setup">Setup fee ($)</label>
              <input id="sc-setup" name="setup_fee" className="cc-input" inputMode="decimal" placeholder="Plan fee" />
            </div>
          </div>

          <p className="cc-note">
            Leave the prices blank to take them from the plan. Whatever is saved here
            is what this client pays from now on — a later change to the plan will not
            move it.
          </p>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-onboarding">Onboarding</label>
              <select id="sc-onboarding" name="onboarding_status" className="cc-select" defaultValue="not_started">
                {ONBOARDING_ORDER.map((key) => (
                  <option key={key} value={key}>{ONBOARDING_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-due">Onboarding due</label>
              <input id="sc-due" name="onboarding_due_at" className="cc-input" type="date" />
            </div>
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-start">Start date</label>
              <input id="sc-start" name="start_date" className="cc-input" type="date" />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-version">Running version</label>
              <select id="sc-version" name="current_version_id" className="cc-select" defaultValue="">
                <option value="">Unknown</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>{version.version}</option>
                ))}
              </select>
            </div>
          </div>

          {projects.length > 0 ? (
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-project">Implementation project</label>
              <select id="sc-project" name="job_id" className="cc-select" defaultValue="">
                <option value="">None</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.title}</option>
                ))}
              </select>
            </div>
          ) : null}
        </ActionForm>
      )}
    </Sheet>
  );
}

export function ChangePlanSheet({
  softwareId,
  assignmentId,
  clientName,
  currentMonthlyCents,
  plans,
}: {
  softwareId: string;
  assignmentId: string;
  clientName: string;
  currentMonthlyCents: number | null;
  plans: { id: string; name: string; monthlyPriceCents: number | null }[];
}) {
  return (
    <Sheet
      label="Change plan"
      title={`Change plan — ${clientName}`}
      buttonClass="cc-btn is-sm"
      buttonLabel="Change plan"
    >
      {(close) => (
        <ActionForm action={changeClientPlanAction} submitLabel="Move to plan" onDone={close}>
          <input type="hidden" name="software_id" value={softwareId} />
          <input type="hidden" name="assignment_id" value={assignmentId} />

          <div className="cc-field">
            <label className="cc-label" htmlFor="cp-plan">New plan</label>
            <select id="cp-plan" name="plan_id" className="cc-select" required defaultValue="">
              <option value="" disabled>Choose a plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.monthlyPriceCents !== null ? ` — $${(plan.monthlyPriceCents / 100).toFixed(0)}/mo` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="cp-monthly">Monthly price ($)</label>
            <input
              id="cp-monthly"
              name="monthly_price"
              className="cc-input"
              inputMode="decimal"
              placeholder="Leave blank to use the new plan's price"
            />
          </div>

          <p className="cc-note">
            {clientName} currently pays{" "}
            {currentMonthlyCents === null ? "no recorded price" : `$${(currentMonthlyCents / 100).toFixed(0)}/mo`}.
            This is the only action that rewrites what a client pays, and it is written
            into the activity log with the old and new figures.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function CancelClientButton({
  softwareId,
  assignmentId,
  clientName,
}: {
  softwareId: string;
  assignmentId: string;
  clientName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const ok = window.confirm(
            `Cancel ${clientName} on this product?\n\nTheir assignment is kept so past revenue stays attributable — it is marked canceled, not deleted.`
          );
          if (!ok) return;
          await cancelSoftwareClientAction(fd);
        })
      }
      style={{ display: "inline" }}
    >
      <input type="hidden" name="software_id" value={softwareId} />
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <button type="submit" className="cc-btn is-sm" disabled={pending}>Cancel</button>
    </form>
  );
}

/* ── Apps ──────────────────────────────────────────────────────────── */

export function LinkAppForm({
  softwareId,
  unlinkedApps,
}: {
  softwareId: string;
  unlinkedApps: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (unlinkedApps.length === 0) {
    return (
      <p className="cc-note" style={{ marginTop: 0 }}>
        Every app is already claimed by a product. Register a new one on the Apps screen
        and it will appear here.
      </p>
    );
  }

  return (
    <>
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            try {
              await linkAppAction(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That did not work.");
            }
          })
        }
        className="cc-rowacts"
      >
        <input type="hidden" name="software_id" value={softwareId} />
        <select name="app_id" className="cc-filter-select" required defaultValue="">
          <option value="" disabled>Choose an app…</option>
          {unlinkedApps.map((app) => (
            <option key={app.id} value={app.id}>{app.name}</option>
          ))}
        </select>
        <button type="submit" className="cc-btn is-sm" disabled={pending}>Link app</button>
      </form>
      {error ? <p className="cc-error">{error}</p> : null}
    </>
  );
}

export function UnlinkAppButton({ softwareId, appId }: { softwareId: string; appId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => startTransition(async () => { await unlinkAppAction(fd); })}
      style={{ display: "inline" }}
    >
      <input type="hidden" name="software_id" value={softwareId} />
      <input type="hidden" name="app_id" value={appId} />
      <button type="submit" className="cc-btn is-sm" disabled={pending} title="The app itself is not changed">
        Unlink
      </button>
    </form>
  );
}
