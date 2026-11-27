"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SPAM_TRAP_FIELD } from "@/lib/spam-trap";

export function AccessForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const trapRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/academy/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          [SPAM_TRAP_FIELD]: trapRef.current?.value ?? "",
          ...(startedAt.current ? { elapsed_ms: Date.now() - startedAt.current } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="ac-success" role="status">
        <div className="ac-kicker">✓ Check your inbox</div>
        <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
          If that email has a course, a sign-in link is on its way. It works for one hour. Nothing there? Check spam, or
          make sure it&apos;s the address you paid with.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="bl-hp" aria-hidden="true">
        <label>
          Leave this empty
          <input ref={trapRef} name={SPAM_TRAP_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <label className="block text-[11px] font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]" htmlFor="ac-access-email">
        Email you paid with
      </label>
      <input
        id="ac-access-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-[color:var(--color-blue)]"
      />
      <button type="submit" disabled={status === "sending"} className="btn-primary text-sm disabled:opacity-60">
        {status === "sending" ? "Sending…" : "Email me a sign-in link →"}
      </button>
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
    </form>
  );
}
