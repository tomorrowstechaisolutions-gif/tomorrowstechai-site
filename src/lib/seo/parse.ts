/**
 * Reads a page the way a crawler does — from the HTML that was actually
 * served, not from the source that produced it.
 *
 * That distinction is the whole point. Reading `page.tsx` tells you what the
 * code intends; fetching the URL tells you what Google receives, including
 * everything the root layout contributed and everything a build step changed.
 *
 * Regex rather than a DOM parser, deliberately: this runs against one site's
 * own well-formed Next.js output, and a parser dependency for eight fields is
 * a dependency to keep patched forever.
 */

export type ParsedPage = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImage: string | null;
  h1: string | null;
  h1Count: number;
  wordCount: number;
  jsonldTypes: string[];
  noindex: boolean;
  internalLinks: number;
};

/** Attribute lookup that tolerates single quotes, spacing and attribute order. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? "").trim() || null;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

const clean = (s: string) => decode(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

export function parsePage(html: string, pageUrl: string): ParsedPage {
  // Strip anything that is code or styling before counting words. Next.js
  // inlines a large RSC payload into script tags; leaving it in would report
  // a thin page as a 40,000-word one.
  const prose = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const body = prose.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? prose;

  const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = titleRaw ? clean(titleRaw) : null;

  let description: string | null = null;
  let noindex = false;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (attr(tag, "name") ?? "").toLowerCase();
    const content = attr(tag, "content");
    if (!content) continue;

    if (name === "description" && !description) description = decode(content).trim();
    if (name === "robots" && /noindex/i.test(content)) noindex = true;
  }

  let canonical: string | null = null;
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(tag, "rel") ?? "").toLowerCase() === "canonical") {
      canonical = attr(tag, "href");
      break;
    }
  }

  let ogImage: string | null = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    if (property === "og:image" || property === "og:image:url") {
      ogImage = attr(tag, "content");
      if (ogImage) break;
    }
  }

  const h1s = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => clean(m[1]));
  const meaningfulH1s = h1s.filter(Boolean);

  const text = clean(body);
  const wordCount = text ? text.split(/\s+/).length : 0;

  // JSON-LD can be a single object, an array, or an object with @graph.
  const jsonldTypes = new Set<string>();
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const collect = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(collect);
          return;
        }
        if (!node || typeof node !== "object") return;
        const obj = node as Record<string, unknown>;
        const type = obj["@type"];
        if (typeof type === "string") jsonldTypes.add(type);
        else if (Array.isArray(type)) type.forEach((t) => typeof t === "string" && jsonldTypes.add(t));
        if (Array.isArray(obj["@graph"])) collect(obj["@graph"]);
      };
      collect(JSON.parse(decode(m[1])));
    } catch {
      // Malformed JSON-LD is invisible to Google too, so it counts as absent.
    }
  }

  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    origin = "";
  }

  const internalLinks = (body.match(/<a\b[^>]*href\s*=\s*["'][^"']*["']/gi) ?? []).filter((tag) => {
    const href = attr(tag + ">", "href") ?? "";
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    return href.startsWith("/") || (origin !== "" && href.startsWith(origin));
  }).length;

  return {
    title,
    description,
    canonical,
    ogImage,
    h1: meaningfulH1s[0] ?? null,
    h1Count: meaningfulH1s.length,
    wordCount,
    jsonldTypes: [...jsonldTypes].sort(),
    noindex,
    internalLinks,
  };
}
