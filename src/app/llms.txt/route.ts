import { getListedArticles } from "@/lib/blog/repository";
import { CATEGORIES, SITE_URL, categoryPath } from "@/lib/blog/taxonomy";

/**
 * /llms.txt — a plain-text map of the site for AI assistants and AI search
 * (https://llmstxt.org). Built at deploy time from the same article data as
 * the blog, sitemap and RSS feed, so it never lists a draft.
 */
export const dynamic = "force-static";

const PAGES: [string, string, string][] = [
  ["Home", "/", "What Tomorrow's Tech AI builds and for whom"],
  ["Services", "/services", "All service lines"],
  ["Operations audit", "/operations-audit", "Starting point: a review of how the business runs today"],
  ["AI Business Operator", "/services/ai-business-operator", "AI operations service"],
  ["Run your business", "/services/run-your-business", "Custom business management platform: dashboard, CRM, scheduling, projects, automation and AI"],
  ["Grow your audience", "/services/grow-your-audience", "Marketing and audience growth service"],
  ["AI Ad Creative Studio", "/services/ai-ad-creative-studio", "AI-assisted ad creative service"],
  ["Job Catcher", "/job-catcher", "Missed-call text-back and lead follow-up for service businesses"],
  ["Logo Studio", "/logo-studio", "Logo and brand design"],
  ["Business Launch", "/business-launch", "Website launch package for small businesses"],
  ["Central Texas AI", "/central-texas-ai", "Central Texas AI initiative"],
  ["Our work", "/work", "Projects and products"],
  ["About", "/about", "Who we are"],
  ["FAQ", "/faq", "Common questions"],
  ["AI field guide", "/ai-field-guide", "Practical guide to AI for operators"],
  ["Contact", "/contact", "Book a discovery call or send a message"],
];

export async function GET() {
  const articles = await getListedArticles();
  const lines: string[] = [
    "# Tomorrow's Tech AI",
    "",
    "> Tomorrow's Tech AI (Central Texas) builds business operating systems for operations-heavy companies: command centers, workflow automation, CRM and admin platforms, websites and private on-site AI. Field Notes is its editorial publication on AI, hardware and operations.",
    "",
    "## Pages",
    "",
    ...PAGES.map(([name, path, note]) => `- [${name}](${SITE_URL}${path === "/" ? "" : path}): ${note}`),
    "",
    "## Field Notes sections",
    "",
    ...CATEGORIES.map((c) => `- [${c.name}](${SITE_URL}${categoryPath(c.slug)}): ${c.description}`),
    "",
    "## Field Notes articles",
    "",
    ...articles.map((a) => `- [${a.title}](${a.url}) (${a.publishedAt.slice(0, 10)}): ${a.summary}`),
    "",
    "## Feeds",
    "",
    `- [RSS](${SITE_URL}/blog/feed.xml)`,
    `- [Sitemap](${SITE_URL}/sitemap.xml)`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
