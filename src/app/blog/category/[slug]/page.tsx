import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticlesInCategory, getListedArticles } from "@/lib/blog/repository";
import { jsonLd } from "@/lib/blog/structured-data";
import { CATEGORIES, PUBLICATION_NAME, SITE_URL, categoryPath, getCategory, isCategorySlug } from "@/lib/blog/taxonomy";
import type { CategorySlug } from "@/lib/blog/types";
import {
  CategoryBar,
  EmptySection,
  LeadStory,
  Masthead,
  Rail,
  RiverItem,
  SectionHead,
} from "@/components/blog/FrontParts";
import { FieldNotesTracking } from "@/components/blog/FieldNotesTracking";
import "../../field-notes-article.css";
import "../../field-notes-front.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isCategorySlug(slug)) return { title: "Not found" };
  const c = getCategory(slug);
  const count = (await getArticlesInCategory(slug)).length;
  const url = `${SITE_URL}${categoryPath(slug)}`;
  return {
    title: `${c.name} · ${PUBLICATION_NAME}`,
    description: c.description,
    alternates: {
      canonical: url,
      types: { "application/rss+xml": [{ url: "/blog/feed.xml", title: "Field Notes" }] },
    },
    // An empty section is thin content; keep it out of search until it has articles.
    ...(count === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${c.name} · Field Notes · Tomorrow’s Tech AI`,
      description: c.description,
      url,
      type: "website",
    },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isCategorySlug(slug)) notFound();
  const c = getCategory(slug);
  const items = await getArticlesInCategory(slug);
  const all = await getListedArticles();
  const [lead, ...rest] = items;

  const counts = Object.fromEntries(
    CATEGORIES.map((cat) => [
      cat.slug,
      all.filter((a) => a.category === cat.slug || a.secondaryCategories?.includes(cat.slug)).length,
    ])
  ) as Record<CategorySlug, number>;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: PUBLICATION_NAME, item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: c.name, item: `${SITE_URL}${categoryPath(slug)}` },
    ],
  };

  return (
    <div className="fn-article fnf-page">
      <FieldNotesTracking />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      <div className="fn-wrap fnf-wrap">
        <Masthead
          title={c.name}
          dek={c.description}
          count={items.length}
          latest={items[0]?.displayDate ?? null}
        />
      </div>
      <CategoryBar active={slug} />

      <div className="fn-wrap fnf-wrap">
        {lead ? (
          <section className="fnf-top fnf-top-solo" aria-label={`Latest in ${c.name}`}>
            <LeadStory a={lead} />
          </section>
        ) : (
          <EmptySection name={c.name} />
        )}

        <div className="fnf-body">
          <section aria-labelledby="fnf-cat-more" className="fnf-latest">
            <SectionHead id="fnf-cat-more" title={lead ? `More in ${c.name}` : "Latest from Field Notes"} />
            <div className="fnf-river">
              {(lead ? rest : all.slice(0, 5)).map((a) => (
                <RiverItem key={a.slug} a={a} />
              ))}
            </div>
            {lead && rest.length === 0 && <p className="fnf-note">That’s everything in this section so far.</p>}
          </section>
          <Rail counts={counts} />
        </div>
      </div>
    </div>
  );
}
