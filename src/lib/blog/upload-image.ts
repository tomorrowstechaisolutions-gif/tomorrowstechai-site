"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Uploads an article image straight from the browser to the public
 * "field-notes" bucket. Going direct avoids the serverless request-size limit;
 * the bucket's storage policies only let admins write.
 */

const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};
const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadArticleImage(file: File, slug: string): Promise<{ url: string } | { error: string }> {
  const ext = TYPES[file.type];
  if (!ext) return { error: "Use a PNG, JPEG, WebP, AVIF or GIF image." };
  if (file.size > MAX_BYTES) return { error: "That image is over 10 MB. Export a smaller WebP or JPEG." };

  const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug.slice(0, 60) : "article";
  const base =
    file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
  const month = new Date().toISOString().slice(0, 7);
  const path = `${month}/${safeSlug}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from("field-notes").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { error: `Upload failed: ${error.message}` };
  return { url: supabase.storage.from("field-notes").getPublicUrl(path).data.publicUrl };
}
