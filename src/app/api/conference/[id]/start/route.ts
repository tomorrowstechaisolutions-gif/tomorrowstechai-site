import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getZoomMeeting, ZoomApiError } from "@/lib/zoom/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start as host.
 *
 * Zoom's `start_url` carries the host's ZAK token and expires, so it is never
 * stored. This route — admin-only — asks Zoom for a fresh one at the moment
 * of the click and redirects the tab straight into the Zoom client / web
 * client. The URL exists in exactly one place: this redirect's Location
 * header, sent to the admin who asked for it.
 */
function back(request: NextRequest, id: string, error: string): NextResponse {
  const base = request.nextUrl.origin;
  return NextResponse.redirect(
    new URL(`/admin/conference-center?conference=${encodeURIComponent(id)}&error=${encodeURIComponent(error.slice(0, 240))}`, base)
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", request.nextUrl.origin));
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return back(request, id, "That conference id is not valid.");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("meetings")
    .select("id, provider, provider_event_id, status")
    .eq("id", id)
    .maybeSingle();

  const meeting = data as { id: string; provider: string; provider_event_id: string | null; status: string } | null;
  if (!meeting) return back(request, id, "That conference no longer exists.");
  if (meeting.provider !== "zoom" || !meeting.provider_event_id) {
    return back(request, id, "This conference has no Zoom meeting behind it. Retry the Zoom sync first.");
  }
  if (meeting.status === "cancelled") return back(request, id, "This conference was cancelled.");

  try {
    const zoom = await getZoomMeeting(meeting.provider_event_id);
    if (!zoom.start_url) return back(request, id, "Zoom did not return a host start link.");

    if (meeting.status === "scheduled" || meeting.status === "confirmed") {
      await supabase.from("meetings").update({ status: "in_progress" }).eq("id", meeting.id);
    }

    const response = NextResponse.redirect(zoom.start_url);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    const message = error instanceof ZoomApiError || error instanceof Error
      ? error.message
      : "Zoom could not start the meeting.";
    return back(request, id, message);
  }
}
