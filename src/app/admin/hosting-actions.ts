"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";

/**
 * Writes for the Hosting screens.
 *
 * The dangerous verbs on this screen are real ones: suspending an account
 * takes a client's website off the air, and changing a plan changes what
 * somebody is charged. So:
 *
 *   - Suspending requires a typed confirmation, checked here on the server.
 *     A client component could be bypassed; this cannot.
 *   - NOTHING in this file touches Stripe. Changing a plan records the plan
 *     we intend; moving the actual subscription is a deliberate act in
 *     Stripe, and doing it silently from an admin table is how a client gets
 *     charged the wrong amount without anyone deciding to.
 *   - Nothing deletes. Costs and incidents are ended or resolved.
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

function toCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

const HOSTING = "/admin/hosting";

/** Record what a site costs us. This is what makes margin real. */
export async function addCostAction(formData: FormData) {
  const { supabase } = await requireAdmin();

  const websiteId = str(formData, "website_id", 40);
  const label = str(formData, "label", 160);
  const amount = toCents(str(formData, "amount", 20));
  if (!websiteId || !label || amount === null) return;

  const category = str(formData, "category", 30);
  const interval = str(formData, "interval", 20);

  await supabase.from("website_costs").insert({
    website_id: websiteId,
    label,
    amount_cents: amount,
    category: ["infrastructure", "domain", "ssl", "storage", "database", "support", "processing", "software", "other"].includes(category)
      ? category
      : "infrastructure",
    interval: ["monthly", "annual", "one_time"].includes(interval) ? interval : "monthly",
    vendor: str(formData, "vendor", 120) || null,
  });

  revalidatePath(HOSTING);
}

/**
 * End a cost rather than deleting it.
 *
 * Deleting would silently change last quarter's margin. Ending it leaves the
 * history intact and stops it counting from today.
 */
export async function endCostAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "cost_id", 40);
  if (!id) return;

  await supabase
    .from("website_costs")
    .update({ effective_to: new Date().toISOString().slice(0, 10) })
    .eq("id", id);

  revalidatePath(HOSTING);
}

export async function logIncidentAction(formData: FormData) {
  const { supabase } = await requireAdmin();

  const websiteId = str(formData, "website_id", 40);
  const title = str(formData, "title", 200);
  const kind = str(formData, "kind", 40);
  if (!websiteId || !title) return;

  const KINDS = [
    "site_down", "slow_performance", "ssl_expiring", "ssl_expired",
    "domain_expiring", "failed_deployment", "database_error",
    "backup_failure", "payment_issue", "integration_error", "other",
  ];
  const severity = str(formData, "severity", 20);

  await supabase.from("website_incidents").insert({
    website_id: websiteId,
    kind: KINDS.includes(kind) ? kind : "other",
    severity: ["critical", "high", "medium", "low"].includes(severity) ? severity : "medium",
    title,
    detail: str(formData, "detail", 2000) || null,
    // Recorded by a person, and labelled as such — this system has no monitor.
    source: "manual",
  });

  revalidatePath(HOSTING);
}

export async function resolveIncidentAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "incident_id", 40);
  if (!id) return;

  await supabase
    .from("website_incidents")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(HOSTING);
}

/** Record which plan an account is on. Does not touch Stripe. */
export async function setPlanAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const websiteId = str(formData, "website_id", 40);
  const planId = str(formData, "plan_id", 40);
  if (!websiteId) return;

  await supabase
    .from("websites")
    .update({ hosting_plan_id: planId || null })
    .eq("id", websiteId);

  revalidatePath(HOSTING);
}

/**
 * Suspend a hosting account.
 *
 * This takes a client's site off the air, so it asks the person to type the
 * domain — and the check happens HERE, on the server, where a client-side
 * dialog cannot be skipped. It also records why, because "why is this site
 * suspended" is the question somebody asks three weeks later.
 *
 * It changes our record. It does not call a hosting provider: nothing in this
 * codebase has a Vercel token, and an admin table that silently pulls a live
 * site down is not a feature anyone asked for.
 */
export async function suspendAccountAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const websiteId = str(formData, "website_id", 40);
  const typed = str(formData, "confirm_domain", 200).toLowerCase();
  const reason = str(formData, "reason", 1000);
  if (!websiteId) return;

  const { data: site } = await supabase
    .from("websites")
    .select("id, domain, name, notes")
    .eq("id", websiteId)
    .maybeSingle();

  if (!site) return;

  // The typed domain must match. No match, no suspension, no error thrown —
  // the form simply does nothing, and the screen still shows the site live.
  if (typed !== site.domain.toLowerCase()) {
    console.warn(`[hosting] suspend refused: confirmation did not match ${site.domain}`);
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const note = `[${stamp}] Suspended by ${actor}${reason ? `: ${reason}` : "."}`;

  await supabase
    .from("websites")
    .update({ status: "paused", notes: site.notes ? `${site.notes}\n${note}` : note })
    .eq("id", websiteId);

  await supabase.from("website_incidents").insert({
    website_id: websiteId,
    kind: "other",
    severity: "high",
    title: "Account suspended",
    detail: note,
    source: "manual",
  });

  revalidatePath(HOSTING);
  revalidatePath("/admin/websites");
}

/** Put a suspended account back. Deliberately not gated — restoring is safe. */
export async function reinstateAccountAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const websiteId = str(formData, "website_id", 40);
  if (!websiteId) return;

  await supabase.from("websites").update({ status: "live" }).eq("id", websiteId);
  revalidatePath(HOSTING);
  revalidatePath("/admin/websites");
}
