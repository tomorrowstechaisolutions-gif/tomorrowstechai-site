import { Suspense } from "react";
import type { Metadata } from "next";
import { getFrontPage } from "@/lib/blog/repository";
import { blogJsonLd, jsonLd } from "@/lib/blog/structured-data";
import { CATEGORIES } from "@/lib/blog/taxonomy";
import type { Article, CategorySlug } from "@/lib/blog/types";
import { BlogSearch, type SearchEntry } from "@/components/blog/BlogSearch";
import { FieldNotesTracking } from "@/components/blog/FieldNotesTracking";
import {
  CategoryBar,
  LeadStory,
  Masthead,
  Rail,
  RiverItem,
  SecondaryStory,
} from "@/components/blog/FrontParts";
import "./field-notes-article.css";
import "./field-notes-front.css";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Field notes from the intersection of AI and operations. Smartsheet, Claude, MCP, construction tech, and the systems we wish existed.",
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": [{ url: "/blog/feed.xml", title: "Field Notes" }] },
  },
  openGraph: {
    title: "Blog · Tomorrow’s Tech AI",
    description:
      "Field notes from the intersection of AI and operations. Written by an operator. For operators. No buzzwords.",
    url: "https://www.tomorrowstechai.com/blog",
    type: "website",
  },
};

function toSearchEntry(a: Article): SearchEntry {
  return {
    path: a.path,
    title: a.title,
    summary: a.summary,
    tags: a.tags,
    category: a.category,
    categoryName: a.categoryInfo.name,
    displayDate: a.displayDate,
    publishedAt: a.publishedAt,
    readTimeLabel: a.readTimeLabel,
    hero: a.hero ? { src: a.hero.src, alt: a.hero.alt } : null,
  };
}

export default async function BlogPage() {
  const { lead, secondary, rest, all } = await getFrontPage();

  const counts = Object.fromEntries(
    CATEGORIES.map((c) => [
      c.slug,
      all.filter((a) => a.category === c.slug || a.secondaryCategories?.includes(c.slug)).length,
    ])
  ) as Record<CategorySlug, number>;

  const front = (
    <>
            {lead && (
              <section className="fnf-top" aria-label="Top stories">
                <LeadStory a={lead} />
                {secondary.length > 0 && (
                  <div className="fnf-seconds">
                    {secondary.map((a) => (
                      <SecondaryStory key={a.slug} a={a} />
                    ))}
                  </div>
                )}
              </section>
            )}

            <div className="fnf-body">
              <section aria-labelledby="fnf-latest" className="fnf-latest">
                <div className="fnf-sec-head">
                  <h2 id="fnf-latest">Latest</h2>
                </div>
                {rest.length > 0 ? (
                  <div className="fnf-river">
                    {rest.map((a) => (
                      <RiverItem key={a.slug} a={a} />
                    ))}
                  </div>
                ) : (
                  <p className="fnf-empty-title">More articles are on the way.</p>
                )}
              </section>
              <Rail counts={counts} />
            </div>
    </>
  );

  return (
    <div className="fn-article fnf-page">
      <FieldNotesTracking />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(blogJsonLd(all)) }} />

      <div className="fn-wrap fnf-wrap">
        <Masthead
          title="Field Notes"
          dek="AI, hardware and operations from the Tomorrow’s Tech AI team. Written for people who run things."
          count={all.length}
          latest={all[0]?.displayDate ?? null}
        />
      </div>
      <CategoryBar active="all" />

      <div className="fn-wrap fnf-wrap">
        {/* The fallback is what the static HTML contains, so it must be the
            full front page: crawlers and no-JS readers get real content. */}
        <Suspense fallback={front}>
          <BlogSearch index={all.map(toSearchEntry)}>{front}</BlogSearch>
        </Suspense>
      </div>
    </div>
  );
}
