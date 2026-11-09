"use client";

import { useState } from "react";

/** Plain share links. No third-party scripts or trackers load. */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
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
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${u}`} target="_blank" rel="noopener noreferrer">
        LinkedIn
      </a>
      <a href={`https://x.com/intent/post?url=${u}&text=${t}`} target="_blank" rel="noopener noreferrer">
        X
      </a>
      <a href={`mailto:?subject=${t}&body=${u}`}>Email</a>
      <button type="button" onClick={copy} aria-live="polite">
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
