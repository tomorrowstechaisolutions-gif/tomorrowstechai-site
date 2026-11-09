import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getListedArticles } from "@/lib/blog/repository";
import { blogJsonLd, jsonLd } from "@/lib/blog/structured-data";

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
    url: "https://tomorrowstechai.com/blog",
    type: "website",
  },
};

export default async function BlogPage() {
  const posts = await getListedArticles();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(blogJsonLd(posts)) }}
      />
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10">
        <div className="eyebrow mb-6">● Field notes</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1]">
          Operations, AI, and the systems we wish existed.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-6">
          Written by an operator. For operators. No buzzwords.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="space-y-1">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={post.path}
              className="block border-b border-[color:var(--color-border)] py-8 hover:bg-[color:var(--color-surface)]/40 transition-colors -mx-6 px-6 group"
            >
              {post.hero && (
                <div className="relative w-full aspect-[16/9] mb-5 overflow-hidden rounded border border-[color:var(--color-border)]">
                  <Image
                    src={post.hero.src}
                    alt={post.hero.alt}
                    fill
                    sizes="(max-width: 768px) 100vw, 720px"
                    className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                </div>
              )}
              <div className="flex items-center gap-3 mb-3 text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">
                <span>{post.displayDate}</span>
                <span>·</span>
                <span>{post.readTimeLabel}</span>
              </div>
              <h2 className="text-2xl font-medium leading-snug tracking-tight mb-3 group-hover:text-[color:var(--color-cyan)] transition-colors">
                {post.title}
              </h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed">
                {post.summary}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-mono tracking-wider text-[color:var(--color-text-muted)] border border-[color:var(--color-border)] px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
