import { NextResponse } from "next/server";
import { getAdminUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { AD_FORMATS, type AdFormat, type CreativeBrief, type CatalogSnapshot } from "@/lib/ad-studio/types";
import { briefFromSnapshot, loadCatalogSnapshot, snapshotFingerprint } from "@/lib/ad-studio/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getAdminUser();
  if (!session || !["owner", "admin"].includes(session.admin.role)) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  const body = await request.json().catch(() => null) as { catalogIds?: string[]; formats?: AdFormat[]; variations?: number; mode?: string; brief?: Partial<CreativeBrief>; name?: string; customOffer?: { name?: string; description?: string; price?: string; features?: string[]; cta?: string } } | null;
  const catalogIds = [...new Set(body?.catalogIds ?? [])].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  const formats = [...new Set(body?.formats ?? [])].filter((f): f is AdFormat => f in AD_FORMATS);
  const variations = Math.max(1, Math.min(4, Number(body?.variations) || 1));
  const customName = String(body?.customOffer?.name || "").trim();
  if ((!catalogIds.length && !customName) || !formats.length) return NextResponse.json({ error: "Choose a catalog item or enter a custom offer, plus at least one format." }, { status: 400 });
  const db = await createSupabaseServerClient();
  const brand = await db.from("brand_profiles").select("id").eq("is_default", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!brand.data) return NextResponse.json({ error: "Set a default Brand Kit before generating ads." }, { status: 409 });
  const brandId = brand.data.id;
  const snapshots: CatalogSnapshot[] = customName ? [{ id: crypto.randomUUID(), kind: "custom", name: customName.slice(0, 120), slug: `custom-${Date.now()}`, description: String(body?.customOffer?.description || "").trim().slice(0, 500), price: String(body?.customOffer?.price || "Custom quote").trim().slice(0, 80), features: (body?.customOffer?.features ?? []).map(String).map((x) => x.trim()).filter(Boolean).slice(0, 8), cta: String(body?.customOffer?.cta || "Get Started Today").trim().slice(0, 36), route: null, updatedAt: new Date().toISOString() }] : await Promise.all(catalogIds.map((id) => loadCatalogSnapshot(db, id)));
  const requestedBrief = catalogIds.length > 1 ? { templateKey: body?.brief?.templateKey, visualConcept: body?.brief?.visualConcept, imageStyle: body?.brief?.imageStyle, audience: body?.brief?.audience, objective: body?.brief?.objective } : body?.brief ?? {};
  const mode = body?.mode === "catalog" || catalogIds.length > 1 ? "catalog" : variations > 1 ? "variations" : "quick";
  const total = snapshots.length * formats.length * variations;
  const campaign = await db.from("ad_campaign_sets").insert({
    brand_profile_id: brandId, name: String(body?.name || `${snapshots[0].name} creative set`).slice(0, 160),
    mode, status: "queued", total_jobs: total, created_by: session.user.id,
    filters: { catalogIds, formats, variations },
  }).select("id").single();
  if (campaign.error) return NextResponse.json({ error: "Could not create the generation queue." }, { status: 500 });
  const jobs = snapshots.flatMap((snapshot) => formats.flatMap((format) => Array.from({ length: variations }, (_, variation) => {
    const spec = AD_FORMATS[format]; const brief = briefFromSnapshot(snapshot, requestedBrief);
    return { campaign_set_id: campaign.data.id, catalog_item_id: snapshot.kind === "custom" ? null : snapshot.id, brand_profile_id: brandId, mode, status: "queued", format, width: spec.width, height: spec.height, template_key: brief.templateKey, creative_brief: { ...brief, variation }, source_snapshot: snapshot, source_fingerprint: snapshotFingerprint(snapshot), created_by: session.user.id };
  })));
  const inserted = await db.from("ad_generation_jobs").insert(jobs).select("id");
  if (inserted.error) {
    await db.from("ad_campaign_sets").delete().eq("id", campaign.data.id);
    return NextResponse.json({ error: "Could not queue the requested creatives." }, { status: 500 });
  }
  return NextResponse.json({ campaignId: campaign.data.id, jobs: inserted.data, total });
}
