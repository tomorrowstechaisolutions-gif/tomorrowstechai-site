import { extractHeadings, renderMarkdown } from "@/lib/blog/markdown";
import { articleJsonLd, breadcrumbJsonLd, jsonLd } from "@/lib/blog/structured-data";
import type { Article } from "@/lib/blog/types";
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
import { FieldNotesTracking } from "@/components/blog/FieldNotesTracking";
import "@/app/blog/field-notes-prose.css";
import "@/app/blog/field-notes-article.css";

/** Articles with fewer H2 sections than this read fine without a contents list. */
const TOC_MIN_SECTIONS = 4;

/**
 * The full article layout. Used by the public page and by the Admin Center
 * preview, so a preview is exactly what readers will see. `preview` drops the
 * analytics events and structured data, which belong to the live page only.
 */
export function ArticleView({
  post,
  related,
  preview = false,
}: {
  post: Article;
  related: Article[];
  preview?: boolean;
}) {
  const draft = post.status === "draft" || post.status === "scheduled";
  const sources = post.sources ?? [];
  const sections = extractHeadings(post.body).filter((h) => h.level === 2);
  const showToc = sections.length >= TOC_MIN_SECTIONS;

  return (
    <article className="fn-article">
      {preview ? null : (
        <>
          <FieldNotesTracking slug={post.slug} category={post.category} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleJsonLd(post)) }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(post)) }} />
        </>
      )}

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
