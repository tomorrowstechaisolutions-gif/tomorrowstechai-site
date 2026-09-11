import { NextResponse } from "next/server";
import { getAdminUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AD_FORMATS, type AdFormat, type CatalogSnapshot, type CreativeBrief } from "@/lib/ad-studio/types";
import { backgroundPrompt } from "@/lib/ad-studio/core";
import { generateBackground } from "@/lib/ad-studio/provider";
import { renderCreative } from "@/lib/ad-studio/render";

export const runtime = "nodejs";
export const maxDuration = 120;

type Job = Record<string, unknown> & { id: string; campaign_set_id: string; catalog_item_id: string | null; format: AdFormat; width: number; height: number; template_key: string; brand_profile_id: string; source_snapshot: CatalogSnapshot; creative_brief: CreativeBrief; source_fingerprint: string };

async function refreshCampaign(db: ReturnType<typeof supabaseAdmin>, campaignId: string) {
  const { data } = await db.from("ad_generation_jobs").select("status").eq("campaign_set_id", campaignId);
  const rows = data ?? []; const completed = rows.filter((x) => x.status === "completed").length; const failed = rows.filter((x) => x.status === "failed").length; const active = rows.some((x) => ["queued", "generating"].includes(x.status));
  await db.from("ad_campaign_sets").update({ completed_jobs: completed, failed_jobs: failed, status: active ? "generating" : failed && completed ? "partial" : failed ? "failed" : "completed", completed_at: active ? null : new Date().toISOString() }).eq("id", campaignId);
}

export async function POST(request: Request) {
  const session = await getAdminUser();
  if (!session || !["owner", "admin"].includes(session.admin.role)) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { campaignId?: string; jobId?: string };
  const db = supabaseAdmin();
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  let recovery = db.from("ad_generation_jobs").update({ status: "queued", error_message: "Recovered after an interrupted worker." }).eq("status", "generating").lt("started_at", staleBefore);
  if (body.campaignId) recovery = recovery.eq("campaign_set_id", body.campaignId);
  await recovery;
  const scoped = await createSupabaseServerClient();
  let query = scoped.from("ad_generation_jobs").select("*").eq("status", "queued").order("created_at").limit(1);
  if (body.jobId) query = query.eq("id", body.jobId); else if (body.campaignId) query = query.eq("campaign_set_id", body.campaignId);
  const selected = await query.maybeSingle();
  if (selected.error) return NextResponse.json({ error: "Could not read the queue." }, { status: 500 });
  if (!selected.data) return NextResponse.json({ done: true });
  const job = selected.data as Job;
  const claim = await db.from("ad_generation_jobs").update({ status: "generating", attempts: Number(job.attempts ?? 0) + 1, started_at: new Date().toISOString(), error_message: null }).eq("id", job.id).eq("status", "queued").select("id").maybeSingle();
  if (!claim.data) return NextResponse.json({ skipped: true });
  await db.from("ad_campaign_sets").update({ status: "generating", started_at: new Date().toISOString() }).eq("id", job.campaign_set_id).eq("status", "queued");
  try {
    const template = await db.from("brand_templates").select("prompt_guidance").eq("brand_profile_id", job.brand_profile_id).eq("template_key", job.template_key).neq("status", "archived").maybeSingle();
    const prompt = backgroundPrompt(job.source_snapshot, job.creative_brief, String(template.data?.prompt_guidance || "Premium service showcase with clean negative space."));
    const generated = await generateBackground(prompt, AD_FORMATS[job.format].aiSize);
    const finalImage = await renderCreative({ background: generated.bytes, width: job.width, height: job.height, snapshot: job.source_snapshot, brief: job.creative_brief });
    const folder = job.source_snapshot.kind === "custom" ? "custom" : `${job.source_snapshot.kind}s`;
    const path = `ads/${folder}/${job.source_snapshot.slug}/${job.id}.png`;
    const upload = await db.storage.from("brand-assets").upload(path, finalImage, { contentType: "image/png", upsert: false });
    if (upload.error) throw new Error("The final creative could not be stored.");
    const asset = await db.from("content_assets").insert({
      brand_profile_id: job.brand_profile_id, title: `${job.source_snapshot.name} — ${AD_FORMATS[job.format].label}`,
      asset_type: "ad", category: job.source_snapshot.kind, role: "generated_creative", approval_status: "waiting_review",
      storage_path: path, mime_type: "image/png", file_size: finalImage.byteLength, width: job.width, height: job.height,
      format: job.format, service: job.source_snapshot.name, platform: "multi-channel", tags: ["ai-generated", job.format, job.source_snapshot.kind],
      generation_provider: generated.provider, generation_model: generated.model, generation_prompt: generated.prompt,
      generation_cost_micro_usd: generated.costMicroUsd, source_snapshot: job.source_snapshot, source_fingerprint: job.source_fingerprint,
      template_key: job.template_key, creative_brief: job.creative_brief, generated_by_user_id: session.user.id, generated_at: new Date().toISOString(), uploaded_by: session.admin.email,
    }).select("id").single();
    if (asset.error) { await db.storage.from("brand-assets").remove([path]); throw new Error("The creative metadata could not be saved."); }
    if (job.catalog_item_id) {
      const relation = await db.from("creative_asset_relations").insert({ asset_id: asset.data.id, catalog_item_id: job.catalog_item_id, relationship_type: "ad", created_by: session.user.id });
      if (relation.error) { await db.from("content_assets").delete().eq("id", asset.data.id); await db.storage.from("brand-assets").remove([path]); throw new Error("The creative could not be associated with its catalog item."); }
    }
    await db.from("ad_generation_jobs").update({ status: "completed", asset_id: asset.data.id, generation_provider: generated.provider, generation_model: generated.model, generation_prompt: generated.prompt, estimated_cost_micro_usd: generated.costMicroUsd, completed_at: new Date().toISOString() }).eq("id", job.id);
    await refreshCampaign(db, job.campaign_set_id);
    return NextResponse.json({ done: false, jobId: job.id, assetId: asset.data.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    const retry = Number(job.attempts ?? 0) + 1 < Number(job.max_attempts ?? 2);
    await db.from("ad_generation_jobs").update({ status: retry ? "queued" : "failed", error_message: message, completed_at: retry ? null : new Date().toISOString() }).eq("id", job.id);
    await refreshCampaign(db, job.campaign_set_id);
    return NextResponse.json({ error: message, retrying: retry }, { status: retry ? 503 : 500 });
  }
}
