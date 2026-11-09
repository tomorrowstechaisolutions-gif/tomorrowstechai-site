import { PUBLICATION_NAME, PUBLISHER_NAME, SITE_URL } from "./taxonomy";
import type { Article } from "./types";

/** JSON for a <script type="application/ld+json">, safe against "</script>" in text. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const PUBLISHER = {
  "@type": "Organization",
  name: PUBLISHER_NAME,
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.svg` },
};

const BLOG_URL = `${SITE_URL}/blog`;

function absolute(src: string): string {
  return src.startsWith("http") ? src : `${SITE_URL}${src}`;
}

export function articleJsonLd(a: Article) {
  const image = a.hero
    ? a.hero.credit
      ? {
          "@type": "ImageObject",
          url: absolute(a.hero.src),
          caption: a.hero.caption ?? a.hero.alt,
          creditText: a.hero.credit,
        }
      : absolute(a.hero.src)
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": a.categoryInfo.schemaType,
    headline: a.title,
    description: a.seo?.description ?? a.summary,
    image,
    datePublished: new Date(a.publishedAt).toISOString(),
    dateModified: new Date(a.modifiedAt).toISOString(),
    keywords: a.tags.join(", "),
    articleSection: a.categoryInfo.name,
    inLanguage: "en-US",
    wordCount: a.wordCount,
    isAccessibleForFree: true,
    author: {
      "@type": a.author.kind,
      name: a.author.name,
      url: a.author.url ?? SITE_URL,
    },
    publisher: PUBLISHER,
    mainEntityOfPage: { "@type": "WebPage", "@id": a.url },
    isPartOf: { "@type": "Blog", name: PUBLICATION_NAME, url: BLOG_URL },
    citation:
      a.sources && a.sources.length > 0
        ? a.sources.map((s) => ({
            "@type": "CreativeWork",
            name: s.title,
            url: s.url,
            author: s.author,
            datePublished: s.publishedAt,
            publisher: { "@type": "Organization", name: s.publisher },
          }))
        : undefined,
  };
}

export function breadcrumbJsonLd(a: Article) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: PUBLICATION_NAME, item: BLOG_URL },
      { "@type": "ListItem", position: 3, name: a.title, item: a.url },
    ],
  };
}

export function blogJsonLd(articles: Article[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: PUBLICATION_NAME,
    url: BLOG_URL,
    publisher: PUBLISHER,
    inLanguage: "en-US",
    blogPost: articles.map((a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      url: a.url,
      datePublished: new Date(a.publishedAt).toISOString(),
      dateModified: new Date(a.modifiedAt).toISOString(),
      author: { "@type": a.author.kind, name: a.author.name },
    })),
  };
}
