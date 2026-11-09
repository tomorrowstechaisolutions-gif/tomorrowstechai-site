import { extractCitationIds, extractFigures, isSafeHref } from "./markdown";
import { AUTHORS, getCategory, isCategorySlug } from "./taxonomy";
import type { ArticleRecord } from "./types";

/**
 * Field Notes editorial standards, enforced at build time.
 *
 * Errors stop the build: a broken citation, an unknown category or an
 * unparseable date must never reach production. Warnings are printed and the
 * build continues; legacy articles (published before these standards) get
 * warnings where a new article would get errors.
 */

export type Issue = { slug: string; level: "error" | "warning"; message: string };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9-]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

function validDate(value: string | undefined): boolean {
  return !!value && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

export function validateArticles(records: ArticleRecord[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();

  for (const a of records) {
    const err = (message: string) => issues.push({ slug: a.slug, level: "error", message });
    const strict = (message: string) =>
      issues.push({ slug: a.slug, level: a.legacy ? "warning" : "error", message });
    const warn = (message: string) => issues.push({ slug: a.slug, level: "warning", message });

    // Identity
    if (!SLUG.test(a.slug)) err(`slug "${a.slug}" must be lowercase words joined by hyphens`);
    if (seen.has(a.slug)) err(`slug "${a.slug}" is used by more than one article`);
    seen.add(a.slug);
    if (!a.title.trim()) err("title is empty");
    if (!a.summary.trim()) err("summary is empty");
    if (!a.body.trim()) err("body is empty");

    // Taxonomy
    if (!isCategorySlug(a.category)) err(`unknown category "${a.category}"`);
    for (const c of a.secondaryCategories ?? []) {
      if (!isCategorySlug(c)) err(`unknown secondary category "${c}"`);
    }
    if (a.authorId && !AUTHORS[a.authorId]) err(`unknown author "${a.authorId}"`);

    // Dates
    if (!validDate(a.publishedAt)) err(`publishedAt "${a.publishedAt}" is not an ISO date`);
    // A published article must carry its real (past) publication date.
    if (a.status === "published" && validDate(a.publishedAt) && Date.parse(a.publishedAt) > Date.now()) {
      err("published article has a future publishedAt; use the actual publication date");
    }
    if (a.updatedAt !== undefined) {
      if (!validDate(a.updatedAt)) err(`updatedAt "${a.updatedAt}" is not an ISO date`);
      else if (validDate(a.publishedAt) && Date.parse(a.updatedAt) < Date.parse(a.publishedAt))
        err("updatedAt is earlier than publishedAt");
    }

    // Images
    if (a.hero) {
      if (!a.hero.alt.trim()) strict("hero image has no alt text");
      else if (a.hero.alt.trim() === a.title.trim()) strict("hero alt text repeats the headline; describe the image");
      if (!a.hero.credit?.trim()) strict("hero image has no credit");
      if (!isSafeHref(a.hero.src) || a.hero.src.startsWith("#")) err(`hero src "${a.hero.src}" is not a path or https URL`);
    }
    for (const f of extractFigures(a.body)) {
      if (!f.alt.trim()) strict(`in-body image ${f.src} has no alt text`);
      if (!f.credit) strict(`in-body image ${f.src} has no credit (use "Caption | Credit")`);
    }

    // Sources and citations
    const sources = a.sources ?? [];
    const sourceIds = new Set<string>();
    for (const s of sources) {
      if (!SOURCE_ID.test(s.id)) err(`source id "${s.id}" must be lowercase letters, digits and hyphens`);
      if (sourceIds.has(s.id)) err(`source id "${s.id}" is listed twice`);
      sourceIds.add(s.id);
      if (!s.title.trim() || !s.publisher.trim()) err(`source "${s.id}" needs a title and publisher`);
      if (s.url && !/^https:\/\//.test(s.url)) err(`source "${s.id}" url must be https`);
      if (s.publishedAt && !validDate(s.publishedAt)) err(`source "${s.id}" publishedAt is not an ISO date`);
      if (s.accessedAt && !validDate(s.accessedAt)) err(`source "${s.id}" accessedAt is not an ISO date`);
      if (s.url && !s.accessedAt) warn(`source "${s.id}" has a URL but no accessedAt date`);
    }
    const cited = extractCitationIds(a.body);
    for (const id of cited) {
      if (!sourceIds.has(id)) err(`body cites [^${id}] but no source has that id`);
    }
    for (const id of sourceIds) {
      if (!cited.includes(id)) warn(`source "${id}" is listed but never cited in the body`);
    }
    if (isCategorySlug(a.category) && getCategory(a.category).requiresSources && sources.length === 0) {
      strict(`${getCategory(a.category).name} articles must list at least one source`);
    }

    // Technical specifications
    for (const spec of a.specs ?? []) {
      if (spec.sourceIds.length === 0) err(`spec "${spec.label}" has no source`);
      for (const id of spec.sourceIds) {
        if (!sourceIds.has(id)) err(`spec "${spec.label}" cites unknown source "${id}"`);
      }
      if (!spec.verified) warn(`spec "${spec.label}" is unverified; present it as reported, not as fact`);
    }

    // Disagreements between sources
    for (const d of a.discrepancies ?? []) {
      if (d.accounts.length < 2) err(`discrepancy "${d.topic}" needs at least two accounts`);
      for (const acc of d.accounts) {
        if (!sourceIds.has(acc.sourceId)) err(`discrepancy "${d.topic}" cites unknown source "${acc.sourceId}"`);
      }
    }

    // Article-level service CTA
    if (a.cta) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.cta.service)) err(`cta.service "${a.cta.service}" must be lowercase words joined by hyphens`);
      if (!a.cta.label.trim() || !a.cta.blurb.trim()) err("cta needs a label and a blurb");
    }

    // SEO
    if (a.seo?.canonical && !/^https:\/\//.test(a.seo.canonical)) err("seo.canonical must be an absolute https URL");
  }

  return issues;
}

/** Prints warnings once per process and throws on errors. */
let reported = false;
export function enforce(issues: Issue[]): void {
  const errors = issues.filter((i) => i.level === "error");
  if (!reported) {
    reported = true;
    const warnings = issues.filter((i) => i.level === "warning");
    if (warnings.length > 0) {
      console.warn(
        `[field-notes] ${warnings.length} editorial warning(s):\n` +
          warnings.map((w) => `  · ${w.slug}: ${w.message}`).join("\n")
      );
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `[field-notes] ${errors.length} editorial error(s) — fix before publishing:\n` +
        errors.map((e) => `  · ${e.slug}: ${e.message}`).join("\n")
    );
  }
}
