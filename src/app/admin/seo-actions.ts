"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { runAudit } from "@/lib/seo/audit";

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
