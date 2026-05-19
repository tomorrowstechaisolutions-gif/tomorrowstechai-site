import Link from "next/link";
import { posts } from "@/content/posts";

export const metadata = {
  title: "Blog",
  description:
    "Field notes from the intersection of AI and operations. Smartsheet, Claude, MCP, construction tech, and the systems we wish existed.",
};

export default function BlogPage() {
  return (
    <>
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
              href={`/blog/${post.slug}`}
              className="block border-b border-[color:var(--color-border)] py-8 hover:bg-[color:var(--color-surface)]/40 transition-colors -mx-6 px-6 group"
            >
              <div className="flex items-center gap-3 mb-3 text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">
                <span>{post.date}</span>
                <span>·</span>
                <span>{post.readTime}</span>
              </div>
              <h2 className="text-2xl font-medium leading-snug tracking-tight mb-3 group-hover:text-[color:var(--color-cyan)] transition-colors">
                {post.title}
              </h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed">
                {post.excerpt}
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
