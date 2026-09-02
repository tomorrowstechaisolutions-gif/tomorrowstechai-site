"use client";

import { useState } from "react";
import { IconCheck, IconLink } from "./Icons";

/**
 * Copies a URL and says so. The clipboard API needs a user gesture and a
 * secure context, so the fallback is to show the URL for manual copying
 * rather than to fail silently.
 */
export default function CopyLink({
  url,
  label = "Copy link",
  className = "cc-btn",
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setState("copied");
            setTimeout(() => setState("idle"), 2200);
          } catch {
            setState("failed");
          }
        }}
        title={url}
      >
        {state === "copied" ? <IconCheck size={13} /> : <IconLink size={13} />}
        {state === "copied" ? "Copied" : label}
      </button>
      {state === "failed" ? (
        <input
          className="cc-input"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Public proposal link"
          style={{ marginTop: 6, fontSize: "0.72rem" }}
        />
      ) : null}
    </>
  );
}
