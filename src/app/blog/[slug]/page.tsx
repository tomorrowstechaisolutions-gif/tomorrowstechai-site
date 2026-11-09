import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { renderMarkdown } from "@/lib/blog/markdown";
import { getArticle, getListedArticles, getReachableArticles, formatDate } from "@/lib/blog/repository";
import { articleJsonLd, breadcrumbJsonLd, jsonLd } from "@/lib/blog/structured-data";
import { PUBLISHER_NAME, SITE_URL } from "@/lib/blog/taxonomy";
import "../field-notes-prose.css";

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
  return {
    title,
    description,
    keywords: article.tags,
    alternates: {
      canonical: article.seo?.canonical ?? article.url,
      types: { "application/rss+xml": [{ url: "/blog/feed.xml", title: "Field Notes" }] },
    },
    // Only set when needed: an explicit undefined replaces the site-wide robots tags.
    ...(article.status === "archived" ? { robots: { index: false, follow: true } } : {}),
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

  const sources = post.sources ?? [];
  const related = (await getListedArticles()).filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleJsonLd(post)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(post)) }}
      />
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10">
        <Link
          href="/blog"
          className="text-sm text-[color:var(--color-cyan)] hover:underline mb-8 inline-block"
        >
          ← All posts
        </Link>
        <div className="flex flex-wrap items-center gap-3 mb-6 text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">
          <span>{post.displayDate}</span>
          <span>·</span>
          <span>{post.readTimeLabel}</span>
          <span>·</span>
          <span>
            By{" "}
            <Link
              href="/about"
              className="text-[color:var(--color-cyan)] hover:underline"
            >
              {post.author.name}
            </Link>
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          {post.title}
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          {post.summary}
        </p>
        <div className="flex flex-wrap gap-2 mt-6">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-mono tracking-wider text-[color:var(--color-text-muted)] border border-[color:var(--color-border)] px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {post.hero && (
        <section className="max-w-3xl mx-auto px-6 pt-2 pb-4">
          <div className="relative w-full aspect-[16/9] overflow-hidden rounded border border-[color:var(--color-border)]">
            <Image
              src={post.hero.src}
              alt={post.hero.alt}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 720px"
              className="object-cover"
            />
          </div>
          {(post.hero.caption || post.hero.credit) && (
            <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-xs text-[color:var(--color-text-muted)]">
              {post.hero.caption && <span>{post.hero.caption}</span>}
              {post.hero.credit && <span>{post.hero.credit}</span>}
            </p>
          )}
        </section>
      )}

      <section className="max-w-3xl mx-auto px-6 py-10">
        <div className="prose-blog">
          {renderMarkdown(post.body, { sourceIds: sources.map((s) => s.id) })}
          {post.displayUpdated && (
            <p className="text-sm text-[color:var(--color-text-muted)]">
              Updated {post.displayUpdated}.
            </p>
          )}
          {sources.length > 0 && (
            <section className="sources" aria-labelledby="sources-heading">
              <h2 id="sources-heading">Sources</h2>
              <ol>
                {sources.map((s) => (
                  <li key={s.id} id={`source-${s.id}`}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                    <span className="source-meta">
                      {" — "}
                      {[s.author, s.publisher, s.publishedAt && formatDate(s.publishedAt)]
                        .filter(Boolean)
                        .join(", ")}
                      {s.accessedAt && ` (accessed ${formatDate(s.accessedAt)})`}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </section>

      {/* The approved-bio author box is a Phase 3 item. Until then only the
          existing box for John's legacy articles renders, unchanged. */}
      {post.author.id === "john-hockinson" && (
        <section className="max-w-3xl mx-auto px-6 py-12">
          <div className="card flex items-start gap-5 p-8">
            <div className="w-16 h-16 shrink-0 rounded-full bg-[color:var(--color-cyan-deep)]/30 border border-[color:var(--color-cyan)]/40 flex items-center justify-center">
              <span className="font-mono text-[color:var(--color-cyan)] text-lg tracking-widest">
                JH
              </span>
            </div>
            <div>
              <div className="eyebrow-muted mb-1">About the author</div>
              <h3 className="text-lg font-medium mb-2">John Hockinson</h3>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mb-3">
                Founder of Tomorrow’s Tech AI. 18 years inside telecom and
                infrastructure programs — now building business operating
                platforms, AI command centers, and operations systems for businesses still
                running on spreadsheets and email chains.
              </p>
              <Link
                href="/about"
                className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
              >
                More about John →
              </Link>
            </div>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="eyebrow-muted mb-3">Keep reading</div>
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-10 max-w-2xl">
            More from the field.
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={r.path}
                className="card hover:border-[color:var(--color-cyan-deep)] block group overflow-hidden"
              >
                {r.hero && (
                  <div className="relative w-full aspect-[16/9] -mx-6 -mt-6 mb-4 overflow-hidden border-b border-[color:var(--color-border)]">
                    <Image
                      src={r.hero.src}
                      alt={r.hero.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 360px"
                      className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="eyebrow-muted mb-3">{r.displayDate}</div>
                <h3 className="text-lg font-medium leading-snug mb-2 group-hover:text-[color:var(--color-cyan)] transition-colors">
                  {r.title}
                </h3>
                <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
                  {r.summary}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="card card-accent p-10">
          <div className="eyebrow mb-3">● Build with us</div>
          <h3 className="text-2xl font-medium tracking-tight mb-3">
            Wondering what this would look like for your operations?
          </h3>
          <p className="text-[color:var(--color-text-secondary)] mb-6 max-w-xl">
            Book a discovery call. 30 minutes, no pitch, real conversation.
          </p>
          <Link href="/contact" className="btn-primary">
            Book a discovery call →
          </Link>
        </div>
      </section>
    </article>
  );
}
