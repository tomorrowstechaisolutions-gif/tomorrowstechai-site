"use client";

import { useState } from "react";

/** Sends the visitor to Stripe Checkout for one course. */
export function EnrollButton({ course, label, className = "btn-primary w-full justify-center" }: { course: string; label: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/academy/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || "Couldn't start checkout.");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={enroll} disabled={busy} className={`${className} disabled:opacity-60`}>
        {busy ? "Opening secure checkout…" : label}
      </button>
      {error && <p className="text-sm text-[color:var(--color-danger)] mt-2">{error}</p>}
    </div>
  );
}
