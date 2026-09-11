import { NextResponse } from "next/server";
import { getAdminUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminUser(); if (!session) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  const { id } = await params; const db = await createSupabaseServerClient();
  const asset = await db.from("content_assets").select("storage_path,mime_type,title").eq("id", id).eq("asset_type", "ad").maybeSingle();
  if (!asset.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const file = await db.storage.from("brand-assets").download(asset.data.storage_path);
  if (file.error) return NextResponse.json({ error: "Asset unavailable." }, { status: 404 });
  return new NextResponse(await file.data.arrayBuffer(), { headers: { "Content-Type": asset.data.mime_type || "image/png", "Cache-Control": "private, max-age=300", "Content-Disposition": `inline; filename="${asset.data.title.replace(/[^a-z0-9]+/gi, "-")}.png"` } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminUser(); if (!session || !["owner", "admin"].includes(session.admin.role)) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  const { id } = await params; const body = await request.json().catch(() => ({})) as { action?: string; catalogItemId?: string; notes?: string };
  const db = supabaseAdmin(); const asset = await db.from("content_assets").select("id,storage_path,approval_status,title").eq("id", id).eq("asset_type", "ad").maybeSingle();
  if (!asset.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (body.action === "approve" || body.action === "reject" || body.action === "request_changes") {
    const status = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "changes_requested";
    await db.from("content_assets").update({ approval_status: status, approved_by: status === "approved" ? session.user.id : null, approved_at: status === "approved" ? new Date().toISOString() : null, approval_notes: body.notes || null }).eq("id", id);
  } else if (body.action === "archive") {
    await db.from("content_assets").update({ is_archived: true, archived_at: new Date().toISOString() }).eq("id", id);
  } else if (body.action === "assign_primary") {
    if (asset.data.approval_status !== "approved" || !body.catalogItemId) return NextResponse.json({ error: "Approve the creative before assigning it as the primary image." }, { status: 409 });
    await db.from("creative_asset_relations").delete().eq("catalog_item_id", body.catalogItemId).eq("relationship_type", "primary");
    await db.from("creative_asset_relations").upsert({ asset_id: id, catalog_item_id: body.catalogItemId, relationship_type: "primary", created_by: session.user.id }, { onConflict: "asset_id,catalog_item_id,relationship_type" });
    await db.from("catalog_items").update({ image_path: asset.data.storage_path, image_url: null, image_alt: `${asset.data.title} official image` }).eq("id", body.catalogItemId);
  } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
