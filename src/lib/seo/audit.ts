import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import sitemap from "@/app/sitemap";
import { parsePage, type ParsedPage } from "./parse";
import { evaluate, type AuditIssue, type AuditPage } from "./evaluate";

export { evaluate };
export type { AuditIssue, AuditPage };

/**
 * The crawl.
 *
 * The page list comes from `sitemap.ts` rather than from a directory walk,
 * because the sitemap is what the site tells Google to look at. Auditing
 * anything else would be auditing pages nobody asked to have indexed, and
 * missing the mismatch when a route exists but never made it into the map.
 *
 * Everything below is decidable without Google, a rank tracker or a paid API.
 */

export type AuditResult = {
  runId: string;
  pages: AuditPage[];
  issues: AuditIssue[];
};

const CONCURRENCY = 6;

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://tomorrowstechai.com"
  );
}

async function fetchPage(url: string, path: string): Promise<AuditPage> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        // Identify honestly. A crawler pretending to be Chrome is a crawler
        // nobody can block, which is not a thing to build into your own site.
        "user-agent": "TomorrowsTechAI-SEO-Audit/1.0 (+https://tomorrowstechai.com)",
      },
      cache: "no-store",
      redirect: "follow",
    });
    const responseMs = Date.now() - started;
    const html = res.ok ? await res.text() : "";

    return {
      path,
      url,
      statusCode: res.status,
      responseMs,
      ...(html
        ? parsePage(html, url)
        : {
            title: null,
            description: null,
            canonical: null,
            ogImage: null,
            h1: null,
            h1Count: 0,
            wordCount: 0,
            jsonldTypes: [],
            noindex: false,
            internalLinks: 0,
          }),
    };
  } catch {
    return {
      path,
      url,
      statusCode: null,
      responseMs: Date.now() - started,
      title: null,
      description: null,
      canonical: null,
      ogImage: null,
      h1: null,
      h1Count: 0,
      wordCount: 0,
      jsonldTypes: [],
      noindex: false,
      internalLinks: 0,
    };
  }
}

/** The URLs to check, from the sitemap the site publishes. */
export function auditTargets(): { path: string; url: string }[] {
  const base = baseUrl();
  return sitemap().map((entry) => {
    const url = String(entry.url);
    let path = "/";
    try {
      path = new URL(url).pathname || "/";
    } catch {
      path = url;
    }
    // Audit the deployment this admin is running against, which on a preview
    // is not the domain the sitemap hard-codes.
    return { path, url: `${base}${path === "/" ? "" : path}` };
  });
}

/**
 * Crawl, evaluate, and record.
 *
 * The run row is written first with status 'running' so a crawl that dies
 * halfway leaves evidence rather than silence.
 */
export async function runAudit(
  sb: SupabaseClient,
  actor: string
): Promise<AuditResult> {
  const targets = auditTargets();
  const base = baseUrl();

  const { data: run, error: runError } = await sb
    .from("seo_audit_runs")
    .insert({ status: "running", base_url: base, actor })
    .select("id")
    .single();

  if (runError || !run) throw new Error(runError?.message ?? "Could not start the audit");
  const runId = run.id as string;

  try {
    const pages: AuditPage[] = [];
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      pages.push(...(await Promise.all(batch.map((t) => fetchPage(t.url, t.path)))));
    }

    const issues = evaluate(pages);

    if (pages.length > 0) {
      const { error } = await sb.from("seo_pages").insert(
        pages.map((p) => ({
          run_id: runId,
          path: p.path,
          url: p.url,
          status_code: p.statusCode,
          response_ms: p.responseMs,
          title: p.title,
          title_length: p.title?.length ?? null,
          description: p.description,
          description_length: p.description?.length ?? null,
          canonical: p.canonical,
          og_image: p.ogImage,
          h1: p.h1,
          h1_count: p.h1Count,
          word_count: p.wordCount,
          jsonld_types: p.jsonldTypes,
          noindex: p.noindex,
          internal_links: p.internalLinks,
        }))
      );
      if (error) throw new Error(error.message);
    }

    if (issues.length > 0) {
      const { error } = await sb.from("seo_issues").insert(
        issues.map((i) => ({
          run_id: runId,
          path: i.path,
          code: i.code,
          severity: i.severity,
          detail: i.detail,
        }))
      );
      if (error) throw new Error(error.message);
    }

    await sb
      .from("seo_audit_runs")
      .update({
        status: "complete",
        finished_at: new Date().toISOString(),
        pages_checked: pages.length,
        issues_found: issues.length,
      })
      .eq("id", runId);

    return { runId, pages, issues };
  } catch (err) {
    await sb
      .from("seo_audit_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Unknown error",
      })
      .eq("id", runId);
    throw err;
  }
}
