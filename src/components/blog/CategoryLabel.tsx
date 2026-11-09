import type { CategorySlug } from "@/lib/blog/types";

/**
 * Category accents reuse the site's color family. Indigo and violet use their
 * lighter shades so small labels meet WCAG AA (4.5:1) on the dark panels.
 * Safe to use from client components: no article data is imported here.
 */
const ACCENT: Record<CategorySlug, string> = {
  "ai-news": "var(--color-blue-bright)",
  hardware: "var(--color-amber)",
  "private-ai": "var(--color-success)",
  "business-automation": "#818cf8",
  "technology-guides": "#a78bfa",
  "industry-insights": "var(--color-text-secondary)",
};

export function accentFor(slug: CategorySlug): string {
  return ACCENT[slug];
}

export function CategoryLabel({ slug, name }: { slug: CategorySlug; name: string }) {
  return (
    <span className="fn-kicker" style={{ ["--fn-accent" as string]: accentFor(slug) }}>
      <i aria-hidden="true" />
      {name}
    </span>
  );
}
