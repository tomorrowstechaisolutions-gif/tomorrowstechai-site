import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle, getRelatedArticles, getReachableArticles } from "@/lib/blog/repository";
import { PUBLISHER_NAME, SITE_URL } from "@/lib/blog/taxonomy";
import { ArticleView } from "@/components/blog/ArticleView";

// Refreshed every 5 minutes, and immediately when an article is published
// from the Admin Center (which revalidates these paths).
export const revalidate = 300;


export async function generateStaticParams() {
  return (await getReachableArticles()).map((a) => ({ slug: a.slug }));
}

const TITLE_SUFFIX = " · Tomorrow’s Tech AI";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Not found" };
  // Search results show about 60 characters. Keep the site suffix only when it
  // fits; social cards get the full headline, which reads better there.
  const searchTitle = article.seo?.title ?? article.title;
  const title = `${searchTitle}${TITLE_SUFFIX}`.length <= 60 ? searchTitle : { absolute: searchTitle };
  const socialTitle = article.title;
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
      title: socialTitle,
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
      title: socialTitle,
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
  const related = await getRelatedArticles(post, 3);
  return <ArticleView post={post} related={related} />;
}
