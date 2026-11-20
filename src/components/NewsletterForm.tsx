"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { SPAM_TRAP_FIELD } from "@/lib/spam-trap";

/** stacked: input above the button, for narrow columns like the Field Notes rail. */
export function NewsletterForm({ stacked = false }: { stacked?: boolean } = {}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const trapRef = useRef<HTMLInputElement>(null);
  // Set on mount, not during render: the clock is not a pure value.
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          // Spam traps: a field no human sees, and a form sent faster than a person can.
          [SPAM_TRAP_FIELD]: trapRef.current?.value ?? "",
          ...(startedAt.current ? { elapsed_ms: Date.now() - startedAt.current } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("success");
      setEmail("");
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="text-sm">
        <div className="font-mono text-[color:var(--color-cyan)] uppercase tracking-widest mb-2">
          ✓ Subscribed
        </div>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed">
          You&apos;ll get field notes when we publish. No spam, no fluff —
          unsubscribe any time.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col ${stacked ? "" : "sm:flex-row"} gap-2 max-w-md`}>
      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div className="bl-hp" aria-hidden="true">
        <label>
          Leave this empty
          <input ref={trapRef} name={SPAM_TRAP_FIELD} type="text" tabIndex={-1} autoComplete="off" data-lpignore="true" data-1p-ignore="true" defaultValue="" />
        </label>
      </div>
      <input
        type="email"
        aria-label="Email address"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@yourcompany.com"
        required
        maxLength={200}
        disabled={status === "submitting"}
        className="flex-1 bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-cyan)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={status === "submitting" || !email.trim()}
        className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "submitting" ? "Subscribing..." : "Subscribe"}
      </button>
      {error && (
        <div className="text-sm text-red-400 font-mono w-full">{error}</div>
      )}
    </form>
  );
}
