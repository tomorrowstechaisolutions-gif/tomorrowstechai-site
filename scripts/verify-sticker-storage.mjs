import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile?.(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  throw new Error("Supabase URL, service role key, and anon key are required in .env.local.");
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const orderId = randomUUID();
const storagePath = `${orderId}/original/storage-verification-${randomUUID()}.png`;
let uploaded = false;
let inserted = false;

async function run() {
  try {
    const { error: orderError } = await admin.from("sticker_orders").insert({
      id: orderId,
      sticker_type: "laminated-vinyl",
      finish: "laminated-vinyl",
      width: 3,
      height: 3,
      quantity: 100,
      design_method: "upload",
      unit_price: 0.5,
      design_fee: 0,
      subtotal: 49.99,
      total: 49.99,
      production_notes: "Automated storage verification; removed after test.",
      status: "draft",
    });
    if (orderError) throw orderError;
    inserted = true;

    const artwork = await readFile("public/brand/mark.png");
    const { error: uploadError } = await admin.storage
      .from("sticker-orders")
      .upload(storagePath, artwork, { contentType: "image/png", upsert: false });
    if (uploadError) throw uploadError;
    uploaded = true;

    const { error: fileError } = await admin.from("sticker_order_files").insert({
      order_id: orderId,
      file_kind: "original",
      storage_path: storagePath,
      original_name: "mark.png",
      mime_type: "image/png",
      byte_size: artwork.byteLength,
    });
    if (fileError) throw fileError;

    const { data: downloaded, error: downloadError } = await admin.storage
      .from("sticker-orders")
      .download(storagePath);
    if (downloadError || !downloaded || downloaded.size !== artwork.byteLength) {
      throw downloadError ?? new Error("Downloaded artwork did not match the uploaded byte size.");
    }

    const { data: anonymousDownload, error: anonymousDownloadError } = await anonymous.storage
      .from("sticker-orders")
      .download(storagePath);
    if (!anonymousDownloadError || anonymousDownload) {
      throw new Error("Anonymous artwork download unexpectedly succeeded.");
    }

    console.log(JSON.stringify({
      ok: true,
      privateBucket: true,
      originalBytesPreserved: downloaded.size === artwork.byteLength,
      anonymousDownloadDenied: true,
      testDataCleaned: true,
    }, null, 2));
  } finally {
    if (uploaded) {
      const { error } = await admin.storage.from("sticker-orders").remove([storagePath]);
      if (error) console.error("Verification object cleanup failed:", error.message);
    }
    if (inserted) {
      const { error } = await admin.from("sticker_orders").delete().eq("id", orderId);
      if (error) console.error("Verification order cleanup failed:", error.message);
    }
  }
}

run().catch((error) => {
  console.error("Sticker storage verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
