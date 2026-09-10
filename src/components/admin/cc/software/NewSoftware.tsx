"use client";

import { useEffect, useState, useTransition } from "react";
import { createSoftwareAction } from "@/app/admin/software-actions";
import { IconCode, IconPlus, IconX } from "../Icons";
import {
  BILLING_MODEL_LABELS,
  BILLING_MODEL_ORDER,
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  INDUSTRY_SUGGESTIONS,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPE_ORDER,
  slugify,
  type BillingModel,
} from "@/lib/software/types";

/**
 * Creating a software product.
 *
 * One scrolling form in four labelled sections rather than a wizard, because
 * everything here is a fact somebody already knows — this RECORDS a product,
 * it does not provision one. Nothing in this form creates a repository, a
 * hosting project, a Stripe price or a subscription, and the note at the
 * bottom says so, because a "New Product" button that quietly spends money
 * is the kind of surprise that makes an admin untrustworthy.
 *
 * There is no field for a token, a key or a password anywhere in it. That is
 * deliberate and permanent.
 */
export default function NewSoftware({
  services,
  taskTemplates,
  websites,
  people,
  unlinkedApps,
}: {
  services: { id: string; name: string }[];
  taskTemplates: { id: string; name: string }[];
  websites: { id: string; name: string }[];
  people: string[];
  unlinkedApps: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [billingModel, setBillingModel] = useState<BillingModel>("subscription");
  const [trial, setTrial] = useState(false);
  const [status, setStatus] = useState("planning");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const recurring = billingModel === "subscription" || billingModel === "subscription_setup";
  const hasSetup = billingModel === "subscription_setup" || billingModel === "one_time" || billingModel === "custom";

  return (
    <>
      <button type="button" className="cc-add-btn" onClick={() => setOpen(true)}>
        <IconPlus size={15} />
        <span>New Software Product</span>
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="New software product">
            <div className="cc-sheet-head">
              <IconCode size={17} />
              <h3>New software product</h3>
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
              <form
                action={(fd) =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      await createSoftwareAction(fd);
                    } catch (err) {
                      // A duplicate slug is the common failure and it needs
                      // to reach the person who typed it, not the console.
                      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
                      setError(err instanceof Error ? err.message : "That did not save.");
                    }
                  })
                }
              >
                <p className="cc-subhead">Basic information</p>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="sw-name">Product name</label>
                  <input
                    id="sw-name"
                    name="name"
                    className="cc-input"
                    autoFocus
                    required
                    placeholder="PoolBusinessAI"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-internal">Internal name</label>
                    <input
                      id="sw-internal"
                      name="internal_name"
                      className="cc-input"
                      placeholder="Only if we call it something else"
                    />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-slug">Slug</label>
                    <input
                      id="sw-slug"
                      name="slug"
                      className="cc-input"
                      placeholder="poolbusinessai"
                      value={slugTouched ? slug : slugify(name)}
                      onChange={(event) => {
                        setSlugTouched(true);
                        setSlug(event.target.value);
                      }}
                    />
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="sw-description">Description</label>
                  <textarea
                    id="sw-description"
                    name="description"
                    className="cc-textarea"
                    rows={2}
                    placeholder="Complete pool service management"
                  />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-type">Product type</label>
                    <select id="sw-type" name="product_type" className="cc-select" defaultValue="saas_platform">
                      {PRODUCT_TYPE_ORDER.map((key) => (
                        <option key={key} value={key}>{PRODUCT_TYPE_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-industry">Industry</label>
                    <input
                      id="sw-industry"
                      name="industry"
                      className="cc-input"
                      list="sw-industry-list"
                      placeholder="Pool Service"
                    />
                    <datalist id="sw-industry-list">
                      {INDUSTRY_SUGGESTIONS.map((industry) => (
                        <option key={industry} value={industry} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-status">Lifecycle status</label>
                    <select
                      id="sw-status"
                      name="status"
                      className="cc-select"
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                    >
                      {LIFECYCLE_ORDER.filter((key) => key !== "archived").map((key) => (
                        <option key={key} value={key}>{LIFECYCLE_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-logo">Logo URL</label>
                    <input id="sw-logo" name="logo_url" className="cc-input" placeholder="https://…" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-owner">Owner</label>
                    <input id="sw-owner" name="owner" className="cc-input" list="sw-people" placeholder="name@…" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-tech-owner">Technical owner</label>
                    <input id="sw-tech-owner" name="technical_owner" className="cc-input" list="sw-people" placeholder="name@…" />
                  </div>
                </div>
                <datalist id="sw-people">
                  {people.map((person) => (
                    <option key={person} value={person} />
                  ))}
                </datalist>

                <p className="cc-subhead">Commercial</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-billing">Billing model</label>
                    <select
                      id="sw-billing"
                      name="billing_model"
                      className="cc-select"
                      value={billingModel}
                      onChange={(event) => setBillingModel(event.target.value as BillingModel)}
                    >
                      {BILLING_MODEL_ORDER.map((key) => (
                        <option key={key} value={key}>{BILLING_MODEL_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-currency">Currency</label>
                    <select id="sw-currency" name="currency" className="cc-select" defaultValue="usd">
                      <option value="usd">USD</option>
                      <option value="cad">CAD</option>
                      <option value="eur">EUR</option>
                      <option value="gbp">GBP</option>
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  {recurring ? (
                    <div className="cc-field">
                      <label className="cc-label" htmlFor="sw-monthly">Default monthly price ($)</label>
                      <input id="sw-monthly" name="default_monthly_price" className="cc-input" inputMode="decimal" placeholder="399" />
                    </div>
                  ) : null}
                  {hasSetup ? (
                    <div className="cc-field">
                      <label className="cc-label" htmlFor="sw-setup">Setup fee ($)</label>
                      <input id="sw-setup" name="setup_fee" className="cc-input" inputMode="decimal" placeholder="1499" />
                    </div>
                  ) : null}
                </div>

                <div className="cc-field">
                  <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      name="trial_available"
                      checked={trial}
                      onChange={(event) => setTrial(event.target.checked)}
                    />
                    <span>Offer a free trial</span>
                  </label>
                </div>

                {trial ? (
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-trial-days">Trial length (days)</label>
                    <input id="sw-trial-days" name="trial_days" className="cc-input" inputMode="numeric" placeholder="14" />
                  </div>
                ) : null}

                <p className="cc-note">
                  These are the LIST terms. What a client actually pays is recorded on
                  their own assignment when they are added, and never changes because a
                  price here changed later.
                </p>

                <p className="cc-subhead">Relationships</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-service">Default service</label>
                    <select id="sw-service" name="default_service_id" className="cc-select" defaultValue="">
                      <option value="">None yet</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>{service.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-template">Default project template</label>
                    <select id="sw-template" name="default_task_template_id" className="cc-select" defaultValue="">
                      <option value="">None yet</option>
                      {taskTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="sw-website">Marketing website</label>
                  <select id="sw-website" name="website_id" className="cc-select" defaultValue="">
                    <option value="">None</option>
                    {websites.map((website) => (
                      <option key={website.id} value={website.id}>{website.name}</option>
                    ))}
                  </select>
                </div>

                {unlinkedApps.length > 0 ? (
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-apps">Apps this product is built from</label>
                    <select id="sw-apps" name="app_ids" className="cc-select" multiple size={Math.min(6, unlinkedApps.length)}>
                      {unlinkedApps.map((app) => (
                        <option key={app.id} value={app.id}>{app.name}</option>
                      ))}
                    </select>
                    <p className="cc-note" style={{ marginTop: 6 }}>
                      Only apps not already claimed by another product are listed. They keep
                      their own deployments, environments and health — this just says which
                      product they belong to.
                    </p>
                  </div>
                ) : null}

                <p className="cc-subhead">Release</p>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-version">Current version</label>
                    <input id="sw-version" name="current_version" className="cc-input" placeholder="v1.0.0" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="sw-channel">Release channel</label>
                    <select id="sw-channel" name="release_channel" className="cc-select" defaultValue="stable">
                      {CHANNEL_ORDER.map((key) => (
                        <option key={key} value={key}>{CHANNEL_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="sw-launch">Launch date</label>
                  <input id="sw-launch" name="launch_date" className="cc-input" type="date" />
                </div>

                <p className="cc-note">
                  A version typed here is recorded as this product&rsquo;s first version. It is
                  only marked as live in production if the lifecycle status above is Live —
                  otherwise it is a draft, because a product that has not launched has not
                  shipped a production version.
                </p>

                {error ? (
                  <p className="cc-error" style={{ marginTop: 12 }}>{error}</p>
                ) : null}

                <div className="cc-sheet-foot">
                  <button type="submit" className="cc-btn primary" disabled={pending}>
                    {pending ? "Saving…" : "Create product"}
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
