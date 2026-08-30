"use client";

import { useEffect, useState, useTransition } from "react";
import { addClient } from "@/app/admin/client-actions";
import { IconPlus, IconUsers, IconX } from "./Icons";

/**
 * Adding a client by hand.
 *
 * Most clients arrive on their own — the Stripe webhook creates one the
 * moment a checkout is paid. This is for the ones that did not come through
 * the funnel: a referral, an existing customer from before the CRM, work
 * invoiced some other way.
 */
export default function AddClient() {
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
        <span>Add client</span>
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="New client">
            <div className="cc-sheet-head">
              <IconUsers size={17} />
              <h3>New client</h3>
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
                    await addClient(fd);
                    setOpen(false);
                  })
                }
              >
                <div className="cc-field">
                  <label className="cc-label" htmlFor="ac-biz">Business name</label>
                  <input id="ac-biz" name="business_name" className="cc-input" autoFocus />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ac-name">Contact name</label>
                    <input id="ac-name" name="name" className="cc-input" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ac-type">Industry</label>
                    <input id="ac-type" name="business_type" className="cc-input" placeholder="Roofing" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ac-email">Email</label>
                    <input id="ac-email" name="email" type="email" className="cc-input" required />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ac-phone">Phone</label>
                    <input id="ac-phone" name="phone" className="cc-input" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ac-city">City</label>
                    <input id="ac-city" name="city" className="cc-input" placeholder="Austin" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ac-state">State</label>
                    <input id="ac-state" name="state" className="cc-input" placeholder="TX" />
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ac-owner">Owner</label>
                    <input id="ac-owner" name="owner" className="cc-input" placeholder="John" />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="ac-mrr">Monthly recurring ($)</label>
                    <input id="ac-mrr" name="mrr" className="cc-input" inputMode="decimal" placeholder="29" />
                  </div>
                </div>

                <p className="cc-note">
                  No Stripe subscription is created by this. It records a client
                  you already have — billing them through Stripe is a separate,
                  deliberate step from their own page.
                </p>

                <div className="cc-sheet-foot">
                  <button type="submit" className="cc-btn primary" disabled={pending}>
                    {pending ? "Saving…" : "Add client"}
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
