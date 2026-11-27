"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SPAM_TRAP_FIELD } from "@/lib/spam-trap";

type Props = {
  /** "course" joins a founding-student list; "corporate" asks about team training. */
  kind?: "course" | "corporate";
  /** Course slug. Leave empty for "any course". */
  course?: string;
  buttonLabel?: string;
  successTitle?: string;
  successBody?: string;
};

const field =
  "w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-md px-3 py-2.5 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-blue)] disabled:opacity-50";
const label = "block text-[11px] font-mono uppercase tracking-widest text-[color:var(--color-text-muted)] mb-1.5";

export function WaitlistForm({
  kind = "course",
  course,
  buttonLabel = "Save my founding seat →",
  successTitle = "You're on the list.",
  successBody = "You'll hear from me before anyone else when it opens, at the founding student price.",
}: Props) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const trapRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const data = new FormData(e.currentTarget);
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/academy/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          course,
          name: data.get("name"),
          email: data.get("email"),
          company: data.get("company") ?? "",
          team_size: data.get("team_size") ?? "",
          message: data.get("message") ?? "",
          [SPAM_TRAP_FIELD]: trapRef.current?.value ?? "",
          ...(startedAt.current ? { elapsed_ms: Date.now() - startedAt.current } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="ac-success" role="status">
        <div className="ac-kicker">✓ Saved</div>
        <p className="text-lg font-medium mb-1">{successTitle}</p>
        <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">{successBody}</p>
      </div>
    );
  }

  const busy = status === "sending";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="bl-hp" aria-hidden="true">
        <label>
          Leave this empty
          <input ref={trapRef} name={SPAM_TRAP_FIELD} type="text" tabIndex={-1} autoComplete="off" data-lpignore="true" data-1p-ignore="true" defaultValue="" />
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor={`ac-name-${kind}`}>Name</label>
          <input id={`ac-name-${kind}`} name="name" required maxLength={150} autoComplete="name" disabled={busy} className={field} />
        </div>
        <div>
          <label className={label} htmlFor={`ac-email-${kind}`}>Email</label>
          <input id={`ac-email-${kind}`} name="email" type="email" required maxLength={200} autoComplete="email" disabled={busy} className={field} />
        </div>
      </div>
      {kind === "corporate" && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="ac-company">Company</label>
              <input id="ac-company" name="company" required maxLength={200} autoComplete="organization" disabled={busy} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="ac-team">Team size</label>
              <select id="ac-team" name="team_size" disabled={busy} className={field} defaultValue="">
                <option value="">Choose one</option>
                <option>1–5 people</option>
                <option>6–20 people</option>
                <option>21–50 people</option>
                <option>50+ people</option>
              </select>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="ac-message">What should your team be able to do afterwards?</label>
            <textarea id="ac-message" name="message" rows={3} maxLength={2000} disabled={busy} className={field} />
          </div>
        </>
      )}
      <button type="submit" disabled={busy} className="btn-primary text-sm w-full sm:w-auto justify-center disabled:opacity-50">
        {busy ? "Saving…" : buttonLabel}
      </button>
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
      <p className="text-xs text-[color:var(--color-text-muted)] leading-relaxed">
        Academy updates only. No spam, and you can opt out any time.
      </p>
    </form>
  );
}
