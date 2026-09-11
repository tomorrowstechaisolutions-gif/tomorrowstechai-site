import { NextResponse } from "next/server";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadCatalogSnapshot } from "@/lib/ad-studio/core";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminUser(); if (!session) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try { return NextResponse.json({ snapshot: await loadCatalogSnapshot(await createSupabaseServerClient(), (await params).id) }); }
  catch { return NextResponse.json({ error: "Catalog details could not be loaded." }, { status: 404 }); }
}
