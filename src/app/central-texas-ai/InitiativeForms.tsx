"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { IconArrowRight, IconBadgeCheck, IconUsers } from "@/components/Icons";
import {
  AI_USE_OPTIONS,
  MODERNIZATION_OPTIONS,
  ORGANIZATION_TYPES,
  PARTNERSHIP_OPTIONS,
  PILOT_INTEREST_OPTIONS,
  type InitiativeKind,
} from "@/lib/central-texas-ai/config";
import styles from "./initiative.module.css";

type FormStatus = "idle" | "submitting" | "success" | "error";

function useInitiativeForm(kind: InitiativeKind) {
  const startedAt = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  // Bring the thank-you panel into view and give it focus, so a phone user who
  // tapped submit at the bottom of a long form actually sees the result.
  useEffect(() => {
    if (status !== "success" || !panelRef.current) return;
    panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    panelRef.current.focus({ preventScroll: true });
  }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload: Record<string, unknown> = Object.fromEntries(data.entries());
    payload.kind = kind;
    payload.elapsed_ms = String(Date.now() - (startedAt.current ?? 0));
    payload.modernization = data.getAll("modernization");
    payload.partnership_interest = data.getAll("partnership_interest");

    try {
      const response = await fetch("/api/central-texas-ai/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "We could not submit your information. Please try again.");
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  function reset() {
    startedAt.current = Date.now();
    setStatus("idle");
    setError("");
  }

  return { status, error, submit, reset, panelRef };
}

function ErrorNotice({ message }: { message: string }) {
  if (!message) return null;
  return <p className={styles.formError} role="alert">{message}</p>;
}

function SuccessPanel({
  id,
  panelRef,
  lead,
  copy,
  onReset,
  resetLabel,
}: {
  id: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  lead: string;
  copy: string;
  onReset: () => void;
  resetLabel: string;
}) {
  return (
    <div id={id} ref={panelRef} tabIndex={-1} className={`${styles.formCard} ${styles.successCard}`} role="status" aria-live="polite">
      <span className={styles.successIcon}><IconBadgeCheck size={30} /></span>
      <h3>Thank You</h3>
      <p className={styles.successLead}>{lead}</p>
      <p>{copy}</p>
      <p className={styles.successNote}>A confirmation email is on its way. Submitting does not mean acceptance, approval, funding, or guaranteed participation.</p>
      <button type="button" className={styles.successReset} onClick={onReset}>{resetLabel}</button>
    </div>
  );
}

export function InitiativeForms() {
  const business = useInitiativeForm("business");
  const partner = useInitiativeForm("partner");

  return (
    <section className={`${styles.section} ${styles.formsSection}`}>
      <div className={styles.formIntro}>
        <p className={styles.eyebrow}>Two ways to take part</p>
        <h2>Help Shape the Proposed Pilot</h2>
        <p>Expressions of interest help demonstrate regional demand and identify potential participants and partners. They do not guarantee acceptance, funding, or services.</p>
      </div>

      <div className={styles.formGrid}>
        {business.status === "success" ? (
          <SuccessPanel
            id="business-interest"
            panelRef={business.panelRef}
            lead="Your interest has been received."
            copy="We are currently identifying Central Texas businesses interested in the proposed pilot. Our team may contact you for additional information."
            onReset={business.reset}
            resetLabel="Submit for another business"
          />
        ) : (
          <form id="business-interest" className={styles.formCard} onSubmit={business.submit}>
            <div className={styles.formHeader}><IconArrowRight /><div><span>For local businesses</span><h3>Interested in Joining the Pilot?</h3></div></div>
            <p>Tell us about your business. This is an expression of interest only and does not guarantee program acceptance or funding.</p>
            <input name="hp_company_url" className={styles.honeypot} tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div className={styles.fields}>
              <label>Business Name<input name="business_name" required maxLength={200} autoComplete="organization" /></label>
              <label>Contact Name<input name="contact_name" required maxLength={150} autoComplete="name" /></label>
              <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" inputMode="email" /></label>
              <label>Phone<input name="phone" type="tel" required maxLength={40} autoComplete="tel" inputMode="tel" /></label>
              <label>City<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
              <label>ZIP Code<input name="zip" required inputMode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" maxLength={10} autoComplete="postal-code" /></label>
              <label>Industry<input name="industry" required maxLength={120} /></label>
              <label>Number of Employees<input name="employee_count" required type="number" inputMode="numeric" min="1" max="100000" /></label>
              <label className={styles.full}>Current use of AI<select name="ai_use" required defaultValue=""><option value="" disabled>Select one</option>{AI_USE_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></label>
            </div>
            <fieldset><legend>What would you like help modernizing?</legend><div className={styles.checkGrid}>{MODERNIZATION_OPTIONS.map((option) => <label key={option}><input type="checkbox" name="modernization" value={option} />{option}</label>)}</div></fieldset>
            <label>Biggest operational challenge<textarea name="challenge" required maxLength={2000} rows={5} /></label>
            <label className={styles.spaced}>Would you be interested in participating in the pilot?<select name="pilot_interest" required defaultValue=""><option value="" disabled>Select one</option>{PILOT_INTEREST_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></label>
            <label className={styles.consent}><input type="checkbox" name="consent" value="yes" required />I give Tomorrow’s Tech AI permission to contact me regarding the Central Texas AI Business Modernization Initiative.</label>
            <button disabled={business.status === "submitting"}>{business.status === "submitting" ? "Submitting…" : "Submit Business Interest"}<IconArrowRight /></button>
            <ErrorNotice message={business.error} />
          </form>
        )}

        {partner.status === "success" ? (
          <SuccessPanel
            id="partner-interest"
            panelRef={partner.panelRef}
            lead="Your partnership inquiry has been received."
            copy="Our team will review your information and may contact you to discuss potential collaboration opportunities."
            onReset={partner.reset}
            resetLabel="Submit another inquiry"
          />
        ) : (
          <form id="partner-interest" className={`${styles.formCard} ${styles.partnerForm}`} onSubmit={partner.submit}>
            <div className={styles.formHeader}><IconUsers /><div><span>For organizations</span><h3>Start a Partnership Discussion</h3></div></div>
            <p>Tell us how your organization could support practical business modernization across Central Texas.</p>
            <input name="hp_company_url" className={styles.honeypot} tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div className={styles.fields}>
              <label>Organization Name<input name="organization_name" required maxLength={200} autoComplete="organization" /></label>
              <label>Contact Name<input name="contact_name" required maxLength={150} autoComplete="name" /></label>
              <label>Title<input name="title" required maxLength={120} autoComplete="organization-title" /></label>
              <label>Organization Type<select name="organization_type" required defaultValue=""><option value="" disabled>Select one</option>{ORGANIZATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" inputMode="email" /></label>
              <label>Phone<input name="phone" type="tel" required maxLength={40} autoComplete="tel" inputMode="tel" /></label>
              <label>City<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
              <label>Website<input name="website" type="url" maxLength={300} placeholder="https://" autoComplete="url" inputMode="url" /></label>
            </div>
            <fieldset><legend>Partnership Interest</legend><div className={styles.checkGrid}>{PARTNERSHIP_OPTIONS.map((option) => <label key={option}><input type="checkbox" name="partnership_interest" value={option} />{option}</label>)}</div></fieldset>
            <label>Message<textarea name="message" required maxLength={2500} rows={7} /></label>
            <label className={styles.consent}><input type="checkbox" name="consent" value="yes" required />I give Tomorrow’s Tech AI permission to contact me about this partnership inquiry.</label>
            <button disabled={partner.status === "submitting"}>{partner.status === "submitting" ? "Submitting…" : "Request a Partnership Discussion"}<IconArrowRight /></button>
            <ErrorNotice message={partner.error} />
          </form>
        )}
      </div>
    </section>
  );
}
