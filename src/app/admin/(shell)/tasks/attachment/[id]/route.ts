import { NextResponse } from "next/server";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens a task attachment through a short-lived signed URL.
 *
 * The bucket is private and stays private. A client's file on a guessable
 * public URL would be a leak with their name on it, so this mints a link that
 * expires in ten minutes instead.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("task_attachments")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const path = data?.storage_path as string | undefined;
  if (!path) {
    return NextResponse.json({ error: "That file no longer exists." }, { status: 404 });
  }

  const { data: signed } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(path, 600);

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "Could not open that file." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
