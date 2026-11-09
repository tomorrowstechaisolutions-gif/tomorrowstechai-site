"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { CategorySlug } from "@/lib/blog/types";
import { CategoryLabel } from "./CategoryLabel";

/** The slice of each article search needs. Built on the server at deploy time. */
export type SearchEntry = {
  path: string;
  title: string;
  summary: string;
  tags: string[];
  category: CategorySlug;
  categoryName: string;
  displayDate: string;
  publishedAt: string;
  readTimeLabel: string;
  hero: { src: string; alt: string } | null;
};

function score(e: SearchEntry, terms: string[]): number {
  const title = e.title.toLowerCase();
  const rest = `${e.summary} ${e.tags.join(" ")} ${e.categoryName}`.toLowerCase();
  let total = 0;
  for (const t of terms) {
    const inTitle = title.includes(t);
    const inRest = rest.includes(t);
    if (!inTitle && !inRest) return 0; // every word must match somewhere
    total += (inTitle ? 3 : 0) + (inRest ? 1 : 0);
  }
  return total;
}

/**
 * /blog?q=… shows results instead of the front page. Without a query, or
 * before the script runs, the server-rendered front page shows unchanged.
 */
export function BlogSearch({ index, children }: { index: SearchEntry[]; children: ReactNode }) {
  const q = (useSearchParams().get("q") ?? "").trim();
  if (!q) return <>{children}</>;

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const results = index
    .map((e) => ({ e, s: score(e, terms) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || Date.parse(b.e.publishedAt) - Date.parse(a.e.publishedAt))
    .map((r) => r.e);

  return (
    <section className="fnf-results" aria-labelledby="fnf-results-title">
      <div className="fnf-sec-head">
        <h2 id="fnf-results-title" aria-live="polite">
          {results.length} {results.length === 1 ? "result" : "results"} for “{q}”
        </h2>
        <Link href="/blog" className="fnf-sec-link">
          Clear search
        </Link>
      </div>
      {results.length === 0 ? (
        <div className="fnf-empty">
          <p className="fnf-empty-title">No articles match that search.</p>
          <p>Try a broader word, or browse a section from the bar above.</p>
        </div>
      ) : (
        <div className="fnf-river">
          {results.map((e) => (
            <article key={e.path} className="fnf-river-item fnf-river-item-plain">
              <Link href={e.path}>
                <div className="fnf-river-body">
                  <CategoryLabel slug={e.category} name={e.categoryName} />
                  <h3>{e.title}</h3>
                  <p className="fnf-summary">{e.summary}</p>
                  <p className="fnf-meta">
                    <time dateTime={e.publishedAt}>{e.displayDate}</time>
                    <span aria-hidden="true"> · </span>
                    {e.readTimeLabel}
                  </p>
                </div>
                {e.hero && (
                  <div className="fnf-media fnf-media-thumb">
                    <Image src={e.hero.src} alt={e.hero.alt} fill sizes="(max-width: 640px) 96px, 220px" className="object-cover" />
                  </div>
                )}
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
