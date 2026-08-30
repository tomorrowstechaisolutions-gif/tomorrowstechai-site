"use client";

import { useState } from "react";

/**
 * Creates the Stripe payment link for a lead and shows it for copying.
 *
 * Deliberately two steps: pressing this only *creates* the link. Sending it
 * is still John's call, in whatever channel that lead has been talking in.
 * Nothing here charges anyone — Stripe collects the card on its own page, so
 * no payment details ever touch this site.
 */
export function PaymentLinkButton({
  leadId,
  existingUrl,
}: {
  leadId: string;
  existingUrl?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(existingUrl ?? null);
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function create() {
    setState("working");
    setError("");
    try {
      const res = await fetch("/api/admin/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        throw new Error(body.error || "Couldn't create the link.");
      }
      setUrl(body.url as string);
      setState("idle");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Couldn't create the link.");
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (url) {
    return (
      <div className="ad-paylink">
        <input className="ad-input" value={url} readOnly onFocus={(e) => e.target.select()} />
        <button type="button" className="ad-btn sm" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <p className="ad-hint">
          $399 today plus the first $29 hosting month, then $29/month. Paying it
          marks the lead Won, records the revenue and opens the job.
        </p>
      </div>
    );
  }

  return (
    <div className="ad-paylink">
      <button
        type="button"
        className="ad-btn"
        onClick={create}
        disabled={state === "working"}
      >
        {state === "working" ? "Creating…" : "Create payment link"}
      </button>
      {state === "error" && <p className="ad-error">{error}</p>}
    </div>
  );
}
