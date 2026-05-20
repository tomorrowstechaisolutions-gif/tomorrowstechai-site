import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPostBySlug, posts } from "@/content/posts";

export async function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

const SITE_URL = "https://tomorrowstechai.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Not found" };
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.tags,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      url,
      publishedTime: new Date(post.date).toISOString(),
      authors: ["John Hockinson"],
      tags: post.tags,
      siteName: "TomorrowsTech AI",
      images: post.image
        ? [{ url: `${SITE_URL}${post.image}`, alt: post.title }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: post.image ? [`${SITE_URL}${post.image}`] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: post.image ? `${SITE_URL}${post.image}` : undefined,
    datePublished: new Date(post.date).toISOString(),
    dateModified: new Date(post.date).toISOString(),
    keywords: post.tags.join(", "),
    articleSection: "Operations & AI",
    author: {
      "@type": "Person",
      name: "John Hockinson",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "TomorrowsTech AI",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`,
    },
  };

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10">
        <Link
          href="/blog"
          className="text-sm text-[color:var(--color-cyan)] hover:underline mb-8 inline-block"
        >
          ← All posts
        </Link>
        <div className="flex items-center gap-3 mb-6 text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">
          <span>{post.date}</span>
          <span>·</span>
          <span>{post.readTime}</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          {post.title}
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          {post.excerpt}
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

      {post.image && (
        <section className="max-w-3xl mx-auto px-6 pt-2 pb-4">
          <div className="relative w-full aspect-[16/9] overflow-hidden rounded border border-[color:var(--color-border)]">
            <Image
              src={post.image}
              alt={post.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 720px"
              className="object-cover"
            />
          </div>
        </section>
      )}

      <section className="max-w-3xl mx-auto px-6 py-10">
        <div className="prose-blog">
          {renderBody(post.body)}
        </div>
      </section>

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

function renderBody(body: string) {
  const blocks = body.split(/\n\n+/);
  return blocks.map((block, i) => {
    if (block.startsWith("## ")) {
      return <h2 key={i}>{block.replace(/^## /, "")}</h2>;
    }
    if (block.startsWith("### ")) {
      return <h3 key={i}>{block.replace(/^### /, "")}</h3>;
    }
    if (block.startsWith("- ")) {
      const items = block.split(/\n/).map((line) => line.replace(/^- /, ""));
      return (
        <ul key={i}>
          {items.map((item, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ul>
      );
    }
    return <p key={i} dangerouslySetInnerHTML={{ __html: formatInline(block) }} />;
  });
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}
