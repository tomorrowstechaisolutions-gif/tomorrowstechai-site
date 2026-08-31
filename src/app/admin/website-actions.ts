"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { normalizeDomain } from "@/lib/websites/queries";

/**
 * Writes for the Websites screens.
 *
 * Same posture as every other action file here: re-check the admin on each
 * call, use the request-scoped client so RLS applies on top of that check,
 * never touch the service role.
 *
 * Nothing in this file provisions anything external. Adding a website records
 * that we manage it; it does not buy a domain, create a Vercel project or
 * start a subscription, and it must not start doing so quietly.
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

const WEBSITES = "/admin/websites";

const STATUSES = [
  "live", "development", "waiting_on_client", "review",
  "maintenance", "paused", "issue", "archived",
];
const TYPES = [
  "business", "ecommerce", "web_app", "saas", "portfolio",
  "landing_page", "client_portal", "membership", "other",
];

export async function addWebsiteAction(formData: FormData) {
  const { supabase } = await requireAdmin();

  const name = str(formData, "name", 160);
  const domain = normalizeDomain(str(formData, "domain", 200));
  if (!name || !domain || !domain.includes(".")) return;

  const status = str(formData, "status", 40);
  const websiteType = str(formData, "website_type", 40);
  const customerId = str(formData, "customer_id", 40);
  const owner = str(formData, "owner", 120);
  const hostingProvider = str(formData, "hosting_provider", 120);

  const { error } = await supabase.from("websites").insert({
    name,
    domain,
    base_url: `https://${domain}`,
    status: STATUSES.includes(status) ? status : "development",
    website_type: TYPES.includes(websiteType) ? websiteType : "business",
    customer_id: customerId || null,
    owner: owner || null,
    hosting_provider: hostingProvider || null,
  });

  // A duplicate domain is the expected failure here — the unique index treats
  // www and case as the same site, which is the point. Fail quietly rather
  // than throwing a 500 at someone who added the same site twice.
  if (error) {
    console.error("[websites:add]", error.message);
    return;
  }

  revalidatePath(WEBSITES);
}

export async function updateWebsiteStatusAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "website_id", 40);
  const status = str(formData, "status", 40);
  if (!id || !STATUSES.includes(status)) return;

  await supabase
    .from("websites")
    .update({ status, is_archived: status === "archived" })
    .eq("id", id);

  revalidatePath(WEBSITES);
}

/**
 * Archive, not delete.
 *
 * A website row carries the lead attribution history for its domain. Deleting
 * it to tidy a list would silently orphan that, so the destructive-looking
 * action is a status change and the row stays.
 */
export async function archiveWebsiteAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "website_id", 40);
  if (!id) return;

  await supabase
    .from("websites")
    .update({ status: "archived", is_archived: true })
    .eq("id", id);

  revalidatePath(WEBSITES);
}

export async function addRenewalAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const websiteId = str(formData, "website_id", 40);
  const kind = str(formData, "kind", 30);
  const renewsAt = str(formData, "renews_at", 20);
  if (!websiteId || !renewsAt) return;
  if (!["domain", "hosting", "maintenance", "saas", "support", "ssl"].includes(kind)) return;

  await supabase.from("website_renewals").insert({
    website_id: websiteId,
    kind,
    renews_at: renewsAt,
    amount_cents: toCents(str(formData, "amount", 20)),
    vendor: str(formData, "vendor", 120) || null,
  });

  revalidatePath(WEBSITES);
}
