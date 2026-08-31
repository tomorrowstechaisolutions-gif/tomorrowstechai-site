"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { runAudit } from "@/lib/seo/audit";
import { loadSeoBoard, type SeoBoard } from "@/lib/seo/queries";

/**
 * Writes for the SEO screen.
 *
 * Two kinds of write happen here and they are deliberately different. Running
 * an audit and watching a competitor are the operator's own acts, so they are
 * performed. Anything that would change the website — a rewritten title, a new
 * page — is only ever PROPOSED: it becomes a row in ai_actions with status
 * 'proposed', and nothing acts on it until a named admin approves it. The
 * database enforces that half; this file never sets 'approved'.
 */
async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email };
}

function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const SEO = "/admin/marketing/seo";

/** Crawl the sitemap and record what is wrong. Read-only against the site. */
export async function runSeoAuditAction() {
  const { supabase, actor } = await requireAdmin();
  await runAudit(supabase, actor);
  revalidatePath(SEO);
}

export async function addCompetitorAction(formData: FormData) {
  const { supabase } = await requireAdmin();

  // Accept whatever shape it is pasted in and store the bare host, so the
  // same competitor cannot be added three times as three different strings.
  const raw = str(formData, "domain", 200).toLowerCase();
  if (!raw) return;
  let domain = raw;
  try {
    domain = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    domain = raw.replace(/^https?:\/\//, "").split("/")[0];
  }
  domain = domain.replace(/^www\./, "").trim();
  if (!domain || !domain.includes(".")) return;

  const label = str(formData, "label", 120) || null;

  await supabase.from("seo_competitors").insert({ domain, label });
  revalidatePath(SEO);
}

export async function removeCompetitorAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "competitor_id", 40);
  if (!id) return;
  await supabase.from("seo_competitors").delete().eq("id", id);
  revalidatePath(SEO);
}

/**
 * Send a recommendation to the review queue.
 *
 * Nothing is written to the website here — this creates the proposal that the
 * AI Command Center reviews. `kind` is 'other' because the executor for
 * content changes does not exist yet, and claiming a kind that has no executor
 * would be a lie told in a database column.
 */
export async function proposeSeoActionAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const title = str(formData, "title", 200);
  const body = str(formData, "body", 2000);
  const path = str(formData, "path", 300) || null;
  const severity = str(formData, "severity", 20);
  if (!title) return;

  const risk = severity === "critical" || severity === "high" ? "medium" : "low";

  await supabase.from("ai_actions").insert({
    kind: "other",
    title,
    summary: body || null,
    payload: { area: "seo", path, severity },
    status: "proposed",
    risk,
    proposed_by: "rule",
    rationale: `Queued from the SEO Command Center by ${actor}. Requires review before anything is published.`,
  });

  revalidatePath(SEO);
  revalidatePath("/admin");
}

/**
 * The six standing jobs on the SEO screen.
 *
 * Each one re-derives its own evidence from the live board rather than
 * trusting whatever the page rendered, then writes ONE proposal describing
 * exactly what would be done and to which pages. None of them touch the
 * website. When a job has nothing to work on it writes nothing and says so,
 * which is why the button is disabled on screen rather than hidden: the
 * absence of work is information too.
 */
export type SeoJob =
  | "draft_page"
  | "improve_page"
  | "meta_tags"
  | "blog_post"
  | "faq_schema"
  | "internal_links";

const JOBS: SeoJob[] = [
  "draft_page",
  "improve_page",
  "meta_tags",
  "blog_post",
  "faq_schema",
  "internal_links",
];

export async function queueSeoJobAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const job = str(formData, "job", 40) as SeoJob;
  if (!JOBS.includes(job)) return;

  const board = await loadSeoBoard(supabase);
  const plan = planFor(job, board);
  if (!plan) return;

  await supabase.from("ai_actions").insert({
    kind: plan.kind,
    title: plan.title,
    summary: plan.summary,
    payload: { area: "seo", job, ...plan.payload },
    status: "proposed",
    risk: "low",
    proposed_by: "rule",
    rationale: `${plan.evidence} Queued from the SEO Command Center by ${actor}. Nothing is published until this is approved and the change is made.`,
  });

  revalidatePath(SEO);
  revalidatePath("/admin");
}

type Plan = {
  kind: "draft_proposal" | "other";
  title: string;
  summary: string;
  evidence: string;
  payload: Record<string, unknown>;
};

function planFor(job: SeoJob, board: SeoBoard): Plan | null {
  const list = (items: string[]) => items.slice(0, 8).join(", ");

  if (job === "draft_page") {
    const gap = board.gaps.find((g) => !g.hasPage);
    if (!gap) return null;
    return {
      kind: "draft_proposal",
      title: `Draft a ${gap.interest.toLowerCase()} page at ${gap.suggestedPath}`,
      summary: `Write a dedicated page for ${gap.interest.toLowerCase()}: what it is, who it is for, what it costs to get started, and a lead form. Today the only page covering it is the shared services page.`,
      evidence: `${gap.leads} lead${gap.leads === 1 ? "" : "s"} in the last 28 days asked about ${gap.interest.toLowerCase()} and no page serves it.`,
      payload: { path: gap.suggestedPath, interest: gap.interest, leads: gap.leads },
    };
  }

  if (job === "improve_page") {
    // The page that already earns leads and still has the most wrong with it.
    const page = board.pages.filter((p) => p.issueCount > 0).sort((a, b) => b.leads - a.leads || b.issueCount - a.issueCount)[0];
    if (!page) return null;
    const issues = board.audit.issues.filter((i) => i.path === page.path);
    return {
      kind: "draft_proposal",
      title: `Improve ${page.path}`,
      summary: `Fix ${issues.length} issue${issues.length === 1 ? "" : "s"} on this page: ${list(issues.map((i) => i.title.toLowerCase()))}.`,
      evidence: `${page.path} produced ${page.leads} lead${page.leads === 1 ? "" : "s"} in the last 28 days with ${issues.length} unresolved issue${issues.length === 1 ? "" : "s"}.`,
      payload: { path: page.path, codes: issues.map((i) => i.code), leads: page.leads },
    };
  }

  if (job === "meta_tags") {
    const codes = ["missing_title", "missing_description", "title_too_long", "title_too_short", "description_too_long", "description_too_short", "duplicate_title", "duplicate_description"];
    const affected = [...new Set(board.audit.issues.filter((i) => codes.includes(i.code)).map((i) => i.path))];
    if (affected.length === 0) return null;
    return {
      kind: "draft_proposal",
      title: `Rewrite titles and descriptions on ${affected.length} page${affected.length === 1 ? "" : "s"}`,
      summary: `Draft a title under 60 characters and a description of 70-160 characters for: ${list(affected)}.`,
      evidence: `${affected.length} page${affected.length === 1 ? " has" : "s have"} a missing, duplicated or badly sized title or description.`,
      payload: { paths: affected },
    };
  }

  if (job === "blog_post") {
    // Something people already search for beats something we find interesting.
    const near = board.search.nearlyThere[0];
    const gap = board.gaps.find((g) => !g.hasPage);
    if (!near && !gap) return null;
    const topic = near ? near.query : gap!.interest.toLowerCase();
    return {
      kind: "draft_proposal",
      title: `Write a post about ${topic}`,
      summary: `A post answering what someone searching "${topic}" actually wants to know, linking to the service page that sells it.`,
      evidence: near
        ? `"${near.query}" already ranks around position ${near.position === null ? "11-20" : near.position.toFixed(1)} with ${near.impressions.toLocaleString()} impressions.`
        : `${gap!.leads} lead${gap!.leads === 1 ? "" : "s"} asked about ${gap!.interest.toLowerCase()} in the last 28 days.`,
      payload: { topic, source: near ? "search_console" : "leads" },
    };
  }

  if (job === "faq_schema") {
    const affected = board.pages.filter((p) => !p.hasSchema).map((p) => p.path);
    if (affected.length === 0) return null;
    return {
      kind: "draft_proposal",
      title: `Add FAQ schema to ${affected.length} page${affected.length === 1 ? "" : "s"}`,
      summary: `Draft three to five real questions and answers per page and mark them up as JSON-LD FAQPage: ${list(affected)}.`,
      evidence: `${affected.length} audited page${affected.length === 1 ? " has" : "s have"} no JSON-LD at all.`,
      payload: { paths: affected, schema: "FAQPage" },
    };
  }

  // internal_links
  const thin = board.pages.filter((p) => p.internalLinks < 5).map((p) => p.path);
  if (thin.length === 0) return null;
  return {
    kind: "draft_proposal",
    title: `Add internal links on ${thin.length} page${thin.length === 1 ? "" : "s"}`,
    summary: `Propose links from these pages to the service pages that match what they talk about: ${list(thin)}.`,
    evidence: `${thin.length} page${thin.length === 1 ? " has" : "s have"} fewer than five internal links, so search engines have little to follow.`,
    payload: { paths: thin },
  };
}
