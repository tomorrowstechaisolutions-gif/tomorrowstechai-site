"use client";

import { useState } from "react";

/** The shared URL carries UTM tags so readers it brings in are attributed. */
function tagged(url: string, network: string): string {
  const q = new URLSearchParams({ utm_source: network, utm_medium: "social", utm_campaign: "field-notes" });
  if (network === "email") q.set("utm_medium", "email");
  return `${url}?${q.toString()}`;
}

/** Plain share links. No third-party scripts or trackers load. */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = (network: string) => encodeURIComponent(tagged(url, network));
  const t = encodeURIComponent(title);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="fn-share" aria-label="Share this article">
      <a data-fn-share="linkedin" href={`https://www.linkedin.com/sharing/share-offsite/?url=${u("linkedin")}`} target="_blank" rel="noopener noreferrer">
        LinkedIn
      </a>
      <a data-fn-share="x" href={`https://x.com/intent/post?url=${u("x")}&text=${t}`} target="_blank" rel="noopener noreferrer">
        X
      </a>
      <a data-fn-share="email" href={`mailto:?subject=${t}&body=${u("email")}`}>Email</a>
      <button data-fn-share="copy" type="button" onClick={copy} aria-live="polite">
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
