"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BUSINESS_TYPES,
  SERVICE_OPTIONS,
  TIMELINES,
  HOSTING_DISCLOSURE,
} from "@/lib/campaign/config";
import { getAttribution } from "@/lib/campaign/attribution";
import { newEventId, trackConversion } from "@/lib/analytics";

const CONSENT_TEXT =
  "By submitting this form I agree to be contacted by Tomorrow's Tech AI about my request by email or phone.";

type FieldErrors = Partial<Record<string, string>>;

export function LeadForm() {
  const router = useRouter();
  const [services, setServices] = useState<string[]>([]);
  const [website, setWebsite] = useState<"yes" | "no" | "">("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  // Set on mount, not during render — the clock is not a pure value.
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  function toggleService(value: string) {
    setServices((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const elapsed = startedAt.current ? Date.now() - startedAt.current : 0;

    const payload = {
      first_name: String(fd.get("first_name") ?? "").trim(),
      last_name: String(fd.get("last_name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      business_name: String(fd.get("business_name") ?? "").trim(),
      business_type: String(fd.get("business_type") ?? "").trim(),
      current_website: website,
      services_interested: services,
      timeline: String(fd.get("timeline") ?? "").trim(),
      sms_consent: fd.get("sms_consent") === "on",
      consent_text: CONSENT_TEXT,
      // Spam traps: a field no human sees, and a form filled in under 2s.
      hp_company_url: String(fd.get("hp_company_url") ?? ""),
      elapsed_ms: elapsed,
      attribution: getAttribution(),
      event_id: newEventId(),
    };

    const nextErrors: FieldErrors = {};
    if (!payload.first_name) nextErrors.first_name = "Required";
    if (!payload.last_name) nextErrors.last_name = "Required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))
      nextErrors.email = "Enter a valid email";
    if (payload.phone.replace(/\D/g, "").length < 10)
      nextErrors.phone = "Enter a 10-digit phone number";
    if (!payload.business_name) nextErrors.business_name = "Required";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setState("error");
      setError("Check the highlighted fields.");
      return;
    }

    setErrors({});
    setState("sending");
    setError("");

    try {
      const res = await fetch("/api/business-launch/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");

      // Browser half of the conversion. The server sends the same event_id
      // to the Conversions API so Meta counts it once.
      trackConversion({
        meta: "Lead",
        ga: "business_launch_lead",
        eventId: payload.event_id,
        params: {
          content_name: "$399 Business Launch",
          value: 399,
          currency: "USD",
          business_type: payload.business_type || "unspecified",
          timeline: payload.timeline || "unspecified",
        },
      });

      router.push("/business-launch/thank-you");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="bl-form" noValidate>
      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div className="bl-hp" aria-hidden="true">
        <label htmlFor="hp_company_url">Company URL</label>
        <input
          id="hp_company_url"
          name="hp_company_url"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="bl-form-grid">
        <Field label="First name" name="first_name" autoComplete="given-name" error={errors.first_name} required />
        <Field label="Last name" name="last_name" autoComplete="family-name" error={errors.last_name} required />
      </div>

      <div className="bl-form-grid">
        <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" error={errors.email} required />
        <Field label="Phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" error={errors.phone} required />
      </div>

      <Field label="Business name" name="business_name" autoComplete="organization" error={errors.business_name} required />

      <div className="bl-field">
        <label htmlFor="business_type" className="bl-label">
          Business type
        </label>
        <select id="business_type" name="business_type" className="bl-input" defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="bl-field">
        <legend className="bl-label">Do you currently have a website?</legend>
        <div className="bl-choices">
          {(["yes", "no"] as const).map((v) => (
            <button
              type="button"
              key={v}
              onClick={() => setWebsite(v)}
              aria-pressed={website === v}
              className={`bl-choice ${website === v ? "is-on" : ""}`}
            >
              {v === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="bl-field">
        <legend className="bl-label">What do you need?</legend>
        <div className="bl-choices">
          {SERVICE_OPTIONS.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => toggleService(s)}
              aria-pressed={services.includes(s)}
              className={`bl-choice ${services.includes(s) ? "is-on" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="bl-field">
        <label htmlFor="timeline" className="bl-label">
          When would you like to get started?
        </label>
        <select id="timeline" name="timeline" className="bl-input" defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {TIMELINES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <label className="bl-consent">
        <input type="checkbox" name="sms_consent" />
        <span>
          Text me too. Message and data rates may apply, reply STOP to opt out.
          Optional — leaving this unchecked doesn&apos;t slow anything down.
        </span>
      </label>

      {state === "error" && error && (
        <p role="alert" className="bl-error">
          {error}
        </p>
      )}

      <button type="submit" className="bl-submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Get My $399 Business Launch"}
      </button>

      <p className="bl-fineprint">
        {CONSENT_TEXT} No payment now — we confirm the details first.{" "}
        {HOSTING_DISCLOSURE}
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  error,
  required,
  autoComplete,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel";
}) {
  return (
    <div className="bl-field">
      <label htmlFor={name} className="bl-label">
        {label}
        {required && <span className="bl-req"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`bl-input ${error ? "is-bad" : ""}`}
      />
      {error && (
        <span id={`${name}-error`} className="bl-field-error">
          {error}
        </span>
      )}
    </div>
  );
}
