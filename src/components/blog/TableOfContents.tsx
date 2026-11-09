"use client";

import { useEffect, useState } from "react";
import type { Heading } from "@/lib/blog/markdown";

/**
 * "In this article". Desktop: a sticky list in the right rail that marks the
 * section being read. Phone: a collapsed disclosure above the body. Works
 * without JavaScript; the script only adds the active marker.
 */
export function TableOfContents({ headings, variant }: { headings: Heading[]; variant: "rail" | "inline" }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (variant !== "rail") return;
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings, variant]);

  const list = (
    <ol>
      {headings.map((h) => (
        <li key={h.id}>
          <a href={`#${h.id}`} aria-current={active === h.id ? "location" : undefined}>
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );

  if (variant === "inline") {
    return (
      <details className="fn-toc-inline">
        <summary>In this article</summary>
        {list}
      </details>
    );
  }

  return (
    <nav className="fn-toc" aria-label="In this article">
      <p className="fn-meta-label">In this article</p>
      {list}
    </nav>
  );
}
