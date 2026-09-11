"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Service pages link here with ?service=…&plan=… so the enquiry arrives already
 * saying which package was chosen.
 *
 * Read from window.location rather than useSearchParams: this form renders
 * inside a statically prerendered page, and useSearchParams would force a
 * Suspense boundary on it at build time.
 *
 * The value is written straight onto the textarea through a ref rather than
 * held in state. Calling setState in an effect trips react-hooks/set-state-in-
 * effect and costs a second render for a value that never changes again; the
 * textarea is uncontrolled either way. Server renders it empty, so there is no
 * hydration mismatch.
 */
const SERVICE_LABELS: Record<string, string> = {
  "grow-your-audience": "Grow Your Audience",
  "business-operating-system": "Business Operating System",
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter — $199/mo",
  growth: "Growth — $399/mo",
  "full-service": "Full Service — $699/mo",
  custom: "Custom Growth System — from $999/mo",
};

function prefillFromQuery(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const service = SERVICE_LABELS[params.get("service") ?? ""];
  if (!service) return "";
  const plan = PLAN_LABELS[params.get("plan") ?? ""];
  return plan
    ? `I'd like to talk about the ${service} service — ${plan}.\n\n`
    : `I'd like to talk about the ${service} service.\n\n`;
}

export function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string>("");
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = messageRef.current;
    // Never clobber something the visitor has already typed.
    if (!el || el.value) return;
    el.value = prefillFromQuery();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError("");

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      company: (form.elements.namedItem("company") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong");
      }
      setState("sent");
      form.reset();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  if (state === "sent") {
    return (
      <div className="card card-accent p-10">
        <div className="eyebrow mb-3">● Message received</div>
        <h2 className="text-2xl font-medium mb-3">Talk soon.</h2>
        <p className="text-[color:var(--color-text-secondary)]">
          We&apos;ll be in touch within one business day. If it&apos;s urgent,
          email{" "}
          <a
            href="mailto:john@tomorrowstechai.com"
            className="text-[color:var(--color-cyan)] underline"
          >
            john@tomorrowstechai.com
          </a>{" "}
          directly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-8 space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        <Field name="name" label="Name" required />
        <Field name="email" label="Email" type="email" required />
      </div>
      <Field name="company" label="Company" />
      <div>
        <label
          htmlFor="message"
          className="block text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)] mb-2"
        >
          What are you working on?
        </label>
        <textarea
          id="message"
          name="message"
          rows={6}
          required
          ref={messageRef}
          placeholder="Tell us what you need — a Job Catcher missed-call setup, public website, admin backend, CRM, dashboards, apps, workflows, social systems, or something else..."
          className="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-md px-4 py-3 text-[color:var(--color-text)] placeholder-[color:var(--color-text-muted)] focus:border-[color:var(--color-cyan)] focus:outline-none transition-colors"
        />
      </div>
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-[color:var(--color-text-muted)] font-mono uppercase tracking-wider">
          Propose · Never Act
        </p>
        <button
          type="submit"
          disabled={state === "sending"}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === "sending" ? "Sending…" : "Send →"}
        </button>
      </div>
      {state === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{error}</p>
      )}
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)] mb-2"
      >
        {label}
      </label>
      <input
        type={type}
        id={name}
        name={name}
        required={required}
        className="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-md px-4 py-3 text-[color:var(--color-text)] placeholder-[color:var(--color-text-muted)] focus:border-[color:var(--color-cyan)] focus:outline-none transition-colors"
      />
    </div>
  );
}
