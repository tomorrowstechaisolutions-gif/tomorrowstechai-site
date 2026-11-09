"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconFacebook, IconLink, IconLinkedIn, IconMail, IconXLogo } from "@/components/Icons";

/** The shared URL carries UTM tags so readers it brings in are attributed. */
function tagged(url: string, network: string): string {
  const q = new URLSearchParams({ utm_source: network, utm_medium: "social", utm_campaign: "field-notes" });
  if (network === "email") q.set("utm_medium", "email");
  return `${url}?${q.toString()}`;
}

type Network = "linkedin" | "x" | "facebook" | "email";

const NETWORKS: { id: Network; label: string; tip: string; icon: ReactNode; href: (u: string, t: string) => string }[] = [
  {
    id: "linkedin",
    label: "Share on LinkedIn",
    tip: "LinkedIn",
    icon: <IconLinkedIn size={16} />,
    href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
  },
  {
    id: "x",
    label: "Share on X",
    tip: "X",
    icon: <IconXLogo size={15} />,
    href: (u, t) => `https://x.com/intent/post?url=${u}&text=${t}`,
  },
  {
    id: "facebook",
    label: "Share on Facebook",
    tip: "Facebook",
    icon: <IconFacebook size={17} />,
    href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`,
  },
  {
    id: "email",
    label: "Share by email",
    tip: "Email",
    icon: <IconMail size={17} strokeWidth={1.7} />,
    href: (u, t) => `mailto:?subject=${t}&body=${u}`,
  },
];

/**
 * Icon share buttons. Plain links, so no third-party scripts or trackers load.
 * Each button has an accessible name and a tooltip on hover and keyboard
 * focus. `data-fn-share` feeds the consent-gated share_click event.
 */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = encodeURIComponent(title);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="fn-share" role="group" aria-label="Share this article">
      {NETWORKS.map((n) => (
        <a
          key={n.id}
          className="fn-share-btn"
          data-fn-share={n.id}
          data-tip={n.tip}
          aria-label={n.label}
          href={n.href(encodeURIComponent(tagged(url, n.id)), t)}
          {...(n.id === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        >
          {n.icon}
        </a>
      ))}
      <button
        type="button"
        className={`fn-share-btn${copied ? " is-copied" : ""}`}
        data-fn-share="copy"
        data-tip={copied ? "Copied" : "Copy link"}
        aria-label={copied ? "Link copied" : "Copy link"}
        onClick={copy}
      >
        {copied ? <IconCheck size={17} strokeWidth={2} /> : <IconLink size={17} strokeWidth={1.7} />}
      </button>
      <span className="fn-share-status" role="status" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
