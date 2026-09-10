"use client";

import { useEffect, useState, useTransition } from "react";
import { createSolutionAction } from "@/app/admin/ai-actions";
import { IconBot, IconPlus, IconX } from "../Icons";
import {
  BILLING_TYPE_LABELS,
  STATUS_LABELS,
  TARGET_LABELS,
  TARGET_ORDER,
  TOOL_LABELS,
  TOOL_ORDER,
  TYPE_LABELS,
  TYPE_ORDER,
  WRITE_TOOLS,
  slugify,
  type BillingType,
  type SolutionStatus,
  type ToolKey,
} from "@/lib/ai/types";

export type Choices = {
  clients: { id: string; name: string }[];
  services: { id: string; name: string }[];
  apps: { id: string; name: string }[];
  websites: { id: string; name: string; domain: string }[];
  people: { email: string; name: string }[];
  providers: {
    key: string;
    name: string;
    status: string;
    models: { model: string; label: string; hasRate: boolean }[];
  }[];
};

/**
 * Registering a new AI solution.
 *
 * Two things this form does deliberately.
 *
 * It has NO field for an API key. Provider keys are environment variables
 * on the server; there is no path from this form to one, and there never
 * should be.
 *
 * Tool permissions start EMPTY. §24 asks for least-privilege defaults, and
 * the honest implementation of that is a set of unticked boxes: an AI gets
 * a capability because somebody chose to give it one, not because a form
 * pre-ticked it. Write-capable tools are marked so the choice is informed.
 */
export default function NewSolution({ choices }: { choices: Choices }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [providerKey, setProviderKey] = useState(choices.providers[0]?.key ?? "");
  const [billingType, setBillingType] = useState<BillingType>("none");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const provider = choices.providers.find((p) => p.key === providerKey);
  const billed = billingType !== "none";

  return (
    <>
      <button type="button" className="cc-add-btn" onClick={() => setOpen(true)}>
        <IconPlus size={15} />
        <span>New AI Solution</span>
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="New AI solution">
            <div className="cc-sheet-head">
              <IconBot size={17} />
              <h3>New AI solution</h3>
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
              <form action={(fd) => startTransition(async () => { await createSolutionAction(fd); })}>
                <p className="cc-subhead">Basic information</p>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="ai-name">Solution name</label>
                  <input
                    id="ai-name"
                    name="name"
                    className="cc-input"
                    autoFocus
                    required
                    placeholder="ROMAR Website Sales Bot"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-slug">Slug</label>
                    <input
                      id="ai-slug"
                      name="slug"
                      className="cc-input"
                      value={slugTouched ? slug : slugify(name)}
                      onChange={(event) => { setSlugTouched(true); setSlug(event.target.value); }}
                    />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-internal">Internal name</label>
                    <input id="ai-internal" name="internal_name" className="cc-input" placeholder="Optional" />
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="ai-purpose">What it is for</label>
                  <input id="ai-purpose" name="purpose" className="cc-input" placeholder="Convert website visitors into booked calls." />
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="ai-description">Description</label>
                  <textarea id="ai-description" name="description" className="cc-textarea" rows={2} />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-type">Type</label>
                    <select id="ai-type" name="solution_type" className="cc-select" defaultValue="chatbot">
                      {TYPE_ORDER.map((key) => (
                        <option key={key} value={key}>{TYPE_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-status">Status</label>
                    <select id="ai-status" name="status" className="cc-select" defaultValue="draft">
                      {(["draft", "testing", "active", "paused"] as SolutionStatus[]).map((key) => (
                        <option key={key} value={key}>{STATUS_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-owner">Owner</label>
                    <input id="ai-owner" name="owner" className="cc-input" list="ai-people" />
                    <datalist id="ai-people">
                      {choices.people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
                    </datalist>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-tags">Tags</label>
                    <input id="ai-tags" name="tags" className="cc-input" placeholder="sales, website" />
                  </div>
                </div>

                <p className="cc-subhead">Provider and model</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-provider">Provider</label>
                    <select
                      id="ai-provider"
                      name="provider_key"
                      className="cc-select"
                      value={providerKey}
                      onChange={(event) => setProviderKey(event.target.value)}
                    >
                      <option value="">Not set</option>
                      {choices.providers.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name}{p.status === "operational" ? "" : ` — ${p.status.replace(/_/g, " ")}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-model">Model</label>
                    <select id="ai-model" name="model" className="cc-select" defaultValue="">
                      <option value="">Not set</option>
                      {(provider?.models ?? []).map((m) => (
                        <option key={m.model} value={m.model}>
                          {m.label}{m.hasRate ? "" : " — no rate set"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-fallback-provider">Fallback provider</label>
                    <select id="ai-fallback-provider" name="fallback_provider_key" className="cc-select" defaultValue="">
                      <option value="">None</option>
                      {choices.providers.map((p) => (
                        <option key={p.key} value={p.key}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-fallback-model">Fallback model</label>
                    <input id="ai-fallback-model" name="fallback_model" className="cc-input" placeholder="Optional" />
                  </div>
                </div>

                <p className="cc-subhead">Deployment</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-target">Runs in</label>
                    <select id="ai-target" name="deployment_target" className="cc-select" defaultValue="website">
                      {TARGET_ORDER.map((key) => (
                        <option key={key} value={key}>{TARGET_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-url">Deployment URL</label>
                    <input id="ai-url" name="deployment_url" className="cc-input" placeholder="https://…" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-client">Client</label>
                    <select id="ai-client" name="customer_id" className="cc-select" defaultValue="">
                      <option value="">Ours — internal</option>
                      {choices.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-service">Sold as</label>
                    <select id="ai-service" name="service_id" className="cc-select" defaultValue="">
                      <option value="">No linked service</option>
                      {choices.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-app">Linked app</label>
                    <select id="ai-app" name="app_id" className="cc-select" defaultValue="">
                      <option value="">None</option>
                      {choices.apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-website">Linked website</label>
                    <select id="ai-website" name="website_id" className="cc-select" defaultValue="">
                      <option value="">None</option>
                      {choices.websites.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </div>

                <p className="cc-subhead">Instructions</p>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="ai-prompt">System prompt</label>
                  <textarea
                    id="ai-prompt"
                    name="system_prompt"
                    className="cc-textarea"
                    rows={6}
                    placeholder="Who it is, what it knows, what it must never do…"
                  />
                  <p className="cc-note">
                    Saved as version 1 and made live. Every later change becomes a new
                    version — nothing overwrites what was running.
                  </p>
                </div>

                <p className="cc-subhead">Tool permissions</p>
                <p className="cc-note" style={{ marginTop: 0 }}>
                  Nothing is granted by default. Tick only what this solution needs; a
                  write-capable tool is marked, and everything granted here still asks for
                  approval before it acts.
                </p>

                <div className="cc-taglist" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 6 }}>
                  {TOOL_ORDER.filter((t) => t !== "other").map((tool) => (
                    <label className="cc-toggle-row" key={tool}>
                      <input type="checkbox" name="tools" value={tool} />
                      <span>
                        {TOOL_LABELS[tool as ToolKey]}
                        {WRITE_TOOLS.includes(tool as ToolKey) ? (
                          <span className="cc-chip t-warn" style={{ marginLeft: 6 }}>writes</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>

                <p className="cc-subhead">Pricing</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-billing">Billing type</label>
                    <select
                      id="ai-billing"
                      name="billing_type"
                      className="cc-select"
                      value={billingType}
                      onChange={(event) => setBillingType(event.target.value as BillingType)}
                    >
                      {(Object.keys(BILLING_TYPE_LABELS) as BillingType[]).map((key) => (
                        <option key={key} value={key}>{BILLING_TYPE_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ai-markup">Usage markup (%)</label>
                    <input id="ai-markup" name="usage_markup" className="cc-input" inputMode="decimal" placeholder="Optional" />
                  </div>
                </div>

                {billed ? (
                  <div className="cc-field row2">
                    <div className="cc-field">
                      <label className="cc-label" htmlFor="ai-monthly">Monthly price ($)</label>
                      <input id="ai-monthly" name="monthly_price" className="cc-input" inputMode="decimal" placeholder="149" />
                    </div>
                    <div className="cc-field">
                      <label className="cc-label" htmlFor="ai-setup">Setup fee ($)</label>
                      <input id="ai-setup" name="setup_fee" className="cc-input" inputMode="decimal" placeholder="500" />
                    </div>
                  </div>
                ) : null}

                <p className="cc-note">
                  These are the agreed terms. What it actually costs to run comes from
                  measured token usage, and both appear side by side on the Costs tab.
                </p>

                <div className="cc-sheet-foot">
                  <button type="submit" className="cc-btn primary" disabled={pending}>
                    {pending ? "Creating…" : "Create solution"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
