"use client";

import { useState, FormEvent } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export function LeadMagnetForm() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/lead-magnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setDownloadUrl(data.downloadUrl);
      setEmailSent(Boolean(data.emailSent));
      setStatus("success");
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success" && downloadUrl) {
    return (
      <div className="card card-accent p-6">
        <div className="font-mono text-xs tracking-widest text-[color:var(--color-cyan)] uppercase mb-3">
          ●  Ready to download
        </div>
        <h3 className="text-xl font-medium mb-3">
          Your checklist is ready.
        </h3>
        <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mb-5">
          {emailSent
            ? "We also emailed you a copy so you have it for later. Check your inbox in a minute."
            : "Click below to download. We had trouble emailing you a copy — your download link is right here."}
        </p>
        <a
          href={downloadUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-sm"
        >
          Download the PDF →
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
      <div>
        <label className="block text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)] mb-1.5">
          First name (optional)
        </label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="John"
          maxLength={100}
          disabled={status === "submitting"}
          className="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-cyan)] disabled:opacity-50"
        />
      </div>
      <div>
        <label className="block text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)] mb-1.5">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourcompany.com"
          required
          maxLength={200}
          disabled={status === "submitting"}
          className="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-cyan)] disabled:opacity-50"
        />
      </div>
      <button
        type="submit"
        disabled={status === "submitting" || !email.trim()}
        className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "submitting" ? "Sending..." : "Send me the checklist →"}
      </button>
      {error && (
        <div className="text-sm text-red-400 font-mono">{error}</div>
      )}
      <p className="text-xs text-[color:var(--color-text-muted)] leading-relaxed">
        We&apos;ll email you the PDF and add you to our field-notes list. No
        spam. Unsubscribe any time.
      </p>
    </form>
  );
}
