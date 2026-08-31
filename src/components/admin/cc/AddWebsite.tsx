"use client";

import { useEffect, useState, useTransition } from "react";
import { addWebsiteAction } from "@/app/admin/website-actions";
import { IconGlobe, IconPlus, IconX } from "./Icons";

/**
 * Adding a website to the portfolio.
 *
 * Deliberately one short form rather than the twelve-step wizard the spec
 * sketched. A wizard that provisions a domain, a Vercel project, a Stripe
 * subscription and a project plan is a different feature with real money and
 * real DNS behind it; this records a site we already manage, which is the
 * step that has to exist first and is the only one that is safe today.
 */
export default function AddWebsite({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="cc-add-btn" onClick={() => setOpen(true)}>
        <IconPlus size={15} />
        <span>New website</span>
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="New website">
            <div className="cc-sheet-head">
              <IconGlobe size={17} />
              <h3>New website</h3>
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
                    await addWebsiteAction(fd);
                    setOpen(false);
                  })
                }
              >
                <div className="cc-field">
                  <label className="cc-label" htmlFor="aw-name">Website name</label>
                  <input id="aw-name" name="name" className="cc-input" autoFocus required placeholder="Clearwater Pool Service" />
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="aw-domain">Domain</label>
                  <input id="aw-domain" name="domain" className="cc-input" required placeholder="clearwaterpools.com" />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="aw-status">Status</label>
                    <select id="aw-status" name="status" className="cc-select" defaultValue="development">
                      <option value="live">Live</option>
                      <option value="development">Development</option>
                      <option value="waiting_on_client">Waiting on client</option>
                      <option value="review">Review</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="aw-type">Type</label>
                    <select id="aw-type" name="website_type" className="cc-select" defaultValue="business">
                      <option value="business">Business website</option>
                      <option value="ecommerce">Ecommerce</option>
                      <option value="web_app">Web app</option>
                      <option value="saas">SaaS</option>
                      <option value="portfolio">Portfolio</option>
                      <option value="landing_page">Landing page</option>
                      <option value="client_portal">Client portal</option>
                      <option value="membership">Membership site</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="aw-client">Client</label>
                    <select id="aw-client" name="customer_id" className="cc-select" defaultValue="">
                      <option value="">Ours — no client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="aw-host">Hosting provider</label>
                    <input id="aw-host" name="hosting_provider" className="cc-input" placeholder="Vercel" />
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="aw-owner">Owner</label>
                  <input id="aw-owner" name="owner" className="cc-input" placeholder="John" />
                </div>

                <p className="cc-note">
                  This records a site you already manage. It does not buy a domain,
                  create a hosting project, or start a subscription — those stay
                  deliberate, separate steps. The same domain cannot be added twice,
                  with or without <code>www</code>.
                </p>

                <div className="cc-sheet-foot">
                  <button type="submit" className="cc-btn primary" disabled={pending}>
                    {pending ? "Saving…" : "Add website"}
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
