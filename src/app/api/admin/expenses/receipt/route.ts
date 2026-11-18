import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chicagoDate } from "@/lib/time/chicago";
import { bankCandidates, readReceipt, RECEIPT_BUCKET, RECEIPT_MAX_BYTES, RECEIPT_TYPES, type ReceiptRead } from "@/lib/finance/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One receipt in, one expense (needs review) out.
 *
 * The client posts files one at a time so each gets its own progress line
 * and a slow read never times out a batch. Optional `bank_transaction_id`
 * attaches the receipt to a specific Mercury charge.
 */
export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "No file received." }, { status: 400 });
  const ext = RECEIPT_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a photo (JPG, PNG, WebP, HEIC) or a PDF." }, { status: 400 });
  if (file.size > RECEIPT_MAX_BYTES) return NextResponse.json({ error: "That file is over 4 MB. Use a smaller photo or PDF." }, { status: 400 });
  const wantedBank = typeof form?.get("bank_transaction_id") === "string" ? String(form!.get("bank_transaction_id")) : "";

  const db = supabaseAdmin();
  const today = chicagoDate();
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${today.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const stored = await db.storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (stored.error) return NextResponse.json({ error: `Couldn't store the receipt: ${stored.error.message}` }, { status: 500 });

  let read: ReceiptRead | null = null;
  let readError: string | null = null;
  try {
    read = await readReceipt(bytes, file.type, file.name);
  } catch (cause) {
    readError = cause instanceof Error ? cause.message : "Couldn't read the receipt.";
  }

  // Same order uploaded twice (e.g. the email and the invoice PDF): keep one.
  const externalId = read?.order_number && read.vendor
    ? `order:${read.vendor.toLowerCase().replace(/[^a-z0-9]+/g, "")}:${read.order_number.replace(/\s+/g, "")}`
    : null;
  if (externalId) {
    const { data: dup } = await db.from("expenses").select("id, vendor, occurred_at").eq("external_id", externalId).maybeSingle();
    if (dup) {
      await db.storage.from(RECEIPT_BUCKET).remove([path]);
      return NextResponse.json({ duplicate: true, id: dup.id, message: `Already have ${dup.vendor ?? "this"} order ${read!.order_number}.` });
    }
  }

  // Paid from Mercury if a matching charge exists; otherwise assume personal
  // (John can switch it while reviewing).
  let bankId: string | null = null;
  if (wantedBank) bankId = wantedBank;
  else if (read?.total_cents) {
    const matches = await bankCandidates(db, read.total_cents, read.date);
    if (matches.length === 1) bankId = matches[0].id;
  }

  const { data: row, error } = await db.from("expenses").insert({
    occurred_at: read?.date ?? today,
    vendor: read?.vendor ?? null,
    description: read?.description ?? file.name,
    amount_cents: Math.max(0, read?.total_cents ?? 0),
    tax_cents: read?.tax_cents ?? null,
    category: read?.category ?? "other",
    items: read?.items ?? [],
    business: "ttai",
    paid_with: bankId ? "business" : "personal",
    bank_transaction_id: bankId,
    review_status: "needs_review",
    source: "receipt",
    receipt_path: path,
    receipt_mime: file.type,
    receipt_name: file.name.slice(0, 200),
    external_id: externalId,
    ai_read: read ? { ...read, model: process.env.RECEIPT_MODEL || "gpt-5.4-mini" } : { error: readError },
    notes: read?.notes ?? (readError ? `Couldn't read automatically: ${readError}` : null),
  }).select("id").single();
  if (error) {
    await db.storage.from(RECEIPT_BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/admin/finance/expenses");
  revalidatePath("/admin/finance");
  return NextResponse.json({
    id: row.id,
    vendor: read?.vendor ?? null,
    totalCents: read?.total_cents ?? null,
    matchedBank: Boolean(bankId),
    readError,
  });
}
