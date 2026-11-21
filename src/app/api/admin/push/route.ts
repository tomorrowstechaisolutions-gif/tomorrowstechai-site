import { NextResponse } from "next/server";
import { pushMessage, readSubscription } from "@/lib/push/message";
import { pushConfigured, pushToAll } from "@/lib/push/send";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/server";

/**
 * Phone alerts for an admin's own devices.
 *   POST   { subscription }            sign this device up
 *   POST   { test: true }              send a test alert to every signed-up device
 *   DELETE { endpoint }                stop alerts on this device
 * Only a signed-in admin can call any of these.
 */

export async function POST(request: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Phone alerts are not set up on the server yet." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { subscription?: unknown; test?: unknown } | null;

  if (body?.test === true) {
    const result = await pushToAll({ ...pushMessage("lead.guide", "This is a test alert from your admin.", "/admin/system/notifications"), title: "Test alert" });
    return NextResponse.json(result);
  }

  const device = readSubscription(body?.subscription);
  if (!device) return NextResponse.json({ error: "That device could not be signed up." }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from("push_subscriptions")
    .upsert({ ...device, user_id: session.user.id, user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: `Could not save this device: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });
  const { error } = await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
