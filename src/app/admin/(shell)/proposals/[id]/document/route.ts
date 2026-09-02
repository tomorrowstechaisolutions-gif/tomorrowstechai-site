import { NextResponse } from "next/server";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/proposals/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the admin a short-lived link to the frozen signed document.
 *
 * The bucket is private and stays private: this mints a signed URL that
 * expires in ten minutes rather than ever making the object public. A signed
 * contract on a guessable URL would be a leak with the client's name on it.
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
    .from("proposals")
    .select("signed_document_path")
    .eq("id", id)
    .maybeSingle();

  const path = data?.signed_document_path as string | undefined;
  if (!path) {
    return NextResponse.json(
      { error: "This proposal has no signed document." },
      { status: 404 }
    );
  }

  const url = await signedDocumentUrl(supabase, path, 600);
  if (!url) {
    return NextResponse.json(
      { error: "Could not open the signed document." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(url);
}
