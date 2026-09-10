"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  createAppTaskAction,
  deleteDomainAction,
  deleteEnvironmentAction,
  deleteIntegrationAction,
  markLiveVersionAction,
  openIncidentAction,
  redeployAction,
  resolveIncidentAction,
  saveDomainAction,
  saveEnvironmentAction,
  saveIntegrationAction,
  updateAppAction,
  type AppActionState,
} from "@/app/admin/app-actions";
import { IconPlus, IconX } from "../Icons";
import {
  BILLING_STATUS_LABELS,
  BILLING_TYPE_LABELS,
  ENVIRONMENT_LABELS,
  ENVIRONMENT_ORDER,
  FRAMEWORK_SUGGESTIONS,
  INTEGRATION_LABELS,
  INTEGRATION_ORDER,
  INTEGRATION_STATUS_LABELS,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  OWNERSHIP_LABELS,
  OWNERSHIP_ORDER,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
  type BillingStatus,
  type BillingType,
  type IntegrationStatus,
} from "@/lib/apps/types";

/**
 * The forms behind the app detail tabs.
 *
 * All of them post to server actions; none of them accepts a secret. The
 * integration form takes an identifier and a status — connecting an account
 * is a separate action that stores the token server-side, and there is no
 * field anywhere on this screen that would let a key be typed into a row
 * that RLS lets a browser read back.
 */

/* ── Small shared pieces ───────────────────────────────────────────── */

export function ActionForm({
  action,
  label = "Save",
  confirm,
  danger,
  small,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  label?: string;
  confirm?: string;
  danger?: boolean;
  small?: boolean;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      action={(fd) => startTransition(async () => { await action(fd); })}
    >
      {children}
      <button
        type="submit"
        className={`cc-btn ${danger ? "is-danger" : "primary"} ${small ? "is-sm" : ""}`}
        disabled={pending}
      >
        {pending ? "Working…" : label}
      </button>
    </form>
  );
}

function Sheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cc-sheet-back"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cc-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="cc-sheet-head">
          <h3>{title}</h3>
          <button
            type="button"
            className="cc-icon-btn"
            style={{ marginLeft: "auto", width: 28, height: 28 }}
            onClick={onClose}
            aria-label="Close"
          >
            <IconX size={14} />
          </button>
        </div>
        <div className="cc-sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** A button that opens a sheet containing a form. */
function SheetButton({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cc-add-btn" onClick={() => setOpen(true)}>
        <IconPlus size={15} />
        <span>{label}</span>
      </button>
      <Sheet title={title} open={open} onClose={() => setOpen(false)}>
        {children(() => setOpen(false))}
      </Sheet>
    </>
  );
}

/* ── Environments ──────────────────────────────────────────────────── */

export type EnvironmentValues = {
  id?: string;
  name?: string;
  type?: string;
  isProduction?: boolean;
  url?: string | null;
  apiBaseUrl?: string | null;
  branch?: string | null;
  hostingProvider?: string | null;
  hostingProjectId?: string | null;
  hostingTeamId?: string | null;
  databaseProvider?: string | null;
  databaseProjectId?: string | null;
  databaseRegion?: string | null;
  currentVersion?: string | null;
};

function EnvironmentFields({ appId, value }: { appId: string; value: EnvironmentValues }) {
  const [type, setType] = useState(value.type ?? "development");
  return (
    <>
      <input type="hidden" name="app_id" value={appId} />
      {value.id ? <input type="hidden" name="environment_id" value={value.id} /> : null}

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Name</label>
          <input name="name" className="cc-input" required defaultValue={value.name ?? ""} placeholder="Production" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Type</label>
          <select
            name="environment_type"
            className="cc-select"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {ENVIRONMENT_ORDER.map((key) => (
              <option key={key} value={key}>{ENVIRONMENT_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      {type === "production" ? (
        <label className="cc-toggle-row">
          <input type="checkbox" name="is_production" defaultChecked={value.isProduction ?? true} />
          <span>This is the production environment</span>
        </label>
      ) : null}

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">URL</label>
          <input name="url" className="cc-input" defaultValue={value.url ?? ""} placeholder="https://app.example.com" />
        </div>
        <div className="cc-field">
          <label className="cc-label">API base URL</label>
          <input name="api_base_url" className="cc-input" defaultValue={value.apiBaseUrl ?? ""} placeholder="https://api.example.com" />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Branch</label>
          <input name="branch" className="cc-input" defaultValue={value.branch ?? ""} placeholder="main" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Version</label>
          <input name="current_version" className="cc-input" defaultValue={value.currentVersion ?? ""} placeholder="1.4.2" />
        </div>
      </div>

      <p className="cc-subhead">Infrastructure</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Hosting provider</label>
          <input name="hosting_provider" className="cc-input" defaultValue={value.hostingProvider ?? ""} placeholder="Vercel" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Hosting project ID</label>
          <input name="hosting_project_id" className="cc-input" defaultValue={value.hostingProjectId ?? ""} placeholder="prj_…" />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Hosting team ID</label>
          <input name="hosting_team_id" className="cc-input" defaultValue={value.hostingTeamId ?? ""} placeholder="team_…" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Database provider</label>
          <input name="database_provider" className="cc-input" defaultValue={value.databaseProvider ?? ""} placeholder="Supabase" />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Database project ref</label>
          <input name="database_project_id" className="cc-input" defaultValue={value.databaseProjectId ?? ""} />
        </div>
        <div className="cc-field">
          <label className="cc-label">Database region</label>
          <input name="database_region" className="cc-input" defaultValue={value.databaseRegion ?? ""} placeholder="us-east-1" />
        </div>
      </div>

      <p className="cc-note">
        Identifiers only. Connection strings, keys and environment variables stay with the
        provider — nothing on this form is a place to put a secret.
      </p>
    </>
  );
}

export function AddEnvironment({ appId }: { appId: string }) {
  return (
    <SheetButton label="Add environment" title="New environment">
      {() => (
        <ActionForm action={saveEnvironmentAction} label="Add environment">
          <EnvironmentFields appId={appId} value={{}} />
        </ActionForm>
      )}
    </SheetButton>
  );
}

export function EditEnvironment({ appId, value }: { appId: string; value: EnvironmentValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cc-btn is-sm" onClick={() => setOpen(true)}>Edit</button>
      <Sheet title={`Edit ${value.name ?? "environment"}`} open={open} onClose={() => setOpen(false)}>
        <ActionForm action={saveEnvironmentAction} label="Save environment">
          <EnvironmentFields appId={appId} value={value} />
        </ActionForm>
      </Sheet>
    </>
  );
}

export function RemoveEnvironment({ appId, environmentId, name }: { appId: string; environmentId: string; name: string }) {
  return (
    <ActionForm
      action={deleteEnvironmentAction}
      label="Remove"
      danger
      small
      confirm={`Remove the ${name} environment? Deployments and domains keep their history — they simply stop being labelled with it.`}
    >
      <input type="hidden" name="app_id" value={appId} />
      <input type="hidden" name="environment_id" value={environmentId} />
    </ActionForm>
  );
}

/* ── Domains ───────────────────────────────────────────────────────── */

export type DomainValues = {
  id?: string;
  domain?: string;
  environment?: string;
  environmentId?: string | null;
  provider?: string | null;
  isPrimary?: boolean;
  redirectTo?: string | null;
};

function DomainFields({
  appId,
  value,
  environments,
}: {
  appId: string;
  value: DomainValues;
  environments: { id: string; name: string }[];
}) {
  return (
    <>
      <input type="hidden" name="app_id" value={appId} />
      {value.id ? <input type="hidden" name="domain_id" value={value.id} /> : null}

      <div className="cc-field">
        <label className="cc-label">Domain</label>
        <input name="domain" className="cc-input" required defaultValue={value.domain ?? ""} placeholder="app.example.com" />
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Environment</label>
          <select name="environment" className="cc-select" defaultValue={value.environment ?? "production"}>
            {ENVIRONMENT_ORDER.map((key) => (
              <option key={key} value={key}>{ENVIRONMENT_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Attached to</label>
          <select name="environment_id" className="cc-select" defaultValue={value.environmentId ?? ""}>
            <option value="">Not attached</option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>{environment.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Provider</label>
          <input name="provider" className="cc-input" defaultValue={value.provider ?? ""} placeholder="Vercel" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Redirects to</label>
          <input name="redirect_to" className="cc-input" defaultValue={value.redirectTo ?? ""} placeholder="Optional" />
        </div>
      </div>

      <label className="cc-toggle-row">
        <input type="checkbox" name="is_primary" defaultChecked={value.isPrimary ?? false} />
        <span>Primary domain for this environment</span>
      </label>

      <p className="cc-note">
        SSL status and expiry are not typed here — they come from a real TLS handshake the
        next time checks run, so the certificate on screen is the certificate being served.
      </p>
    </>
  );
}

export function AddDomain({ appId, environments }: { appId: string; environments: { id: string; name: string }[] }) {
  return (
    <SheetButton label="Add domain" title="New domain">
      {() => (
        <ActionForm action={saveDomainAction} label="Add domain">
          <DomainFields appId={appId} value={{}} environments={environments} />
        </ActionForm>
      )}
    </SheetButton>
  );
}

export function EditDomain({
  appId,
  value,
  environments,
}: {
  appId: string;
  value: DomainValues;
  environments: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cc-btn is-sm" onClick={() => setOpen(true)}>Edit</button>
      <Sheet title={`Edit ${value.domain ?? "domain"}`} open={open} onClose={() => setOpen(false)}>
        <ActionForm action={saveDomainAction} label="Save domain">
          <DomainFields appId={appId} value={value} environments={environments} />
        </ActionForm>
      </Sheet>
    </>
  );
}

export function RemoveDomain({ appId, domainId, domain }: { appId: string; domainId: string; domain: string }) {
  return (
    <ActionForm
      action={deleteDomainAction}
      label="Remove"
      danger
      small
      confirm={`Remove ${domain} from this app? This only forgets the record — it does not release the domain anywhere.`}
    >
      <input type="hidden" name="app_id" value={appId} />
      <input type="hidden" name="domain_id" value={domainId} />
    </ActionForm>
  );
}

/* ── Integrations ──────────────────────────────────────────────────── */

export type IntegrationValues = {
  id?: string;
  provider?: string;
  label?: string | null;
  status?: IntegrationStatus;
  environment?: string;
  accountRef?: string | null;
  owner?: string | null;
};

function IntegrationFields({ appId, value }: { appId: string; value: IntegrationValues }) {
  return (
    <>
      <input type="hidden" name="app_id" value={appId} />
      {value.id ? <input type="hidden" name="integration_id" value={value.id} /> : null}

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Service</label>
          <select name="provider" className="cc-select" defaultValue={value.provider ?? "other"}>
            {INTEGRATION_ORDER.map((key) => (
              <option key={key} value={key}>{INTEGRATION_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Status</label>
          <select name="status" className="cc-select" defaultValue={value.status ?? "not_configured"}>
            {(Object.keys(INTEGRATION_STATUS_LABELS) as IntegrationStatus[]).map((key) => (
              <option key={key} value={key}>{INTEGRATION_STATUS_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Environment</label>
          <select name="environment" className="cc-select" defaultValue={value.environment ?? "all"}>
            <option value="all">All environments</option>
            {ENVIRONMENT_ORDER.map((key) => (
              <option key={key} value={key}>{ENVIRONMENT_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Owner</label>
          <input name="owner" className="cc-input" defaultValue={value.owner ?? ""} placeholder="Who maintains it" />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label">Label</label>
        <input name="label" className="cc-input" defaultValue={value.label ?? ""} placeholder="Optional — how you refer to it" />
      </div>

      <div className="cc-field">
        <label className="cc-label">Account reference</label>
        <input name="account_ref" className="cc-input" defaultValue={value.accountRef ?? ""} placeholder="Project ID, account name, workspace" />
        <p className="cc-note">
          A display identifier, never a key. Do not paste an API key, a token or a secret
          here: this row is readable by every admin session, and secrets belong in the
          server-only vault behind Manage Integrations.
        </p>
      </div>
    </>
  );
}

export function AddIntegration({ appId }: { appId: string }) {
  return (
    <SheetButton label="Add integration" title="Record an integration">
      {() => (
        <ActionForm action={saveIntegrationAction} label="Add integration">
          <IntegrationFields appId={appId} value={{}} />
        </ActionForm>
      )}
    </SheetButton>
  );
}

export function EditIntegration({ appId, value }: { appId: string; value: IntegrationValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cc-btn is-sm" onClick={() => setOpen(true)}>Configure</button>
      <Sheet title="Configure integration" open={open} onClose={() => setOpen(false)}>
        <ActionForm action={saveIntegrationAction} label="Save integration">
          <IntegrationFields appId={appId} value={value} />
        </ActionForm>
      </Sheet>
    </>
  );
}

export function RemoveIntegration({ appId, integrationId, label }: { appId: string; integrationId: string; label: string }) {
  return (
    <ActionForm
      action={deleteIntegrationAction}
      label="Disconnect"
      danger
      small
      confirm={`Remove the ${label} integration from this app? The account stays connected for other apps.`}
    >
      <input type="hidden" name="app_id" value={appId} />
      <input type="hidden" name="integration_id" value={integrationId} />
    </ActionForm>
  );
}

/* ── Tasks and incidents ───────────────────────────────────────────── */

export function NewAppTask({
  appId,
  people,
  defaultType = "development",
  label = "Create task",
}: {
  appId: string;
  people: { email: string; name: string }[];
  defaultType?: string;
  label?: string;
}) {
  return (
    <SheetButton label={label} title={label}>
      {() => (
        <ActionForm action={createAppTaskAction} label={label}>
          <input type="hidden" name="app_id" value={appId} />
          <div className="cc-field">
            <label className="cc-label">Title</label>
            <input name="title" className="cc-input" required autoFocus placeholder="What needs doing" />
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label">Type</label>
              <select name="type" className="cc-select" defaultValue={defaultType}>
                <option value="development">Development</option>
                <option value="design">Design</option>
                <option value="quality">Bug / quality</option>
                <option value="launch">Launch</option>
                <option value="support">Client request</option>
                <option value="hosting">Hosting</option>
                <option value="internal">Technical debt</option>
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label">Priority</label>
              <select name="priority" className="cc-select" defaultValue="medium">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label">Assignee</label>
              <select name="owner" className="cc-select" defaultValue="">
                <option value="">Unassigned</option>
                {people.map((person) => (
                  <option key={person.email} value={person.email}>{person.name}</option>
                ))}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label">Due date</label>
              <input type="date" name="due_date" className="cc-input" />
            </div>
          </div>
          <div className="cc-field">
            <label className="cc-label">Notes</label>
            <textarea name="notes" className="cc-textarea" rows={3} />
          </div>
          <p className="cc-note">
            This creates a task in the normal Tasks system, linked to this app and to its
            client and project. It appears on the Tasks board like any other.
          </p>
        </ActionForm>
      )}
    </SheetButton>
  );
}

export function NewIncident({ appId }: { appId: string }) {
  return (
    <SheetButton label="Log incident" title="Log an incident">
      {() => (
        <ActionForm action={openIncidentAction} label="Open incident">
          <input type="hidden" name="app_id" value={appId} />
          <div className="cc-field">
            <label className="cc-label">What happened</label>
            <input name="message" className="cc-input" required autoFocus placeholder="Checkout returning 500s" />
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label">Severity</label>
              <select name="severity" className="cc-select" defaultValue="medium">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label">Area</label>
              <select name="incident_type" className="cc-select" defaultValue="application">
                <option value="application">Application</option>
                <option value="hosting">Hosting</option>
                <option value="database">Database</option>
                <option value="api">API</option>
                <option value="domain">Domain / SSL</option>
                <option value="integration">Integration</option>
                <option value="deployment">Deployment</option>
                <option value="billing">Billing</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="cc-field">
            <label className="cc-label">Detail</label>
            <textarea name="detail" className="cc-textarea" rows={3} />
          </div>
          <p className="cc-note">
            A critical or high incident makes this app read as Critical until it is resolved.
            Health checks never close an incident a person opened.
          </p>
        </ActionForm>
      )}
    </SheetButton>
  );
}

export function ResolveIncident({ appId, incidentId }: { appId: string; incidentId: string }) {
  return (
    <ActionForm action={resolveIncidentAction} label="Resolve" small confirm="Mark this incident resolved?">
      <input type="hidden" name="app_id" value={appId} />
      <input type="hidden" name="incident_id" value={incidentId} />
    </ActionForm>
  );
}

/* ── Deployment actions ────────────────────────────────────────────── */

const INITIAL: AppActionState = {};

export function DeploymentActions({
  appId,
  deploymentId,
  environment,
  canRedeploy,
  hasVersion,
}: {
  appId: string;
  deploymentId: string;
  environment: string;
  canRedeploy: boolean;
  hasVersion: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(redeployAction, INITIAL);
  const [marking, startTransition] = useTransition();

  useEffect(() => {
    if (state.completedAt) router.refresh();
  }, [state.completedAt, router]);

  return (
    <div className="cc-rowacts">
      {canRedeploy ? (
        <form
          action={action}
          onSubmit={(event) => {
            const message =
              environment === "production"
                ? "This starts a real PRODUCTION build on Vercel. Continue?"
                : "This starts a real build on Vercel. Continue?";
            if (!window.confirm(message)) event.preventDefault();
          }}
        >
          <input type="hidden" name="app_id" value={appId} />
          <input type="hidden" name="deployment_id" value={deploymentId} />
          <button type="submit" className="cc-btn is-sm" disabled={pending}>
            {pending ? "Starting…" : "Redeploy"}
          </button>
        </form>
      ) : null}

      {hasVersion ? (
        <form action={(fd) => startTransition(async () => { await markLiveVersionAction(fd); })}>
          <input type="hidden" name="app_id" value={appId} />
          <input type="hidden" name="deployment_id" value={deploymentId} />
          <button type="submit" className="cc-btn is-sm" disabled={marking} title="Record this as the version production is running. It does not promote anything.">
            Mark as live version
          </button>
        </form>
      ) : null}

      {state.error ? <span className="cc-chip t-risk" role="alert">{state.error}</span> : null}
      {state.success ? <span className="cc-chip t-ok" role="status">{state.success}</span> : null}
    </div>
  );
}

/* ── Settings ──────────────────────────────────────────────────────── */

export type SettingsValues = {
  id: string;
  name: string;
  internalName: string | null;
  description: string | null;
  logoUrl: string | null;
  ownership: string;
  platform: string;
  status: string;
  framework: string | null;
  currentVersion: string | null;
  technicalOwner: string | null;
  businessOwner: string | null;
  customerId: string | null;
  jobId: string | null;
  serviceId: string | null;
  repoProvider: string | null;
  repoUrl: string | null;
  defaultBranch: string | null;
  productionBranch: string | null;
  setupFeeCents: number | null;
  monthlyFeeCents: number | null;
  billingType: BillingType;
  billingStatus: BillingStatus;
  subscriptionId: string | null;
  notes: string | null;
};

const dollars = (cents: number | null): string => (cents === null ? "" : (cents / 100).toString());

export function SettingsForm({
  value,
  clients,
  projects,
  services,
  people,
}: {
  value: SettingsValues;
  clients: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  services: { id: string; name: string }[];
  people: { email: string; name: string }[];
}) {
  return (
    <ActionForm action={updateAppAction} label="Save changes">
      <input type="hidden" name="app_id" value={value.id} />

      <p className="cc-subhead">Identity</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">App name</label>
          <input name="name" className="cc-input" required defaultValue={value.name} />
        </div>
        <div className="cc-field">
          <label className="cc-label">Internal name</label>
          <input name="internal_name" className="cc-input" defaultValue={value.internalName ?? ""} />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label">Description</label>
        <textarea name="description" className="cc-textarea" rows={2} defaultValue={value.description ?? ""} />
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Ownership</label>
          <select name="ownership_type" className="cc-select" defaultValue={value.ownership}>
            {OWNERSHIP_ORDER.map((key) => (
              <option key={key} value={key}>{OWNERSHIP_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Lifecycle status</label>
          <select name="lifecycle_status" className="cc-select" defaultValue={value.status}>
            {LIFECYCLE_ORDER.map((key) => (
              <option key={key} value={key}>{LIFECYCLE_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Platform</label>
          <select name="platform_type" className="cc-select" defaultValue={value.platform}>
            {PLATFORM_ORDER.map((key) => (
              <option key={key} value={key}>{PLATFORM_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Framework / stack</label>
          <input name="framework" className="cc-input" list="settings-frameworks" defaultValue={value.framework ?? ""} />
          <datalist id="settings-frameworks">
            {FRAMEWORK_SUGGESTIONS.map((framework) => <option key={framework} value={framework} />)}
          </datalist>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Live version</label>
          <input name="current_version" className="cc-input" defaultValue={value.currentVersion ?? ""} placeholder="1.4.2" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Logo URL</label>
          <input name="logo_url" className="cc-input" defaultValue={value.logoUrl ?? ""} />
        </div>
      </div>

      <p className="cc-subhead">Relationships</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Client</label>
          <select name="customer_id" className="cc-select" defaultValue={value.customerId ?? ""}>
            <option value="">Ours — no client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Project</label>
          <select name="job_id" className="cc-select" defaultValue={value.jobId ?? ""}>
            <option value="">No linked project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Sold as</label>
          <select name="service_id" className="cc-select" defaultValue={value.serviceId ?? ""}>
            <option value="">No linked service</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Technical owner</label>
          <input name="technical_owner" className="cc-input" list="settings-people" defaultValue={value.technicalOwner ?? ""} />
          <datalist id="settings-people">
            {people.map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}
          </datalist>
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label">Business owner</label>
        <input name="business_owner" className="cc-input" list="settings-people" defaultValue={value.businessOwner ?? ""} />
      </div>

      <p className="cc-subhead">Repository</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Provider</label>
          <select name="repo_provider" className="cc-select" defaultValue={value.repoProvider ?? "github"}>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="bitbucket">Bitbucket</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Repository URL</label>
          <input name="repo_url" className="cc-input" defaultValue={value.repoUrl ?? ""} placeholder="https://github.com/org/repo" />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Default branch</label>
          <input name="default_branch" className="cc-input" defaultValue={value.defaultBranch ?? ""} placeholder="main" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Production branch</label>
          <input name="production_branch" className="cc-input" defaultValue={value.productionBranch ?? ""} placeholder="main" />
        </div>
      </div>

      <p className="cc-subhead">Billing terms</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Billing type</label>
          <select name="billing_type" className="cc-select" defaultValue={value.billingType}>
            {(Object.keys(BILLING_TYPE_LABELS) as BillingType[]).map((key) => (
              <option key={key} value={key}>{BILLING_TYPE_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Billing status</label>
          <select name="billing_status" className="cc-select" defaultValue={value.billingStatus}>
            {(Object.keys(BILLING_STATUS_LABELS) as BillingStatus[]).map((key) => (
              <option key={key} value={key}>{BILLING_STATUS_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Setup fee ($)</label>
          <input name="setup_fee" className="cc-input" inputMode="decimal" defaultValue={dollars(value.setupFeeCents)} />
        </div>
        <div className="cc-field">
          <label className="cc-label">Monthly fee ($)</label>
          <input name="monthly_fee" className="cc-input" inputMode="decimal" defaultValue={dollars(value.monthlyFeeCents)} />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label">Related subscription ID</label>
        <input name="subscription_id" className="cc-input" defaultValue={value.subscriptionId ?? ""} placeholder="sub_…" />
      </div>

      <div className="cc-field">
        <label className="cc-label">Internal notes</label>
        <textarea name="notes" className="cc-textarea" rows={4} defaultValue={value.notes ?? ""} />
      </div>

      <p className="cc-note">
        Changing the lifecycle status, the client or the live version is written to this
        app&rsquo;s activity timeline with your name on it.
      </p>
    </ActionForm>
  );
}
