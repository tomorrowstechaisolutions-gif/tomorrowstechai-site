"use client";

import { useState } from "react";

export function CopyPrompt({ label, text }: { label?: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (old browser or no permission): the text is still selectable.
    }
  }

  return (
    <figure className="ac-prompt">
      <figcaption>
        <span>{label ?? "Prompt"}</span>
        <button type="button" onClick={copy} aria-live="polite">
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </figcaption>
      <pre>{text}</pre>
    </figure>
  );
}
