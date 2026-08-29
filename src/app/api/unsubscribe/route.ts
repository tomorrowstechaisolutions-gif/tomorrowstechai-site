import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/campaign/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Tomorrow's Tech AI</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#04070D;color:#E9EFF7;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}
 .c{max-width:420px;border:1px solid #1B2739;border-radius:16px;padding:28px;background:#0A111C}
 h1{font-size:1.25rem;margin:0 0 10px}
 p{color:#94A3B8;margin:0 0 14px}
 a{color:#60A5FA}
</style></head><body><div class="c"><h1>${title}</h1><p>${body}</p>
<p><a href="https://tomorrowstechai.com">tomorrowstechai.com</a></p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * One click, no login, no confirmation step. Anything more than this and
 * people mark it as spam instead, which is worse for everyone.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("t") ?? "";

  if (!id || !token || !supabaseConfigured() || !verifyUnsubscribe(id, token)) {
    return page(
      "That link didn't work",
      "It may have expired. Email john@tomorrowstechai.com and we'll take you off the list by hand — no questions.",
      400
    );
  }

  const db = supabaseAdmin();
  const now = new Date().toISOString();

  await db
    .from("leads")
    .update({ unsubscribed_at: now, email_consent: false, do_not_contact: true })
    .eq("id", id);

  await db
    .from("lead_followups")
    .update({ status: "cancelled", error: "unsubscribed" })
    .eq("lead_id", id)
    .eq("status", "pending");

  await db.from("lead_events").insert({
    lead_id: id,
    type: "system",
    body: "Unsubscribed from follow-up emails via the one-click link.",
    actor: "lead",
  });

  return page(
    "You're unsubscribed",
    "No more follow-up emails from us. If you did want a $399 Business Launch after all, just reply to any earlier email and we'll pick it back up."
  );
}

/**
 * Gmail and Outlook's one-click unsubscribe POSTs to the same URL with the
 * query string intact. Without this, the button in the mail client fails and
 * people reach for "report spam" instead.
 */
export async function POST(req: Request) {
  return GET(req);
}
