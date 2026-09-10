"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  activateVersionAction,
  archiveSolutionAction,
  createAiTaskAction,
  deleteDeploymentAction,
  deleteIntegrationAction,
  deleteKnowledgeAction,
  importCodePromptAction,
  resolveAlertAction,
  restoreSolutionAction,
  saveDeploymentAction,
  saveIntegrationAction,
  saveKnowledgeAction,
  savePromptVersionAction,
  setToolAction,
  syncKnowledgeAction,
  testPromptAction,
  updateSolutionAction,
  type AiActionState,
  type TestResult,
} from "@/app/admin/ai-actions";
import { IconPlus, IconX } from "../Icons";
import {
  BILLING_TYPE_LABELS,
  KNOWLEDGE_TYPE_LABELS,
  KNOWLEDGE_TYPE_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  TARGET_LABELS,
  TARGET_ORDER,
  TOOL_LABELS,
  TOOL_ORDER,
  TYPE_LABELS,
  TYPE_ORDER,
  WRITE_TOOLS,
  microUsd,
  tokens as fmtTokens,
  type BillingType,
  type ToolKey,
} from "@/lib/ai/types";
import type { Choices } from "./NewSolution";

/**
 * The forms behind the solution detail tabs.
 *
 * None of them accepts a secret. Provider keys are environment variables on
 * the server; the integration form takes a display reference and says so.
 */

/* ── Shared pieces ─────────────────────────────────────────────────── */

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
  title, open, onClose, children,
}: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="cc-sheet-back"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
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

function SheetButton({
  label, title, children,
}: { label: string; title: string; children: (close: () => void) => ReactNode }) {
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

/* ══════════════════════════════════════════════════════════════════════
   Prompt editor
   ══════════════════════════════════════════════════════════════════════ */

export type VersionValues = {
  systemPrompt: string;
  persona: string | null;
  tone: string | null;
  purpose: string | null;
  responseRules: string | null;
  escalationRules: string | null;
  fallbackBehavior: string | null;
  safetyRules: string | null;
  temperature: number | null;
  maxOutputTokens: number | null;
};

/**
 * Editing the instructions.
 *
 * Saving never overwrites: it inserts the next version. "Save draft" leaves
 * production exactly as it is; "Save and activate" is a second, deliberate
 * choice. That separation is the whole point of §12 — a prompt is the
 * behaviour of a live system, and changing it should feel like a release.
 */
export function PromptEditor({
  solutionId,
  active,
  canManage,
}: {
  solutionId: string;
  active: VersionValues | null;
  canManage: boolean;
}) {
  const [prompt, setPrompt] = useState(active?.systemPrompt ?? "");
  const [pending, startTransition] = useTransition();

  const dirty = prompt !== (active?.systemPrompt ?? "");

  if (!canManage) {
    return (
      <pre className="cc-format" style={{ whiteSpace: "pre-wrap", fontSize: "0.78rem", lineHeight: 1.55 }}>
        {active?.systemPrompt ?? "No prompt version has been saved."}
      </pre>
    );
  }

  return (
    <form action={(fd) => startTransition(async () => { await savePromptVersionAction(fd); })}>
      <input type="hidden" name="solution_id" value={solutionId} />

      <div className="cc-field">
        <label className="cc-label" htmlFor="prompt-system">System prompt</label>
        <textarea
          id="prompt-system"
          name="system_prompt"
          className="cc-textarea"
          rows={18}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: "0.76rem", lineHeight: 1.55 }}
        />
        <p className="cc-note">
          {dirty
            ? "Unsaved. Saving creates a new version — what is live now stays live until you activate it."
            : "This is the live version. Editing creates a new one; nothing is overwritten."}
        </p>
      </div>

      <p className="cc-subhead">Behaviour</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="prompt-persona">Role / persona</label>
          <input id="prompt-persona" name="persona" className="cc-input" defaultValue={active?.persona ?? ""} />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="prompt-tone">Tone</label>
          <input id="prompt-tone" name="tone" className="cc-input" defaultValue={active?.tone ?? ""} />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label" htmlFor="prompt-purpose">Purpose</label>
        <input id="prompt-purpose" name="purpose" className="cc-input" defaultValue={active?.purpose ?? ""} />
      </div>

      <div className="cc-field">
        <label className="cc-label" htmlFor="prompt-rules">Response rules</label>
        <textarea id="prompt-rules" name="response_rules" className="cc-textarea" rows={3} defaultValue={active?.responseRules ?? ""} />
      </div>

      <div className="cc-field">
        <label className="cc-label" htmlFor="prompt-escalation">Escalation rules</label>
        <textarea id="prompt-escalation" name="escalation_rules" className="cc-textarea" rows={2} defaultValue={active?.escalationRules ?? ""} />
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="prompt-fallback">Fallback behaviour</label>
          <textarea id="prompt-fallback" name="fallback_behavior" className="cc-textarea" rows={2} defaultValue={active?.fallbackBehavior ?? ""} />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="prompt-safety">Safety rules</label>
          <textarea id="prompt-safety" name="safety_rules" className="cc-textarea" rows={2} defaultValue={active?.safetyRules ?? ""} />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="prompt-temp">Temperature</label>
          <input
            id="prompt-temp"
            name="temperature"
            className="cc-input"
            inputMode="decimal"
            placeholder="Provider default"
            defaultValue={active?.temperature ?? ""}
          />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="prompt-max">Maximum response length (tokens)</label>
          <input
            id="prompt-max"
            name="max_output_tokens"
            className="cc-input"
            inputMode="numeric"
            placeholder="1024"
            defaultValue={active?.maxOutputTokens ?? ""}
          />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label" htmlFor="prompt-notes">What changed and why</label>
        <input id="prompt-notes" name="change_notes" className="cc-input" placeholder="Tightened the pricing answer" />
      </div>

      <div className="cc-rowacts">
        <button type="submit" className="cc-btn" disabled={pending || prompt.trim().length < 20}>
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button
          type="submit"
          name="activate"
          value="1"
          className="cc-btn primary"
          disabled={pending || prompt.trim().length < 20}
          onClick={(event) => {
            if (!window.confirm("Save this as a new version and make it live now?")) event.preventDefault();
          }}
        >
          Save and activate
        </button>
      </div>
    </form>
  );
}

export function VersionActions({
  solutionId, versionId, isActive, canManage,
}: { solutionId: string; versionId: string; isActive: boolean; canManage: boolean }) {
  if (!canManage || isActive) return null;
  return (
    <ActionForm
      action={activateVersionAction}
      label="Make live"
      small
      confirm="Make this version live? The current one is retired but kept."
    >
      <input type="hidden" name="solution_id" value={solutionId} />
      <input type="hidden" name="version_id" value={versionId} />
    </ActionForm>
  );
}

export function ImportCodePrompt({ solutionId }: { solutionId: string }) {
  return (
    <ActionForm
      action={importCodePromptAction}
      label="Import the running prompt"
      small
      confirm="Copy the prompt that ships in the code into version 1 and make it live? Behaviour does not change — it is the same text."
    >
      <input type="hidden" name="solution_id" value={solutionId} />
    </ActionForm>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Test console
   ══════════════════════════════════════════════════════════════════════ */

const INITIAL_TEST: TestResult = {};

/**
 * A real call, with the real model.
 *
 * Recorded with source = 'test', which keeps it out of the client-facing
 * conversation counts while still charging it against the cost of running
 * this solution — because it did cost that.
 */
export function TestConsole({
  solutionId,
  activePrompt,
  model,
}: {
  solutionId: string;
  activePrompt: string | null;
  model: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(testPromptAction, INITIAL_TEST);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (state.completedAt) router.refresh();
  }, [state.completedAt, router]);

  return (
    <>
      <form action={action}>
        <input type="hidden" name="solution_id" value={solutionId} />
        {activePrompt ? <input type="hidden" name="system_prompt" value={activePrompt} /> : null}

        <div className="cc-field">
          <label className="cc-label" htmlFor="test-message">Test message</label>
          <textarea
            id="test-message"
            name="message"
            className="cc-textarea"
            rows={3}
            placeholder="How much is a website?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>

        <div className="cc-rowacts">
          <button type="submit" className="cc-btn primary is-sm" disabled={pending || !message.trim()}>
            {pending ? "Sending…" : "Send"}
          </button>
          <button type="button" className="cc-btn is-sm" onClick={() => setMessage("")} disabled={pending}>
            Reset
          </button>
          {model ? <span className="cc-faint" style={{ fontSize: "0.72rem" }}>{model}</span> : null}
        </div>
      </form>

      {state.error ? <p className="cc-chip t-risk" role="alert" style={{ marginTop: 10 }}>{state.error}</p> : null}

      {state.reply ? (
        <>
          <p className="cc-subhead">Response</p>
          <div className="cc-format" style={{ whiteSpace: "pre-wrap", fontSize: "0.82rem", lineHeight: 1.6 }}>
            {state.reply}
          </div>

          <dl className="cc-kv" style={{ marginTop: 12 }}>
            <dt>Model</dt>
            <dd className="cc-code">{state.model}</dd>
            <dt>Latency</dt>
            <dd>{state.latencyMs}ms</dd>
            <dt>Tokens</dt>
            <dd>{fmtTokens(state.inputTokens ?? 0)} in / {fmtTokens(state.outputTokens ?? 0)} out</dd>
            <dt>Estimated cost</dt>
            <dd>
              {state.costUnknown ? (
                <span className="cc-faint">Rate not set for this model</span>
              ) : (
                microUsd(state.costMicroUsd ?? null, { precise: true })
              )}
            </dd>
          </dl>

          <p className="cc-note">
            This call was real and is recorded against this solution as a test. It is kept
            out of the client conversation counts but counted in its cost, because it cost
            that.
          </p>
        </>
      ) : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Knowledge
   ══════════════════════════════════════════════════════════════════════ */

export type KnowledgeValues = {
  id?: string;
  name?: string;
  sourceType?: string;
  location?: string | null;
  content?: string | null;
  status?: string;
  refreshDays?: number | null;
  owner?: string | null;
};

function KnowledgeFields({ solutionId, value }: { solutionId: string; value: KnowledgeValues }) {
  const [type, setType] = useState(value.sourceType ?? "manual_text");
  const inline = ["manual_text", "faq", "policy"].includes(type);

  return (
    <>
      <input type="hidden" name="solution_id" value={solutionId} />
      {value.id ? <input type="hidden" name="source_id" value={value.id} /> : null}

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Name</label>
          <input name="name" className="cc-input" required defaultValue={value.name ?? ""} placeholder="Services and pricing" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Type</label>
          <select
            name="source_type"
            className="cc-select"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {KNOWLEDGE_TYPE_ORDER.map((key) => (
              <option key={key} value={key}>{KNOWLEDGE_TYPE_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      {inline ? (
        <div className="cc-field">
          <label className="cc-label">Text</label>
          <textarea name="content" className="cc-textarea" rows={8} defaultValue={value.content ?? ""} />
        </div>
      ) : (
        <div className="cc-field">
          <label className="cc-label">Location</label>
          <input name="location" className="cc-input" defaultValue={value.location ?? ""} placeholder="https://example.com/pricing" />
          <p className="cc-note">
            A URL, a bucket path or a table name. Anything that needs a credential to read
            uses the server&rsquo;s own configured access — never a secret typed here.
          </p>
        </div>
      )}

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Refresh every (days)</label>
          <input name="refresh_days" className="cc-input" inputMode="numeric" defaultValue={value.refreshDays ?? ""} placeholder="30" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Owner</label>
          <input name="owner" className="cc-input" defaultValue={value.owner ?? ""} />
        </div>
      </div>

      {value.id ? (
        <div className="cc-field">
          <label className="cc-label">Status</label>
          <select name="status" className="cc-select" defaultValue={value.status ?? "not_synced"}>
            <option value="not_synced">Never synced</option>
            <option value="current">Current</option>
            <option value="needs_sync">Needs sync</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      ) : null}
    </>
  );
}

export function AddKnowledge({ solutionId }: { solutionId: string }) {
  return (
    <SheetButton label="Add source" title="New knowledge source">
      {() => (
        <ActionForm action={saveKnowledgeAction} label="Add source">
          <KnowledgeFields solutionId={solutionId} value={{}} />
        </ActionForm>
      )}
    </SheetButton>
  );
}

export function EditKnowledge({ solutionId, value }: { solutionId: string; value: KnowledgeValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cc-btn is-sm" onClick={() => setOpen(true)}>View</button>
      <Sheet title={value.name ?? "Knowledge source"} open={open} onClose={() => setOpen(false)}>
        <ActionForm action={saveKnowledgeAction} label="Save source">
          <KnowledgeFields solutionId={solutionId} value={value} />
        </ActionForm>
      </Sheet>
    </>
  );
}

export function RemoveKnowledge({ solutionId, sourceId, name }: { solutionId: string; sourceId: string; name: string }) {
  return (
    <ActionForm
      action={deleteKnowledgeAction}
      label="Remove"
      danger
      small
      confirm={`Remove "${name}" from this solution's knowledge?`}
    >
      <input type="hidden" name="solution_id" value={solutionId} />
      <input type="hidden" name="source_id" value={sourceId} />
    </ActionForm>
  );
}

const INITIAL_ACTION: AiActionState = {};

export function SyncKnowledge({ solutionId, sourceId }: { solutionId: string; sourceId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(syncKnowledgeAction, INITIAL_ACTION);

  useEffect(() => {
    if (state.completedAt) router.refresh();
  }, [state.completedAt, router]);

  return (
    <>
      <form action={action}>
        <input type="hidden" name="solution_id" value={solutionId} />
        <input type="hidden" name="source_id" value={sourceId} />
        <button type="submit" className="cc-btn is-sm" disabled={pending}>
          {pending ? "Syncing…" : "Sync now"}
        </button>
      </form>
      {state.error ? <span className="cc-chip t-risk" role="alert">{state.error}</span> : null}
      {state.success ? <span className="cc-chip t-ok" role="status">{state.success}</span> : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Integrations, tools, deployments
   ══════════════════════════════════════════════════════════════════════ */

export type IntegrationValues = {
  id?: string;
  provider?: string;
  label?: string | null;
  status?: string;
  environment?: string;
  accountRef?: string | null;
  isRequired?: boolean;
};

const INTEGRATION_CHOICES = [
  "anthropic", "openai", "google", "perplexity", "supabase", "vector_store",
  "gmail", "google_calendar", "crm", "stripe", "twilio", "resend",
  "website_forms", "meta", "slack", "other",
];

function IntegrationFields({ solutionId, value }: { solutionId: string; value: IntegrationValues }) {
  return (
    <>
      <input type="hidden" name="solution_id" value={solutionId} />
      {value.id ? <input type="hidden" name="integration_id" value={value.id} /> : null}

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Service</label>
          <select name="provider" className="cc-select" defaultValue={value.provider ?? "other"}>
            {INTEGRATION_CHOICES.map((key) => (
              <option key={key} value={key}>{key.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Status</label>
          <select name="status" className="cc-select" defaultValue={value.status ?? "not_configured"}>
            <option value="connected">Connected</option>
            <option value="warning">Warning</option>
            <option value="disconnected">Disconnected</option>
            <option value="not_configured">Not configured</option>
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Environment</label>
          <select name="environment" className="cc-select" defaultValue={value.environment ?? "all"}>
            <option value="all">All</option>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Label</label>
          <input name="label" className="cc-input" defaultValue={value.label ?? ""} />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label">Account reference</label>
        <input name="account_ref" className="cc-input" defaultValue={value.accountRef ?? ""} placeholder="Project id, workspace, account name" />
        <p className="cc-note">
          A display identifier, never a key. Do not paste an API key here — this row is
          readable by every admin session, and provider keys live in the server&rsquo;s
          environment.
        </p>
      </div>

      <label className="cc-toggle-row">
        <input type="checkbox" name="is_required" defaultChecked={value.isRequired ?? false} />
        <span>This solution cannot work without it</span>
      </label>
    </>
  );
}

export function AddIntegration({ solutionId }: { solutionId: string }) {
  return (
    <SheetButton label="Add integration" title="Record an integration">
      {() => (
        <ActionForm action={saveIntegrationAction} label="Add integration">
          <IntegrationFields solutionId={solutionId} value={{}} />
        </ActionForm>
      )}
    </SheetButton>
  );
}

export function EditIntegration({ solutionId, value }: { solutionId: string; value: IntegrationValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cc-btn is-sm" onClick={() => setOpen(true)}>Configure</button>
      <Sheet title="Configure integration" open={open} onClose={() => setOpen(false)}>
        <ActionForm action={saveIntegrationAction} label="Save">
          <IntegrationFields solutionId={solutionId} value={value} />
        </ActionForm>
      </Sheet>
    </>
  );
}

export function RemoveIntegration({ solutionId, integrationId, label }: { solutionId: string; integrationId: string; label: string }) {
  return (
    <ActionForm action={deleteIntegrationAction} label="Disconnect" danger small confirm={`Remove ${label} from this solution?`}>
      <input type="hidden" name="solution_id" value={solutionId} />
      <input type="hidden" name="integration_id" value={integrationId} />
    </ActionForm>
  );
}

/**
 * One tool, one decision, one audit line.
 *
 * Deliberately not a save-the-whole-matrix form: a screen where twelve
 * permissions change in one click is a screen where nobody notices what
 * they granted.
 */
export function ToolToggle({
  solutionId, tool, allowed, requiresApproval, canManage,
}: {
  solutionId: string;
  tool: ToolKey;
  allowed: boolean;
  requiresApproval: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const writes = WRITE_TOOLS.includes(tool);

  if (!canManage) {
    return <span className={`cc-chip ${allowed ? "t-ok" : "t-muted"}`}>{allowed ? "Granted" : "Not granted"}</span>;
  }

  return (
    <div className="cc-rowacts">
      <form action={(fd) => startTransition(async () => { await setToolAction(fd); })}>
        <input type="hidden" name="solution_id" value={solutionId} />
        <input type="hidden" name="tool" value={tool} />
        <input type="hidden" name="allowed" value={allowed ? "0" : "1"} />
        <input type="hidden" name="requires_approval" value={requiresApproval || writes ? "1" : "0"} />
        <button
          type="submit"
          className={`cc-btn is-sm ${allowed ? "is-danger" : ""}`}
          disabled={pending}
          onClick={(event) => {
            if (!allowed && writes && !window.confirm(
              `"${TOOL_LABELS[tool]}" lets this AI change something. Grant it?`
            )) {
              event.preventDefault();
            }
          }}
        >
          {allowed ? "Revoke" : "Grant"}
        </button>
      </form>

      {allowed ? (
        <form action={(fd) => startTransition(async () => { await setToolAction(fd); })}>
          <input type="hidden" name="solution_id" value={solutionId} />
          <input type="hidden" name="tool" value={tool} />
          <input type="hidden" name="allowed" value="1" />
          <input type="hidden" name="requires_approval" value={requiresApproval ? "0" : "1"} />
          <button type="submit" className="cc-btn is-sm" disabled={pending || writes}>
            {requiresApproval ? "Allow without approval" : "Require approval"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export type DeploymentValues = {
  id?: string;
  name?: string;
  customerId?: string | null;
  appId?: string | null;
  websiteId?: string | null;
  environment?: string;
  deploymentUrl?: string | null;
  promptOverride?: string | null;
  brandVoice?: string | null;
  status?: string;
  monthlyPriceCents?: number | null;
};

function DeploymentFields({
  solutionId, value, choices,
}: { solutionId: string; value: DeploymentValues; choices: Choices }) {
  return (
    <>
      <input type="hidden" name="solution_id" value={solutionId} />
      {value.id ? <input type="hidden" name="deployment_id" value={value.id} /> : null}

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Name</label>
          <input name="name" className="cc-input" required defaultValue={value.name ?? ""} placeholder="ROMAR Press Sales Assistant" />
        </div>
        <div className="cc-field">
          <label className="cc-label">Client</label>
          <select name="customer_id" className="cc-select" defaultValue={value.customerId ?? ""}>
            <option value="">No client</option>
            {choices.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Environment</label>
          <select name="environment" className="cc-select" defaultValue={value.environment ?? "production"}>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Status</label>
          <select name="status" className="cc-select" defaultValue={value.status ?? "active"}>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="paused">Paused</option>
            <option value="error">Error</option>
            <option value="ended">Ended</option>
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Website</label>
          <select name="website_id" className="cc-select" defaultValue={value.websiteId ?? ""}>
            <option value="">None</option>
            {choices.websites.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">App</label>
          <select name="app_id" className="cc-select" defaultValue={value.appId ?? ""}>
            <option value="">None</option>
            {choices.apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Deployment URL</label>
          <input name="deployment_url" className="cc-input" defaultValue={value.deploymentUrl ?? ""} />
        </div>
        <div className="cc-field">
          <label className="cc-label">Monthly price ($)</label>
          <input
            name="monthly_price"
            className="cc-input"
            inputMode="decimal"
            defaultValue={value.monthlyPriceCents === null || value.monthlyPriceCents === undefined ? "" : value.monthlyPriceCents / 100}
          />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label">Brand voice</label>
        <textarea name="brand_voice" className="cc-textarea" rows={2} defaultValue={value.brandVoice ?? ""} />
      </div>

      <div className="cc-field">
        <label className="cc-label">Extra instructions for this client</label>
        <textarea name="prompt_override" className="cc-textarea" rows={5} defaultValue={value.promptOverride ?? ""} />
        <p className="cc-note">
          Appended to the master prompt, not a replacement for it. Keeping deployments as
          deltas is what lets one change to the master reach every client at once.
        </p>
      </div>
    </>
  );
}

export function AddDeployment({ solutionId, choices }: { solutionId: string; choices: Choices }) {
  return (
    <SheetButton label="Add deployment" title="New client deployment">
      {() => (
        <ActionForm action={saveDeploymentAction} label="Create deployment">
          <DeploymentFields solutionId={solutionId} value={{}} choices={choices} />
        </ActionForm>
      )}
    </SheetButton>
  );
}

export function EditDeployment({
  solutionId, value, choices,
}: { solutionId: string; value: DeploymentValues; choices: Choices }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cc-btn is-sm" onClick={() => setOpen(true)}>Edit</button>
      <Sheet title={value.name ?? "Deployment"} open={open} onClose={() => setOpen(false)}>
        <ActionForm action={saveDeploymentAction} label="Save deployment">
          <DeploymentFields solutionId={solutionId} value={value} choices={choices} />
        </ActionForm>
      </Sheet>
    </>
  );
}

export function RemoveDeployment({ solutionId, deploymentId, name }: { solutionId: string; deploymentId: string; name: string }) {
  return (
    <ActionForm action={deleteDeploymentAction} label="Remove" danger small confirm={`Remove the "${name}" deployment?`}>
      <input type="hidden" name="solution_id" value={solutionId} />
      <input type="hidden" name="deployment_id" value={deploymentId} />
    </ActionForm>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Alerts, tasks, settings
   ══════════════════════════════════════════════════════════════════════ */

export function ResolveAlert({ solutionId, alertId }: { solutionId: string; alertId: string }) {
  return (
    <ActionForm action={resolveAlertAction} label="Resolve" small confirm="Mark this alert resolved?">
      <input type="hidden" name="solution_id" value={solutionId} />
      <input type="hidden" name="alert_id" value={alertId} />
    </ActionForm>
  );
}

export function NewAiTask({
  solutionId, people, label = "Create task",
}: { solutionId: string; people: { email: string; name: string }[]; label?: string }) {
  return (
    <SheetButton label={label} title={label}>
      {() => (
        <ActionForm action={createAiTaskAction} label={label}>
          <input type="hidden" name="solution_id" value={solutionId} />
          <div className="cc-field">
            <label className="cc-label">Title</label>
            <input name="title" className="cc-input" required autoFocus />
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label">Priority</label>
              <select name="priority" className="cc-select" defaultValue="medium">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label">Assignee</label>
              <select name="owner" className="cc-select" defaultValue="">
                <option value="">Unassigned</option>
                {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="cc-field">
            <label className="cc-label">Due date</label>
            <input type="date" name="due_date" className="cc-input" />
          </div>
          <div className="cc-field">
            <label className="cc-label">Notes</label>
            <textarea name="notes" className="cc-textarea" rows={3} />
          </div>
          <p className="cc-note">
            Creates a normal task linked to this solution and its client. It appears on the
            Tasks board like any other.
          </p>
        </ActionForm>
      )}
    </SheetButton>
  );
}

export type SettingsValues = {
  id: string;
  name: string;
  internalName: string | null;
  description: string | null;
  purpose: string | null;
  tags: string[];
  type: string;
  status: string;
  customerId: string | null;
  serviceId: string | null;
  appId: string | null;
  websiteId: string | null;
  owner: string | null;
  providerKey: string | null;
  model: string | null;
  fallbackProviderKey: string | null;
  fallbackModel: string | null;
  temperature: number | null;
  maxOutputTokens: number | null;
  target: string;
  deploymentUrl: string | null;
  monthlyPriceCents: number | null;
  setupFeeCents: number | null;
  usageMarkupPct: number | null;
  billingType: BillingType;
  monthlyCostWarningMicroUsd: number | null;
  dailySpendLimitMicroUsd: number | null;
  monthlyTokenWarning: number | null;
  errorRateWarningPct: number | null;
  notes: string | null;
};

const dollarsFromMicro = (micro: number | null): string =>
  micro === null ? "" : String(micro / 1_000_000);

export function SettingsForm({ value, choices }: { value: SettingsValues; choices: Choices }) {
  const [providerKey, setProviderKey] = useState(value.providerKey ?? "");
  const provider = choices.providers.find((p) => p.key === providerKey);

  return (
    <ActionForm action={updateSolutionAction} label="Save changes">
      <input type="hidden" name="solution_id" value={value.id} />

      <p className="cc-subhead">Identity</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Name</label>
          <input name="name" className="cc-input" required defaultValue={value.name} />
        </div>
        <div className="cc-field">
          <label className="cc-label">Internal name</label>
          <input name="internal_name" className="cc-input" defaultValue={value.internalName ?? ""} />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label">What it is for</label>
        <input name="purpose" className="cc-input" defaultValue={value.purpose ?? ""} />
      </div>

      <div className="cc-field">
        <label className="cc-label">Description</label>
        <textarea name="description" className="cc-textarea" rows={2} defaultValue={value.description ?? ""} />
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Type</label>
          <select name="solution_type" className="cc-select" defaultValue={value.type}>
            {TYPE_ORDER.map((key) => <option key={key} value={key}>{TYPE_LABELS[key]}</option>)}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Status</label>
          <select name="status" className="cc-select" defaultValue={value.status}>
            {STATUS_ORDER.map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Owner</label>
          <input name="owner" className="cc-input" defaultValue={value.owner ?? ""} />
        </div>
        <div className="cc-field">
          <label className="cc-label">Tags</label>
          <input name="tags" className="cc-input" defaultValue={value.tags.join(", ")} />
        </div>
      </div>

      <p className="cc-subhead">Model</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Provider</label>
          <select
            name="provider_key"
            className="cc-select"
            value={providerKey}
            onChange={(event) => setProviderKey(event.target.value)}
          >
            <option value="">Not set</option>
            {choices.providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Model</label>
          <select name="model" className="cc-select" defaultValue={value.model ?? ""}>
            <option value="">Not set</option>
            {(provider?.models ?? []).map((m) => (
              <option key={m.model} value={m.model}>{m.label}{m.hasRate ? "" : " — no rate set"}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Fallback provider</label>
          <select name="fallback_provider_key" className="cc-select" defaultValue={value.fallbackProviderKey ?? ""}>
            <option value="">None</option>
            {choices.providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Fallback model</label>
          <input name="fallback_model" className="cc-input" defaultValue={value.fallbackModel ?? ""} />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Temperature</label>
          <input name="temperature" className="cc-input" inputMode="decimal" defaultValue={value.temperature ?? ""} />
        </div>
        <div className="cc-field">
          <label className="cc-label">Max output tokens</label>
          <input name="max_output_tokens" className="cc-input" inputMode="numeric" defaultValue={value.maxOutputTokens ?? ""} />
        </div>
      </div>

      <p className="cc-subhead">Where it runs</p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Runs in</label>
          <select name="deployment_target" className="cc-select" defaultValue={value.target}>
            {TARGET_ORDER.map((key) => <option key={key} value={key}>{TARGET_LABELS[key]}</option>)}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Deployment URL</label>
          <input name="deployment_url" className="cc-input" defaultValue={value.deploymentUrl ?? ""} />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Client</label>
          <select name="customer_id" className="cc-select" defaultValue={value.customerId ?? ""}>
            <option value="">Ours — internal</option>
            {choices.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Sold as</label>
          <select name="service_id" className="cc-select" defaultValue={value.serviceId ?? ""}>
            <option value="">No linked service</option>
            {choices.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Linked app</label>
          <select name="app_id" className="cc-select" defaultValue={value.appId ?? ""}>
            <option value="">None</option>
            {choices.apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label">Linked website</label>
          <select name="website_id" className="cc-select" defaultValue={value.websiteId ?? ""}>
            <option value="">None</option>
            {choices.websites.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      <p className="cc-subhead">Pricing</p>

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
          <label className="cc-label">Usage markup (%)</label>
          <input name="usage_markup" className="cc-input" inputMode="decimal" defaultValue={value.usageMarkupPct ?? ""} />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Monthly price ($)</label>
          <input
            name="monthly_price"
            className="cc-input"
            inputMode="decimal"
            defaultValue={value.monthlyPriceCents === null ? "" : value.monthlyPriceCents / 100}
          />
        </div>
        <div className="cc-field">
          <label className="cc-label">Setup fee ($)</label>
          <input
            name="setup_fee"
            className="cc-input"
            inputMode="decimal"
            defaultValue={value.setupFeeCents === null ? "" : value.setupFeeCents / 100}
          />
        </div>
      </div>

      <p className="cc-subhead">Thresholds</p>
      <p className="cc-note" style={{ marginTop: 0 }}>
        Leave a field empty for no threshold. Crossing one raises an alert and shows on
        this solution&rsquo;s health — it never shuts anything down on its own.
      </p>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Monthly cost warning ($)</label>
          <input
            name="monthly_cost_warning"
            className="cc-input"
            inputMode="decimal"
            defaultValue={dollarsFromMicro(value.monthlyCostWarningMicroUsd)}
          />
        </div>
        <div className="cc-field">
          <label className="cc-label">Daily spend limit ($)</label>
          <input
            name="daily_spend_limit"
            className="cc-input"
            inputMode="decimal"
            defaultValue={dollarsFromMicro(value.dailySpendLimitMicroUsd)}
          />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label">Monthly token warning</label>
          <input name="monthly_token_warning" className="cc-input" inputMode="numeric" defaultValue={value.monthlyTokenWarning ?? ""} />
        </div>
        <div className="cc-field">
          <label className="cc-label">Error rate warning (%)</label>
          <input name="error_rate_warning" className="cc-input" inputMode="decimal" defaultValue={value.errorRateWarningPct ?? ""} placeholder="10" />
        </div>
      </div>

      <div className="cc-field">
        <label className="cc-label">Internal notes</label>
        <textarea name="notes" className="cc-textarea" rows={4} defaultValue={value.notes ?? ""} />
      </div>

      <p className="cc-note">
        Changing the status, the model, the provider or the client is written to this
        solution&rsquo;s activity timeline with your name on it.
      </p>
    </ActionForm>
  );
}

export function ArchiveSolution({ solutionId, name, isArchived }: { solutionId: string; name: string; isArchived: boolean }) {
  if (isArchived) {
    return (
      <ActionForm action={restoreSolutionAction} label="Restore" small>
        <input type="hidden" name="solution_id" value={solutionId} />
      </ActionForm>
    );
  }
  return (
    <ActionForm
      action={archiveSolutionAction}
      label="Archive solution"
      danger
      small
      confirm={`Archive ${name}? It stops appearing in the portfolio and stops being scored. Its usage history, costs and prompt versions are all kept.`}
    >
      <input type="hidden" name="solution_id" value={solutionId} />
    </ActionForm>
  );
}

/** Shown on the Overview tab when a tool grant would be needed. */
export function ToolSummaryChip({ tool, allowed }: { tool: ToolKey; allowed: boolean }) {
  return (
    <span className={`cc-chip ${allowed ? (WRITE_TOOLS.includes(tool) ? "t-warn" : "t-ok") : "t-muted"}`}>
      {TOOL_LABELS[tool]}
    </span>
  );
}

export { TOOL_ORDER };
