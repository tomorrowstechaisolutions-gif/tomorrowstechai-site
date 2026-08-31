import { NextResponse } from "next/server";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Asset upload and signed-URL minting for the brand library.
 *
 * The bucket is PRIVATE. Nothing here ever returns a permanent public URL,
 * and no public URL is stored: a stored link outlives every permission check
 * around it, and these are client logos and unreleased graphics. A signed URL
 * is minted per view and expires; access dies with it.
 *
 * The upload goes through the request-scoped Supabase client, so the storage
 * RLS policy (`bucket_id = 'brand-assets' and public.is_admin()`) is enforced
 * by the database rather than by this route remembering to check.
 */

const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "video/mp4", "video/quicktime", "video/webm",
  "audio/mpeg", "audio/wav",
  "application/pdf",
  "text/plain", "text/csv",
]);

const TYPE_FOR_MIME = (mime: string): string => {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "document";
  if (mime.startsWith("text/")) return "document";
  return "photo";
};

/** POST — upload one file. */
export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1048576).toFixed(1)}MB. The limit is 50MB.` },
      { status: 413 }
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `${file.type || "That file type"} is not accepted here.` },
      { status: 415 }
    );
  }

  const supabase = await createSupabaseServerClient();

  const title =
    (typeof form.get("title") === "string" ? String(form.get("title")).trim() : "") ||
    file.name.replace(/\.[^.]+$/, "");
  const brandId = typeof form.get("brand_profile_id") === "string" ? String(form.get("brand_profile_id")) : "";
  const assetType =
    (typeof form.get("asset_type") === "string" ? String(form.get("asset_type")) : "") ||
    TYPE_FOR_MIME(file.type);

  // A name that cannot collide and cannot escape its folder. The original
  // file name is kept only in `title`, never in the object key — user-chosen
  // names are exactly how a path traversal gets into a bucket.
  const ext = (file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "bin").toLowerCase();
  const key = `${brandId || "unassigned"}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("brand-assets")
    .upload(key, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[assets] upload failed:", uploadError.message);
    return NextResponse.json({ error: "The upload failed." }, { status: 502 });
  }

  const tags = (typeof form.get("tags") === "string" ? String(form.get("tags")) : "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

  const { data, error } = await supabase
    .from("content_assets")
    .insert({
      brand_profile_id: brandId || null,
      title: title.slice(0, 200),
      asset_type: assetType,
      storage_path: key,
      mime_type: file.type,
      file_size: file.size,
      tags,
      campaign: (typeof form.get("campaign") === "string" ? String(form.get("campaign")).trim() : "") || null,
      uploaded_by: session.admin.email,
    })
    .select("id, title, storage_path, mime_type, file_size, asset_type")
    .single();

  if (error) {
    // The file landed but the row did not. Remove the orphan rather than
    // leaving a byte-paying object nothing can ever find.
    await supabase.storage.from("brand-assets").remove([key]);
    console.error("[assets] metadata insert failed:", error.message);
    return NextResponse.json({ error: "The file uploaded but could not be recorded." }, { status: 500 });
  }

  return NextResponse.json({ asset: data });
}

/** GET ?path=… — mint a short-lived signed URL for one asset. */
export async function GET(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "No path." }, { status: 400 });

  const supabase = await createSupabaseServerClient();

  // Only paths this admin can already see as a row. Signing an arbitrary
  // string would turn this route into a way to read the whole bucket.
  const { data: asset } = await supabase
    .from("content_assets")
    .select("id")
    .eq("storage_path", path)
    .maybeSingle();

  if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data, error } = await supabase.storage
    .from("brand-assets")
    .createSignedUrl(path, 300);

  if (error || !data) {
    return NextResponse.json({ error: "Could not sign that asset." }, { status: 502 });
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: 300 });
}
