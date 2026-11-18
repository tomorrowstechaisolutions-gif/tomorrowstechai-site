import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminUser } from "@/lib/supabase/server";
import { getAttachment, getThread } from "@/lib/google/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Downloads one Gmail attachment, admin-only.
 *
 * The filename and type come from the message itself (looked up by thread),
 * never from the query string, and the file is always sent as a download so
 * an HTML attachment cannot run on this site's origin.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  const t = req.nextUrl.searchParams.get("t") ?? "";
  const m = req.nextUrl.searchParams.get("m") ?? "";
  const a = req.nextUrl.searchParams.get("a") ?? "";
  if (!t || !m || !a) return NextResponse.json({ error: "Missing attachment." }, { status: 400 });

  try {
    const thread = await getThread(t);
    const att = thread.messages.find((msg) => msg.id === m)?.attachments.find((x) => x.attachmentId === a);
    if (!att) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    const data = await getAttachment(m, a);
    const safeName = att.filename.replace(/[^\w.\- ()]/g, "_").slice(0, 150) || "attachment";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not download." }, { status: 502 });
  }
}
