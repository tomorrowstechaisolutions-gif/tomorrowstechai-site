import type { Author, CategoryInfo, CategorySlug } from "./types";

export const SITE_URL = "https://www.tomorrowstechai.com";
export const PUBLICATION_NAME = "Field Notes";
export const PUBLISHER_NAME = "Tomorrow’s Tech AI";

/**
 * The six Field Notes sections. Order is the order of the category bar.
 * CTA services map to /contact?service=<service>, which the contact form logs
 * to the CRM as a catalog inquiry.
 */
export const CATEGORIES: CategoryInfo[] = [
  {
    slug: "ai-news",
    name: "AI News",
    description: "Model releases, platform changes and what they mean for teams that run operations.",
    schemaType: "NewsArticle",
    requiresSources: true,
    cta: {
      service: "ai-business-operator",
      label: "Talk through what this means for your team",
      blurb: "We help businesses decide which AI changes are worth acting on.",
    },
  },
  {
    slug: "hardware",
    name: "Hardware",
    description: "GPUs, workstations, servers and builds, with specs in tables and costs with dates.",
    schemaType: "TechArticle",
    requiresSources: true,
    cta: {
      service: "private-on-site-ai",
      label: "Private AI consultation",
      blurb: "We scope on-site AI systems for firms that can't send files to a cloud model.",
    },
  },
  {
    slug: "private-ai",
    name: "Private AI",
    description: "Local and on-prem models, data control and compliance-sensitive deployments.",
    schemaType: "Article",
    requiresSources: false,
    cta: {
      service: "private-on-site-ai",
      label: "Private AI consultation",
      blurb: "Keep sensitive data in the building with an on-site AI system.",
    },
  },
  {
    slug: "business-automation",
    name: "Business Automation",
    description: "Workflows, approvals, Smartsheet, integrations and the systems behind them.",
    schemaType: "Article",
    requiresSources: false,
    cta: {
      service: "workflow-packages",
      label: "Map your workflow with us",
      blurb: "Forms, approvals and reporting built around how your business actually runs.",
    },
  },
  {
    slug: "technology-guides",
    name: "Technology Guides",
    description: "How-tos and explainers a reader can follow step by step.",
    schemaType: "TechArticle",
    requiresSources: false,
    cta: {
      service: "operations-audit",
      label: "Get an operations audit",
      blurb: "Find out where AI and automation would save your team time.",
    },
  },
  {
    slug: "industry-insights",
    name: "Industry Insights",
    description: "Field ops, construction, EMS and the operating realities software usually misses.",
    schemaType: "Article",
    requiresSources: false,
    cta: {
      service: "command-centers",
      label: "See your operation on one screen",
      blurb: "Command centers that unify reporting, metrics and accountability.",
    },
  },
];

const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function getCategory(slug: CategorySlug): CategoryInfo {
  const found = CATEGORY_BY_SLUG.get(slug);
  if (!found) throw new Error(`Unknown Field Notes category: ${slug}`);
  return found;
}

export function categoryPath(slug: CategorySlug): string {
  return `/blog/category/${slug}`;
}

export function isCategorySlug(value: string): value is CategorySlug {
  return CATEGORY_BY_SLUG.has(value as CategorySlug);
}

/**
 * Bios stay null until the owner approves exact wording. Nothing renders a
 * credential that isn't written here.
 */
export const AUTHORS: Record<string, Author> = {
  "editorial-team": {
    id: "editorial-team",
    name: "Tomorrow’s Tech AI Editorial Team",
    kind: "Organization",
    url: `${SITE_URL}/about`,
    bio: null,
  },
  "john-hockinson": {
    id: "john-hockinson",
    name: "John Hockinson",
    kind: "Person",
    role: "Founder, Tomorrow’s Tech AI",
    // Matches the existing Article JSON-LD so search engines see no change.
    url: SITE_URL,
    bio: null,
  },
};

export const DEFAULT_AUTHOR_ID = "editorial-team";

export function getAuthor(id: string | undefined): Author {
  const author = AUTHORS[id ?? DEFAULT_AUTHOR_ID];
  if (!author) throw new Error(`Unknown Field Notes author: ${id}`);
  return author;
}
