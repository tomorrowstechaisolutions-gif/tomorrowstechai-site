"use client";

import { useState } from "react";

/** Copies a field straight into the clipboard so you can paste it into Ads
 *  Manager without re-selecting text. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={onCopy} className="ad-btn ghost sm" disabled={!value}>
      {copied ? "Copied" : label}
    </button>
  );
}
