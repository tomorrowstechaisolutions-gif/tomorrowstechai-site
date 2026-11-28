import type { MetadataRoute } from "next";
import { getListedArticles } from "@/lib/blog/repository";
import { CATEGORIES, categoryPath } from "@/lib/blog/taxonomy";
import { COURSES, allLessons, canRead } from "@/lib/academy/catalog";
import { VOLUMES } from "@/lib/academy/library";

// Refreshed every 5 minutes, and immediately when an article is published
// from the Admin Center (which revalidates these paths).
export const revalidate = 300;

const BASE_URL = "https://www.tomorrowstechai.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/services`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/central-texas-ai`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/services/ai-business-operator`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/services/ai-ad-creative-studio`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/services/run-your-business`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/services/grow-your-audience`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/logo-studio`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/custom-stickers`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/job-catcher`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/careers`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/work`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${BASE_URL}/operations-audit`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/academy`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    { url: `${BASE_URL}/free`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    // Each free guide's landing page (the links used in social posts).
    ...VOLUMES.filter((v) => v.magnet).map((v) => ({
      url: `${BASE_URL}/free/${v.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    // Every course page, and every lesson people can actually read.
    ...COURSES.flatMap((course) => [
      { url: `${BASE_URL}/academy/${course.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 },
      ...allLessons(course)
        .filter((lesson) => canRead(course, lesson))
        .map((lesson) => ({ url: `${BASE_URL}/academy/${course.slug}/${lesson.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ]),
    {
      url: `${BASE_URL}/ai-field-guide`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/business-launch`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/website-intake`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const postPages: MetadataRoute.Sitemap = (await getListedArticles()).map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.modifiedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // Field Notes sections, only once they have articles (empty ones are noindex).
  const listed = await getListedArticles();
  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.flatMap((c) => {
    const inCat = listed.filter((a) => a.category === c.slug || a.secondaryCategories?.includes(c.slug));
    if (inCat.length === 0) return [];
    return [{
      url: `${BASE_URL}${categoryPath(c.slug)}`,
      lastModified: new Date(Math.max(...inCat.map((a) => Date.parse(a.modifiedAt)))),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }];
  });

  return [...staticPages, ...postPages, ...categoryPages];
}
