"use client";

import { useEffect, useState, useTransition } from "react";
import { createAppAction } from "@/app/admin/app-actions";
import { IconLayers, IconPlus, IconX } from "../Icons";
import {
  BILLING_STATUS_LABELS,
  BILLING_TYPE_LABELS,
  FRAMEWORK_SUGGESTIONS,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  OWNERSHIP_LABELS,
  OWNERSHIP_ORDER,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
  slugify,
  type BillingStatus,
  type BillingType,
} from "@/lib/apps/types";

/**
 * Registering an app.
 *
 * One scrolling form in five labelled sections rather than a wizard,
 * because everything here is a fact somebody already knows — this records
 * an app, it does not provision one. Nothing in this form creates a Vercel
 * project, a database, a domain or a subscription, and the note at the
 * bottom says so, because a "New App" button that quietly spends money is
 * the kind of surprise that makes an admin untrustworthy.
 *
 * There is no field for a token, a key or a password anywhere in it. That
 * is deliberate and permanent: connecting an account is a separate action
 * that stores the secret server-side and never renders it back.
 */
export default function AddApp({
  clients,
  projects,
  services,
  people,
}: {
  clients: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  services: { id: string; name: string }[];
  people: { email: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
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

  const billed = billingType !== "none";

  return (
    <>
      <button type="button" className="cc-add-btn" onClick={() => setOpen(true)}>
        <IconPlus size={15} />
        <span>New App</span>
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="New app">
            <div className="cc-sheet-head">
              <IconLayers size={17} />
              <h3>New app</h3>
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
              <form action={(fd) => startTransition(async () => { await createAppAction(fd); })}>
                <p className="cc-subhead">Basic information</p>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="app-name">App name</label>
                  <input
                    id="app-name"
                    name="name"
                    className="cc-input"
                    autoFocus
                    required
                    placeholder="Technician App"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-slug">Slug</label>
                    <input
                      id="app-slug"
                      name="slug"
                      className="cc-input"
                      placeholder="tech-app"
                      value={slugTouched ? slug : slugify(name)}
                      onChange={(event) => {
                        setSlugTouched(true);
                        setSlug(event.target.value);
                      }}
                    />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-internal">Internal name</label>
                    <input id="app-internal" name="internal_name" className="cc-input" placeholder="Optional" />
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="app-description">Description</label>
                  <textarea
                    id="app-description"
                    name="description"
                    className="cc-textarea"
                    rows={2}
                    placeholder="What it does, and for whom."
                  />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-ownership">Ownership</label>
                    <select id="app-ownership" name="ownership_type" className="cc-select" defaultValue="internal">
                      {OWNERSHIP_ORDER.map((key) => (
                        <option key={key} value={key}>{OWNERSHIP_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-status">Lifecycle status</label>
                    <select id="app-status" name="lifecycle_status" className="cc-select" defaultValue="planning">
                      {LIFECYCLE_ORDER.filter((key) => key !== "archived").map((key) => (
                        <option key={key} value={key}>{LIFECYCLE_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-platform">Platform</label>
                    <select id="app-platform" name="platform_type" className="cc-select" defaultValue="web">
                      {PLATFORM_ORDER.map((key) => (
                        <option key={key} value={key}>{PLATFORM_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-framework">Framework / stack</label>
                    <input
                      id="app-framework"
                      name="framework"
                      className="cc-input"
                      list="app-frameworks"
                      placeholder="Next.js"
                    />
                    <datalist id="app-frameworks">
                      {FRAMEWORK_SUGGESTIONS.map((f) => <option key={f} value={f} />)}
                    </datalist>
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="app-logo">Logo URL</label>
                  <input id="app-logo" name="logo_url" className="cc-input" placeholder="https://…" />
                </div>

                <p className="cc-subhead">Relationships</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-client">Client</label>
                    <select id="app-client" name="customer_id" className="cc-select" defaultValue="">
                      <option value="">Ours — no client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-project">Project</label>
                    <select id="app-project" name="job_id" className="cc-select" defaultValue="">
                      <option value="">No linked project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-service">Sold as</label>
                    <select id="app-service" name="service_id" className="cc-select" defaultValue="">
                      <option value="">No linked service</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>{service.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-tech-owner">Technical owner</label>
                    <input
                      id="app-tech-owner"
                      name="technical_owner"
                      className="cc-input"
                      list="app-people"
                      placeholder="Email"
                    />
                    <datalist id="app-people">
                      {people.map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}
                    </datalist>
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="app-biz-owner">Business owner</label>
                  <input id="app-biz-owner" name="business_owner" className="cc-input" list="app-people" placeholder="Email" />
                </div>

                <p className="cc-subhead">Environments</p>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="app-prod-url">Production URL</label>
                  <input id="app-prod-url" name="production_url" className="cc-input" placeholder="https://app.example.com" />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-stage-url">Staging URL</label>
                    <input id="app-stage-url" name="staging_url" className="cc-input" placeholder="https://staging.example.com" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-dev-url">Development URL</label>
                    <input id="app-dev-url" name="development_url" className="cc-input" placeholder="http://localhost:3000" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-prod-domain">Production domain</label>
                    <input id="app-prod-domain" name="production_domain" className="cc-input" placeholder="app.example.com" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-hosting">Hosting provider</label>
                    <input id="app-hosting" name="hosting_provider" className="cc-input" placeholder="Vercel" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-hosting-project">Hosting project ID</label>
                    <input id="app-hosting-project" name="hosting_project_id" className="cc-input" placeholder="prj_…" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-db-provider">Database provider</label>
                    <input id="app-db-provider" name="database_provider" className="cc-input" placeholder="Supabase" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-db-project">Database project ref</label>
                    <input id="app-db-project" name="database_project_id" className="cc-input" placeholder="abcdefghijklmnop" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-db-region">Database region</label>
                    <input id="app-db-region" name="database_region" className="cc-input" placeholder="us-east-1" />
                  </div>
                </div>

                <p className="cc-subhead">Repository</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-repo-provider">Provider</label>
                    <select id="app-repo-provider" name="repo_provider" className="cc-select" defaultValue="github">
                      <option value="github">GitHub</option>
                      <option value="gitlab">GitLab</option>
                      <option value="bitbucket">Bitbucket</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-repo-url">Repository URL</label>
                    <input id="app-repo-url" name="repo_url" className="cc-input" placeholder="https://github.com/org/repo" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-default-branch">Default branch</label>
                    <input id="app-default-branch" name="default_branch" className="cc-input" placeholder="main" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-prod-branch">Production branch</label>
                    <input id="app-prod-branch" name="production_branch" className="cc-input" placeholder="main" />
                  </div>
                </div>

                <p className="cc-subhead">Billing terms</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-billing-type">Billing type</label>
                    <select
                      id="app-billing-type"
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
                    <label className="cc-label" htmlFor="app-billing-status">Billing status</label>
                    <select id="app-billing-status" name="billing_status" className="cc-select" defaultValue="not_connected">
                      {(Object.keys(BILLING_STATUS_LABELS) as BillingStatus[]).map((key) => (
                        <option key={key} value={key}>{BILLING_STATUS_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {billed ? (
                  <div className="cc-field row2">
                    <div className="cc-field">
                      <label className="cc-label" htmlFor="app-setup-fee">Setup fee ($)</label>
                      <input id="app-setup-fee" name="setup_fee" className="cc-input" inputMode="decimal" placeholder="2500" />
                    </div>
                    <div className="cc-field">
                      <label className="cc-label" htmlFor="app-monthly-fee">Monthly fee ($)</label>
                      <input id="app-monthly-fee" name="monthly_fee" className="cc-input" inputMode="decimal" placeholder="149" />
                    </div>
                  </div>
                ) : null}

                {billed ? (
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="app-subscription">Related subscription ID</label>
                    <input id="app-subscription" name="subscription_id" className="cc-input" placeholder="sub_…" />
                  </div>
                ) : null}

                <p className="cc-note">
                  These are the agreed terms, not a measurement. What has actually been
                  invoiced and collected is read from the Invoices system on the app&rsquo;s
                  Revenue tab, so the two can never quietly disagree.
                </p>

                <p className="cc-note">
                  Registering an app records something you already have. It does not create a
                  hosting project, a database, a domain or a subscription — those stay
                  deliberate, separate steps.
                </p>

                <div className="cc-sheet-foot">
                  <button type="submit" className="cc-btn primary" disabled={pending}>
                    {pending ? "Saving…" : "Add app"}
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
