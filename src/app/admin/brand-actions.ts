"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";

const ROOT = "/admin/marketing/brand";
const STATUSES = new Set(["active", "draft", "needs_review", "incomplete", "paused", "archived"]);
const TYPES = new Set(["internal", "client", "white_label", "product", "sub_brand"]);

async function requireManager() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  if (!["owner", "admin"].includes(session.admin.role)) throw new Error("You do not have permission to modify core brand identity.");
  return { supabase: await createSupabaseServerClient(), actor: session.admin.email, userId: session.user.id };
}

const str = (fd: FormData, key: string, max = 2000) => {
  const v = fd.get(key); return typeof v === "string" ? v.trim().slice(0, max) : "";
};
const list = (fd: FormData, key: string) => [...new Set(str(fd, key, 3000).split(/[,\n]/).map((v) => v.trim()).filter(Boolean))].slice(0, 50);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

async function log(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, brandId: string, actor: string, userId: string, action: string, detail?: string, assetId?: string) {
  await supabase.from("brand_activity").insert({ brand_profile_id: brandId, asset_id: assetId || null, actor_id: userId, actor_email: actor, action, detail: detail || null });
}

export async function saveBrandKitAction(fd: FormData) {
  const { supabase, actor, userId } = await requireManager();
  const id = str(fd, "brand_id", 40); const name = str(fd, "name", 160);
  if (!name) return;
  const status = str(fd, "status", 40); const brandType = str(fd, "brand_type", 40);
  const payload = {
    name, internal_name: str(fd, "internal_name", 160) || null,
    slug: slugify(name), customer_id: str(fd, "customer_id", 40) || null,
    brand_type: TYPES.has(brandType) ? brandType : "internal",
    status: STATUSES.has(status) ? status : "draft", active: status !== "archived",
    industry: str(fd, "industry", 120) || null, description: str(fd, "description", 2000) || null,
    short_description: str(fd, "description", 2000) || null, tagline: str(fd, "tagline", 300) || null,
    ownership: str(fd, "ownership", 40) || "internal", primary_font: str(fd, "primary_font", 120) || null,
    secondary_color: str(fd, "secondary_color", 10) || null, background_color: str(fd, "background_color", 10) || null,
  };
  if (id) {
    const { error } = await supabase.from("brand_profiles").update(payload).eq("id", id); if (error) throw new Error(error.message);
    await log(supabase, id, actor, userId, "brand_kit_updated", "Brand settings updated");
    revalidatePath(`${ROOT}/${id}`);
  } else {
    const { data, error } = await supabase.from("brand_profiles").insert(payload).select("id").single(); if (error) throw new Error(error.message);
    await log(supabase, data.id, actor, userId, "brand_kit_created", `Created ${name}`);
  }
  revalidatePath(ROOT); revalidatePath("/admin/marketing/content");
}

export async function saveMessagingAction(fd: FormData) {
  const { supabase, actor, userId } = await requireManager(); const id = str(fd, "brand_id", 40); if (!id) return;
  const { error } = await supabase.from("brand_profiles").update({
    tagline: str(fd, "tagline", 300) || null, short_description: str(fd, "short_description", 1000) || null,
    long_description: str(fd, "long_description", 5000) || null, mission: str(fd, "mission", 2000) || null,
    vision: str(fd, "vision", 2000) || null, core_message: str(fd, "core_message", 2000) || null,
    audience: str(fd, "audience", 1000) || null, ideal_customer: str(fd, "ideal_customer", 1000) || null,
    core_services: list(fd, "core_services"), differentiators: list(fd, "differentiators"),
    primary_cta: str(fd, "primary_cta", 300) || null, secondary_cta: str(fd, "secondary_cta", 300) || null,
    tone: str(fd, "tone", 300) || null, tone_guidance: str(fd, "tone_guidance", 2000) || null,
    writing_guidance: str(fd, "tone_guidance", 2000) || null, preferred_phrases: list(fd, "preferred_phrases"),
    prohibited_phrases: list(fd, "prohibited_phrases"), phrases_to_avoid: list(fd, "phrases_to_avoid"),
    claims_requiring_approval: list(fd, "claims_requiring_approval"), cta_style: str(fd, "primary_cta", 300) || null,
  }).eq("id", id); if (error) throw new Error(error.message);
  await log(supabase, id, actor, userId, "messaging_updated", "Brand voice and messaging updated");
  revalidatePath(`${ROOT}/${id}`); revalidatePath("/admin/marketing/content");
}

export async function addColorAction(fd: FormData) {
  const { supabase, actor, userId } = await requireManager(); const id = str(fd, "brand_id", 40); const hex = str(fd, "hex", 7).toUpperCase();
  if (!id || !/^#[0-9A-F]{6}$/.test(hex)) return;
  const { error } = await supabase.from("brand_colors").insert({ brand_profile_id: id, name: str(fd, "name", 100) || hex, hex, role: str(fd, "role", 30) || "custom", usage_notes: str(fd, "usage_notes", 500) || null }); if (error) throw new Error(error.message);
  await log(supabase, id, actor, userId, "color_updated", `${str(fd, "name", 100) || "Color"} added`); revalidatePath(`${ROOT}/${id}`); revalidatePath(ROOT);
}

export async function addTypographyAction(fd: FormData) {
  const { supabase, actor, userId } = await requireManager(); const id = str(fd, "brand_id", 40); const font = str(fd, "font_name", 120); if (!id || !font) return;
  const { error } = await supabase.from("brand_typography").insert({ brand_profile_id: id, font_name: font, weight: str(fd, "weight", 40) || null, style: str(fd, "style", 40) || null, role: str(fd, "role", 30) || "body", fallback_stack: str(fd, "fallback_stack", 300) || null, usage_notes: str(fd, "usage_notes", 500) || null }); if (error) throw new Error(error.message);
  await supabase.from("brand_profiles").update({ primary_font: font }).eq("id", id).is("primary_font", null);
  await log(supabase, id, actor, userId, "font_updated", `${font} added`); revalidatePath(`${ROOT}/${id}`); revalidatePath(ROOT);
}

export async function saveGuidelineAction(fd: FormData) {
  const { supabase, actor, userId } = await requireManager(); const id = str(fd, "brand_id", 40); const section = str(fd, "section", 80); if (!id || !section) return;
  const { error } = await supabase.from("brand_guidelines").upsert({ brand_profile_id: id, section, content: str(fd, "content", 12000) }, { onConflict: "brand_profile_id,section" }); if (error) throw new Error(error.message);
  await log(supabase, id, actor, userId, "guideline_updated", `${section} updated`); revalidatePath(`${ROOT}/${id}`); revalidatePath(ROOT);
}

export async function saveTemplateAction(fd: FormData) {
  const { supabase, actor, userId } = await requireManager(); const id = str(fd, "brand_id", 40); const name = str(fd, "name", 160); if (!id || !name) return;
  const width = Number.parseInt(str(fd, "width", 6), 10); const height = Number.parseInt(str(fd, "height", 6), 10);
  const { error } = await supabase.from("brand_templates").insert({ brand_profile_id: id, name, template_type: str(fd, "template_type", 60) || "custom", width: Number.isFinite(width) ? width : null, height: Number.isFinite(height) ? height : null, status: "draft" }); if (error) throw new Error(error.message);
  await log(supabase, id, actor, userId, "template_created", name); revalidatePath(`${ROOT}/${id}`); revalidatePath(ROOT);
}

export async function reviewAssetAction(fd: FormData) {
  const { supabase, actor, userId } = await requireManager(); const assetId = str(fd, "asset_id", 40); const status = str(fd, "status", 30);
  if (!assetId || !["approved", "changes_requested", "rejected", "waiting_review"].includes(status)) return;
  const { data: asset, error } = await supabase.from("content_assets").update({ approval_status: status, approved_by: status === "approved" ? userId : null, approved_at: status === "approved" ? new Date().toISOString() : null, approval_notes: str(fd, "approval_notes", 2000) || null }).eq("id", assetId).select("brand_profile_id,title").single(); if (error) throw new Error(error.message);
  if (asset.brand_profile_id) await log(supabase, asset.brand_profile_id, actor, userId, `asset_${status}`, asset.title, assetId);
  revalidatePath(ROOT); if (asset.brand_profile_id) revalidatePath(`${ROOT}/${asset.brand_profile_id}`);
}

export async function archiveBrandAction(fd: FormData) {
  const { supabase, actor, userId } = await requireManager(); const id = str(fd, "brand_id", 40); if (!id) return;
  await log(supabase, id, actor, userId, "brand_kit_archived");
  const { error } = await supabase.from("brand_profiles").update({ status: "archived", active: false, archived_at: new Date().toISOString() }).eq("id", id); if (error) throw new Error(error.message);
  revalidatePath(ROOT); redirect(ROOT);
}
