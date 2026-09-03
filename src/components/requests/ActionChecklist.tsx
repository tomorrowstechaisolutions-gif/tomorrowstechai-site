"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { RequestTemplate } from "@/lib/requests/config";
import type { ClientRequest } from "@/lib/requests/types";

/**
 * What the client sees when they open the link in the email.
 *
 * One page, not a wizard. The intake wizard earns its five steps because it
 * collects a whole website's worth of content; this collects four answers
 * about one job, and paging that would make a ten-minute task feel like a
 * form. Everything is visible, everything saves as they go, and the submit
 * button is the only thing at the bottom.
 *
 * Written for someone reading it on a phone with one hand. Tap targets are
 * large, nothing depends on hover, and no instruction assumes they know what
 * a DNS record is.
 */

type Props = {
  token: string;
  request: ClientRequest;
  template: RequestTemplate;
};

export function ActionChecklist({ token, request, template }: Props) {
  const [steps, setSteps] = useState<string[]>(request.steps_done);
  const [values, setValues] = useState<Record<string, string>>(request.payload ?? {});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(request.status === "completed");

  // The save in flight. A client ticking three boxes quickly must not have
  // the first response overwrite the third tick.
  const seq = useRef(0);

  const save = useCallback(
    async (nextSteps: string[], nextValues: Record<string, string>) => {
      const mine = ++seq.current;
      setSaving(true);
      try {
        await fetch("/api/action/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, steps: nextSteps, payload: nextValues }),
        });
        if (mine === seq.current) setSavedAt(Date.now());
      } catch {
        // A failed autosave is not worth interrupting anyone over — the
        // submit at the end sends the whole thing again anyway.
      } finally {
        if (mine === seq.current) setSaving(false);
      }
    },
    [token]
  );

  const toggleStep = (id: string) => {
    const next = steps.includes(id) ? steps.filter((s) => s !== id) : [...steps, id];
    setSteps(next);
    void save(next, values);
  };

  const setField = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const commitField = () => void save(steps, values);

  const toggleConfirm = (key: string) => {
    const k = `confirm_${key}`;
    const next = { ...values, [k]: values[k] === "yes" ? "" : "yes" };
    setValues(next);
    void save(steps, next);
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/action/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, steps, payload: values }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Try again, or call us.");
        return;
      }
      if (body?.missing?.length) {
        setMissing(body.missing as string[]);
        return;
      }
      setMissing([]);
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const progress = useMemo(
    () => ({ done: steps.length, total: template.steps.length }),
    [steps.length, template.steps.length]
  );

  if (done) {
    return (
      <main className="itk-page">
        <div className="itk-shell itk-shell--narrow">
          <div className="itk-brandline">Tomorrow&rsquo;s Tech AI</div>
          <div className="act-done">
            <div className="act-done-mark" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="itk-h1">That&rsquo;s done</h1>
            <p className="itk-lead">
              We have everything we need on this one. Nothing else is on you —
              the next thing you hear from us will be progress.
            </p>
            <p className="itk-fineprint">
              A confirmation is on its way to your inbox. If something changes,
              or you sent the wrong thing, just reply to it.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="itk-page">
      <div className="itk-shell">
        <div className="itk-brandline">Tomorrow&rsquo;s Tech AI</div>
        <h1 className="itk-h1">{template.title}</h1>
        <p className="itk-lead">{template.emailIntro}</p>

        <div className="act-facts">
          <div>
            <span>Time</span>
            <b>{template.minutes} min</b>
          </div>
          <div>
            <span>Steps</span>
            <b>
              {progress.done} of {progress.total}
            </b>
          </div>
          <div>
            <span>Who</span>
            <b>Only you</b>
          </div>
        </div>

        {request.note ? <div className="act-note">{request.note}</div> : null}

        <section className="act-why">
          <h2 className="itk-h2">Why this part is yours</h2>
          <p className="itk-blurb">{template.why}</p>
        </section>

        <ol className="act-steps">
          {template.steps.map((step, i) => {
            const ticked = steps.includes(step.id);
            return (
              <li key={step.id} className="act-step" data-done={ticked}>
                <div className="act-step-head">
                  <span className="act-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{step.title}</h3>
                </div>

                <div className="act-body">
                  {step.body.map((para, n) => (
                    <p key={n}>{para}</p>
                  ))}

                  {step.callout ? <p className="act-callout">{step.callout}</p> : null}

                  {step.link ? (
                    <a
                      className="act-link"
                      href={step.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {step.link.label} &rarr;
                    </a>
                  ) : null}

                  <label className="act-tick" data-checked={ticked}>
                    <input
                      type="checkbox"
                      checked={ticked}
                      onChange={() => toggleStep(step.id)}
                    />
                    <span>{ticked ? "Done" : "Mark this done"}</span>
                  </label>
                </div>
              </li>
            );
          })}
        </ol>

        {template.fields.length ? (
          <section className="itk-card act-form">
            <div className="itk-card-head">
              <span className="itk-step-of">What to send back</span>
              <h2 className="itk-h2">A few details and you&rsquo;re finished</h2>
            </div>

            <div className="itk-fields">
              {template.fields.map((field) => {
                const id = `f-${field.key}`;
                const value = values[field.key] ?? "";

                return (
                  <fieldset key={field.key} className="itk-field">
                    <label className="itk-label" htmlFor={id}>
                      {field.label} {field.required ? <em>*</em> : null}
                    </label>
                    {field.help ? <span className="itk-hint">{field.help}</span> : null}

                    {field.type === "textarea" ? (
                      <textarea
                        id={id}
                        value={value}
                        maxLength={field.max}
                        placeholder={field.placeholder}
                        onChange={(e) => setField(field.key, e.target.value)}
                        onBlur={commitField}
                      />
                    ) : field.type === "select" ? (
                      <div className="itk-choices itk-choices--stack">
                        {(field.options ?? []).map((option) => (
                          <label
                            key={option}
                            className="itk-choice"
                            data-selected={value === option}
                          >
                            <input
                              type="radio"
                              name={field.key}
                              value={option}
                              checked={value === option}
                              onChange={() => {
                                const next = { ...values, [field.key]: option };
                                setValues(next);
                                void save(steps, next);
                              }}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        id={id}
                        type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
                        value={value}
                        maxLength={field.max}
                        placeholder={field.placeholder}
                        onChange={(e) => setField(field.key, e.target.value)}
                        onBlur={commitField}
                      />
                    )}
                  </fieldset>
                );
              })}

              {template.confirm.map((box) => {
                const checked = values[`confirm_${box.key}`] === "yes";
                return (
                  <label key={box.key} className="itk-attest" data-checked={checked}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleConfirm(box.key)}
                    />
                    <span>{box.label}</span>
                  </label>
                );
              })}
            </div>

            {missing.length ? (
              <div className="itk-missing">
                <strong>Still needed before you can finish:</strong>
                <ul>
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error ? <div className="itk-alert">{error}</div> : null}

            <div className="itk-actions">
              <span className="itk-hint">
                {saving ? "Saving…" : savedAt ? "Saved" : "Saves as you go"}
              </span>
              <button
                type="button"
                className="itk-btn itk-btn--primary"
                onClick={submit}
                disabled={saving}
              >
                I&rsquo;m done &rarr;
              </button>
            </div>
          </section>
        ) : null}

        <p className="itk-fineprint">
          This link is yours — please don&rsquo;t forward it. Stuck on any of
          this? Call John on (254) 563-2130 and we&rsquo;ll do it together.
          We will never ask you for a password, a bank login or a card number.
        </p>
      </div>
    </main>
  );
}
