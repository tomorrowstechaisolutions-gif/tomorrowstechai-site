import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { extractHeadings, renderMarkdown } from "@/lib/blog/markdown";
import { getArticle, getRelatedArticles, getReachableArticles } from "@/lib/blog/repository";
import { articleJsonLd, breadcrumbJsonLd, jsonLd } from "@/lib/blog/structured-data";
import { PUBLISHER_NAME, SITE_URL } from "@/lib/blog/taxonomy";
import {
  ArticleFooterMeta,
  ArticleHeader,
  ArticleHero,
  AuthorCard,
  Discrepancies,
  EndCta,
  InlineCta,
  RailCta,
  RelatedArticles,
  SourcesList,
  SpecsTable,
} from "@/components/blog/ArticleParts";
import { TableOfContents } from "@/components/blog/TableOfContents";
import "../field-notes-prose.css";
import "../field-notes-article.css";

/** Articles with fewer H2 sections than this read fine without a contents list. */
const TOC_MIN_SECTIONS = 4;

export async function generateStaticParams() {
  return (await getReachableArticles()).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Not found" };
  const title = article.seo?.title ?? article.title;
  const description = article.seo?.description ?? article.summary;
  const image = article.hero
    ? article.hero.src.startsWith("http")
      ? article.hero.src
      : `${SITE_URL}${article.hero.src}`
    : undefined;
  const hidden = article.status !== "published";
  return {
    title,
    description,
    keywords: article.tags,
    alternates: {
      canonical: article.seo?.canonical ?? article.url,
      types: { "application/rss+xml": [{ url: "/blog/feed.xml", title: "Field Notes" }] },
    },
    // Only set when needed: an explicit undefined replaces the site-wide robots tags.
    ...(hidden ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      type: "article",
      url: article.url,
      publishedTime: new Date(article.publishedAt).toISOString(),
      modifiedTime: new Date(article.modifiedAt).toISOString(),
      authors: [article.author.name],
      section: article.categoryInfo.name,
      tags: article.tags,
      siteName: PUBLISHER_NAME,
      images: image ? [{ url: image, alt: article.hero!.alt }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getArticle(slug);
  if (!post) notFound();

  const draft = post.status === "draft" || post.status === "scheduled";
  const sources = post.sources ?? [];
  const sections = extractHeadings(post.body).filter((h) => h.level === 2);
  const showToc = sections.length >= TOC_MIN_SECTIONS;
  const related = await getRelatedArticles(post, 3);

  return (
    <article className="fn-article">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleJsonLd(post)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(post)) }}
      />

      <div className="fn-wrap">
        <ArticleHeader article={post} draft={draft} />
        <ArticleHero article={post} />

        <div className="fn-grid">
          <div className="fn-main">
            {showToc && <TableOfContents headings={sections} variant="inline" />}

            <div className="prose-blog fn-prose">
              {renderMarkdown(post.body, {
                sourceIds: sources.map((s) => s.id),
                midSlot: <InlineCta article={post} />,
              })}
            </div>

            <SpecsTable article={post} />
            <Discrepancies article={post} />
            <SourcesList article={post} />
            <ArticleFooterMeta article={post} />
            <AuthorCard article={post} />
          </div>

          <aside className="fn-rail" aria-label="Article tools">
            <div className="fn-rail-sticky">
              {showToc && <TableOfContents headings={sections} variant="rail" />}
              <RailCta article={post} />
            </div>
          </aside>
        </div>
      </div>

      <div className="fn-wrap">
        <EndCta article={post} />
        <RelatedArticles items={related} category={post.categoryInfo.name} />
      </div>
    </article>
  );
}
