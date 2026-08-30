import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  RULES,
  SLOW_RESPONSE_MS,
  THIN_CONTENT_WORDS,
  TITLE_MAX,
  TITLE_MIN,
  type RuleCode,
  type Severity,
} from "./rules";
import type { ParsedPage } from "./parse";

/**
 * Rule evaluation, with no network and no database in sight.
 *
 * Kept apart from the crawl on purpose: this is the part with the judgement
 * in it, and it is only trustworthy if it can be run against fixed HTML and
 * checked — that a rule fires on the case it was written for, and stays quiet
 * on the case it was not.
 */

export type AuditIssue = { path: string; code: RuleCode; severity: Severity; detail: string | null };

export type AuditPage = ParsedPage & {
  path: string;
  url: string;
  statusCode: number | null;
  responseMs: number;
};

/** Ignores the protocol, the www and a trailing slash when comparing URLs. */
function sameUrl(a: string | null, b: string): boolean {
  if (!a) return false;
  const norm = (u: string) => {
    try {
      const parsed = new URL(u, b);
      return (
        parsed.hostname.replace(/^www\./, "") +
        parsed.pathname.replace(/\/$/, "").toLowerCase()
      );
    } catch {
      return u.replace(/\/$/, "").toLowerCase();
    }
  };
  return norm(a) === norm(b);
}

/**
 * Applies the rule catalogue.
 *
 * Split out from the fetching so it can be tested against fixed HTML without
 * a network — which is the only way to be sure a rule fires on the case it
 * was written for and stays quiet on the case it was not.
 */
export function evaluate(pages: AuditPage[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const add = (path: string, code: RuleCode, detail: string | null = null) =>
    issues.push({ path, code, severity: RULES[code].severity, detail });

  // Duplicates are a property of the set, not of one page, so they are counted
  // across every page first.
  const titleCounts = new Map<string, string[]>();
  const descCounts = new Map<string, string[]>();
  for (const p of pages) {
    if (p.title) {
      const key = p.title.toLowerCase();
      titleCounts.set(key, [...(titleCounts.get(key) ?? []), p.path]);
    }
    if (p.description) {
      const key = p.description.toLowerCase();
      descCounts.set(key, [...(descCounts.get(key) ?? []), p.path]);
    }
  }

  for (const p of pages) {
    if (p.statusCode === null || p.statusCode >= 400) {
      add(p.path, "unreachable", p.statusCode ? `HTTP ${p.statusCode}` : "No response");
      // Nothing else can be judged about a page that did not load.
      continue;
    }

    if (p.noindex) add(p.path, "noindex", "In the sitemap but marked noindex");

    if (!p.title) {
      add(p.path, "missing_title");
    } else {
      if (p.title.length > TITLE_MAX) {
        add(p.path, "title_too_long", `${p.title.length} characters — ${p.title.length - TITLE_MAX} over`);
      } else if (p.title.length < TITLE_MIN) {
        add(p.path, "title_too_short", `${p.title.length} characters`);
      }
      const shared = (titleCounts.get(p.title.toLowerCase()) ?? []).filter((x) => x !== p.path);
      if (shared.length > 0) {
        add(p.path, "duplicate_title", `Also on ${shared.slice(0, 3).join(", ")}`);
      }
    }

    if (!p.description) {
      add(p.path, "missing_description");
    } else {
      if (p.description.length > DESCRIPTION_MAX) {
        add(p.path, "description_too_long", `${p.description.length} characters — ${p.description.length - DESCRIPTION_MAX} over`);
      } else if (p.description.length < DESCRIPTION_MIN) {
        add(p.path, "description_too_short", `${p.description.length} characters`);
      }
      const shared = (descCounts.get(p.description.toLowerCase()) ?? []).filter((x) => x !== p.path);
      if (shared.length > 0) {
        add(p.path, "duplicate_description", `Also on ${shared.slice(0, 3).join(", ")}`);
      }
    }

    if (!p.canonical) {
      add(p.path, "missing_canonical");
    } else if (!sameUrl(p.canonical, p.url)) {
      add(p.path, "canonical_mismatch", `Points at ${p.canonical}`);
    }

    if (!p.ogImage) add(p.path, "missing_og_image");

    if (p.h1Count === 0) add(p.path, "missing_h1");
    else if (p.h1Count > 1) add(p.path, "multiple_h1", `${p.h1Count} H1 headings`);

    if (p.wordCount < THIN_CONTENT_WORDS) {
      add(p.path, "thin_content", `${p.wordCount} words`);
    }

    if (p.jsonldTypes.length === 0) add(p.path, "no_schema");

    if (p.responseMs > SLOW_RESPONSE_MS) {
      add(p.path, "slow_response", `${p.responseMs}ms to first byte`);
    }
  }

  return issues;
}
