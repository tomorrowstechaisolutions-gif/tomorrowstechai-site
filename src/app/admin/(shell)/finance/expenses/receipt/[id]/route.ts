import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RECEIPT_BUCKET } from "@/lib/finance/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens a stored receipt through a ten-minute signed URL. The bucket stays private. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  const { id } = await params;
  const db = supabaseAdmin();
  const { data } = await db.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  if (!data?.receipt_path) return NextResponse.json({ error: "No receipt on that expense." }, { status: 404 });
  const { data: signed } = await db.storage.from(RECEIPT_BUCKET).createSignedUrl(data.receipt_path, 600);
  if (!signed?.signedUrl) return NextResponse.json({ error: "Could not open that receipt." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
