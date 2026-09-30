"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { IconArrowRight, IconBadgeCheck, IconUsers } from "@/components/Icons";
import styles from "./initiative.module.css";

type FormStatus = "idle" | "submitting" | "success" | "error";

function useInitiativeForm(kind: "business" | "partner") {
  const startedAt = useRef<number | null>(null);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
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
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not submit your interest.");
      form.reset();
      setStatus("success");
      setMessage(kind === "business" ? "Thank you. Your business interest has been received." : "Thank you. Your partnership inquiry has been received.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  return { status, message, submit };
}

const modernizationOptions = ["Customer service", "Phone / AI receptionist", "CRM", "Scheduling", "Workflow automation", "Website", "E-commerce", "Marketing", "Social media", "Employee productivity", "Data / reporting", "Other"];
const partnerOptions = ["Funding / Grant Partnership", "Business Recruitment", "Workforce Training", "Education", "Program Sponsorship", "Economic Development", "Community Outreach", "Other"];

function Notice({ status, message }: { status: FormStatus; message: string }) {
  if (!message) return null;
  return <p className={status === "success" ? styles.success : styles.formError} role="status">{status === "success" ? <IconBadgeCheck /> : null}{message}</p>;
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
        <form id="business-interest" className={styles.formCard} onSubmit={business.submit}>
          <div className={styles.formHeader}><IconArrowRight /><div><span>For local businesses</span><h3>Interested in Joining the Pilot?</h3></div></div>
          <p>Tell us about your business. This is an expression of interest only and does not guarantee program acceptance or funding.</p>
          <input name="hp_company_url" className={styles.honeypot} tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <div className={styles.fields}>
            <label>Business Name<input name="business_name" required maxLength={200} /></label>
            <label>Contact Name<input name="contact_name" required maxLength={150} autoComplete="name" /></label>
            <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
            <label>Phone<input name="phone" type="tel" required maxLength={40} autoComplete="tel" /></label>
            <label>City<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
            <label>ZIP Code<input name="zip" required inputMode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" maxLength={10} autoComplete="postal-code" /></label>
            <label>Industry<input name="industry" required maxLength={120} /></label>
            <label>Number of Employees<input name="employee_count" required type="number" min="1" max="100000" /></label>
            <label className={styles.full}>Current use of AI<select name="ai_use" required defaultValue=""><option value="" disabled>Select one</option><option>None</option><option>Limited</option><option>Some AI tools</option><option>Advanced</option></select></label>
          </div>
          <fieldset><legend>What would you like help modernizing?</legend><div className={styles.checkGrid}>{modernizationOptions.map((option) => <label key={option}><input type="checkbox" name="modernization" value={option} />{option}</label>)}</div></fieldset>
          <label>Biggest operational challenge<textarea name="challenge" required maxLength={2000} rows={5} /></label>
          <label>Would you be interested in participating in the pilot?<select name="pilot_interest" required defaultValue=""><option value="" disabled>Select one</option><option>Yes</option><option>Maybe</option><option>I would like more information</option></select></label>
          <label className={styles.consent}><input type="checkbox" name="consent" value="yes" required />I give Tomorrow’s Tech AI permission to contact me regarding the Central Texas AI Business Modernization Initiative.</label>
          <button disabled={business.status === "submitting"}>{business.status === "submitting" ? "Submitting…" : "Submit Business Interest"}<IconArrowRight /></button>
          <Notice status={business.status} message={business.message} />
        </form>

        <form id="partner-interest" className={styles.formCard} onSubmit={partner.submit}>
          <div className={styles.formHeader}><IconUsers /><div><span>For organizations</span><h3>Start a Partnership Discussion</h3></div></div>
          <p>Tell us how your organization could support practical business modernization across Central Texas.</p>
          <input name="hp_company_url" className={styles.honeypot} tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <div className={styles.fields}>
            <label>Organization Name<input name="organization_name" required maxLength={200} /></label>
            <label>Contact Name<input name="contact_name" required maxLength={150} autoComplete="name" /></label>
            <label>Title<input name="title" required maxLength={120} /></label>
            <label>Organization Type<select name="organization_type" required defaultValue=""><option value="" disabled>Select one</option>{["Economic Development Corporation", "City / County", "Workforce Organization", "College / University", "Nonprofit", "Chamber of Commerce", "Government Agency", "Other"].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
            <label>Phone<input name="phone" type="tel" required maxLength={40} autoComplete="tel" /></label>
            <label>City<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
            <label>Website<input name="website" type="url" maxLength={300} placeholder="https://" autoComplete="url" /></label>
          </div>
          <fieldset><legend>Partnership Interest</legend><div className={styles.checkGrid}>{partnerOptions.map((option) => <label key={option}><input type="checkbox" name="partnership_interest" value={option} />{option}</label>)}</div></fieldset>
          <label>Message<textarea name="message" required maxLength={2500} rows={7} /></label>
          <label className={styles.consent}><input type="checkbox" name="consent" value="yes" required />I give Tomorrow’s Tech AI permission to contact me about this partnership inquiry.</label>
          <button disabled={partner.status === "submitting"}>{partner.status === "submitting" ? "Submitting…" : "Request a Partnership Discussion"}<IconArrowRight /></button>
          <Notice status={partner.status} message={partner.message} />
        </form>
      </div>
    </section>
  );
}
