import { getListedArticles } from "@/lib/blog/repository";
import { PUBLICATION_NAME, PUBLISHER_NAME, SITE_URL } from "@/lib/blog/taxonomy";

/**
 * Field Notes RSS 2.0 feed at /blog/feed.xml.
 * Built at deploy time like the articles themselves, so it can never list a
 * draft or show a different set of posts than the site.
 */
export const dynamic = "force-static";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absolute(src: string): string {
  return src.startsWith("http") ? src : `${SITE_URL}${src}`;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export async function GET() {
  const articles = (await getListedArticles()).slice(0, 50);
  const feedUrl = `${SITE_URL}/blog/feed.xml`;
  const lastBuild = articles.length
    ? new Date(Math.max(...articles.map((a) => Date.parse(a.modifiedAt)))).toUTCString()
    : new Date().toUTCString();

  const items = articles
    .map((a) => {
      const ext = a.hero?.src.split(".").pop()?.toLowerCase() ?? "";
      const media = a.hero && MIME[ext]
        ? `\n      <media:content url="${esc(absolute(a.hero.src))}" medium="image" type="${MIME[ext]}">` +
          `\n        <media:description>${esc(a.hero.alt)}</media:description>` +
          (a.hero.credit ? `\n        <media:credit>${esc(a.hero.credit)}</media:credit>` : "") +
          `\n      </media:content>`
        : "";
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${a.url}</link>
      <guid isPermaLink="true">${a.url}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <dc:creator>${esc(a.author.name)}</dc:creator>
      <category>${esc(a.categoryInfo.name)}</category>${a.tags.map((t) => `\n      <category>${esc(t)}</category>`).join("")}
      <description>${esc(a.summary)}</description>${media}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${esc(`${PUBLICATION_NAME} · ${PUBLISHER_NAME}`)}</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <description>AI, hardware and operations, from the Tomorrow’s Tech AI team.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <image>
      <url>${SITE_URL}/icon.png</url>
      <title>${esc(`${PUBLICATION_NAME} · ${PUBLISHER_NAME}`)}</title>
      <link>${SITE_URL}/blog</link>
    </image>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
