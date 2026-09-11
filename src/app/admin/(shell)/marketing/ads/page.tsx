import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { imageProviderStatus } from "@/lib/ad-studio/provider";
import AdCreativeStudio from "@/components/admin/cc/ad-studio/AdCreativeStudio";
import "./studio.css";

export const dynamic = "force-dynamic";

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ catalog?: string }> }) {
  const session = await getAdminUser(); if (!session) redirect("/admin/login");
  const db = await createSupabaseServerClient();
  const [catalog, assets, campaigns, jobs, templates, brand, legacy] = await Promise.all([
    db.from("catalog_items").select("id,name,offer_kind,slug,short_description,description,pricing_mode,from_cents,billing_type,cta_label,updated_at,status,image_path,image_url").neq("status", "retired").order("offer_kind").order("position").limit(300),
    db.from("content_assets").select("id,title,storage_path,width,height,format,approval_status,source_snapshot,source_fingerprint,template_key,generation_provider,generation_model,generation_cost_micro_usd,generated_at,created_at,is_archived").eq("asset_type", "ad").eq("is_archived", false).order("created_at", { ascending: false }).limit(100),
    db.from("ad_campaign_sets").select("*").order("created_at", { ascending: false }).limit(30),
    db.from("ad_generation_jobs").select("id,campaign_set_id,catalog_item_id,status,format,error_message,created_at,completed_at").order("created_at", { ascending: false }).limit(100),
    db.from("brand_templates").select("id,name,template_key,prompt_guidance,status,is_system,usage_count").eq("template_type", "ad_creative").neq("status", "archived").order("name"),
    db.from("brand_profiles").select("id,name,tagline,tone,audience,primary_cta,colors,primary_font").eq("is_default", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("ad_creatives").select("id", { count: "exact", head: true }),
  ]);
  const failure = [catalog, assets, campaigns, jobs, templates, brand].find((result) => result.error);
  if (failure?.error) throw new Error(`Ad Studio could not load: ${failure.error.message}`);
  const params = await searchParams;
  return <AdCreativeStudio initialCatalogId={params.catalog} catalog={catalog.data ?? []} assets={assets.data ?? []} campaigns={campaigns.data ?? []} jobs={jobs.data ?? []} templates={templates.data ?? []} brand={brand.data} provider={imageProviderStatus()} legacyCount={legacy.count ?? 0} canManage={["owner", "admin"].includes(session.admin.role)} />;
}
